import { POINTS, REMINDERS } from "../reports.js";
import { config } from "../config.js";
import { log } from "./logger.js";
import { getStartKeyboard, getEndKeyboard, getFinishReportKeyboard } from "./keyboards.js";
import { userState } from "./state.js";
import { scheduleReminders } from "./reminders.js";

const { ADMIN_CHAT_ID } = config;

export function handleStart(bot, msg) {
  const chatId = msg.chat.id;
  const state = userState[chatId];

  if (state && state.verified) {
    bot.sendMessage(chatId, "Смена уже активна. Для завершения нажмите /end.", getEndKeyboard());
    return;
  }

  bot.sendMessage(chatId, "Нажмите /start, чтобы начать смену.", getStartKeyboard());

  const inlineButtons = Object.keys(POINTS).map(key => [{ text: key, callback_data: `point:${key}` }]);
  bot.sendMessage(chatId, "Выберите точку:", { reply_markup: { inline_keyboard: inlineButtons } });

  log(`Пользователь ${chatId} вызвал /start`);
}

export function handleEnd(bot, msg) {
  const chatId = msg.chat.id;
  const state = userState[chatId];

  if (!state || !state.verified) {
    bot.sendMessage(chatId, "Смена не активна. Нажмите /start, чтобы начать смену.", getStartKeyboard());
    return;
  }

  if (state.reminderTimer) {
    clearTimeout(state.reminderTimer);
    state.reminderTimer = null;
  }

  state.pendingReminders = [];
  state.reportBuffer = [];
  state.verified = false;
  state.step = null;
  state.lastReminder = null;

  bot.sendMessage(chatId, "✅ Смена завершена. Нажмите /start для новой смены.", getStartKeyboard());
  log(`Пользователь ${chatId} завершил смену с помощью /end`);
}

export function handleCallback(bot, query) {
  const chatId = query.message.chat.id;
  const data = query.data;
  const state = userState[chatId];

  if (data.startsWith("point:")) {
    const pointName = data.split(":")[1];
    if (!POINTS[pointName]) return;

    userState[chatId] = { step: "enter_password", point: pointName, verified: false, pendingReminders: [], reminderTimer: null, reportBuffer: [] };
    bot.sendMessage(chatId, `Введите пароль для ${pointName}:`);
    log(`Пользователь ${chatId} выбрал точку "${pointName}"`);
    bot.answerCallbackQuery(query.id);
    return;
  }

  if (data.startsWith("report:")) {
    const key = data.split(":")[1];
    const reminder = REMINDERS.find(r => r.key === key);
    if (!reminder || !state) {
      bot.answerCallbackQuery(query.id);
      return;
    }

    state.lastReminder = reminder.name;
    state.pendingReminders = state.pendingReminders.filter(r => r !== reminder.name);

    bot.sendMessage(chatId, `Вы выбрали отчет: "${reminder.name}". Отправьте текст, фото или видео.`, getFinishReportKeyboard());
    bot.answerCallbackQuery(query.id);
    log(`Пользователь ${chatId} выбрал отчет "${reminder.name}"`);
  }

  if (data === "finish_report") {
    if (!state || !state.lastReminder || !state.reportBuffer || state.reportBuffer.length === 0) {
      bot.answerCallbackQuery(query.id, { text: "Нет контента для отправки." });
      return;
    }

    // --- Формируем единый текст с заголовком и всеми текстовыми сообщениями ---
    let combinedText = `Отчет "${state.lastReminder}" с точки ${state.point}\n\n`;
    state.reportBuffer.forEach(item => {
      if (item.text) {
        const senderLink = item.from.username ? '@'+item.from.username : item.from.first_name;
        combinedText += `${senderLink}: ${item.text}\n`;
      }
    });

    bot.sendMessage(ADMIN_CHAT_ID, combinedText.trim()).then(() => {
      // После текста отправляем отдельно фото и видео
      state.reportBuffer.forEach(item => {
        const senderLink = item.from.username ? '@'+item.from.username : item.from.first_name;
        if (item.photo) bot.sendPhoto(ADMIN_CHAT_ID, item.photo, { caption: `${senderLink}: Фото` });
        if (item.video) bot.sendVideo(ADMIN_CHAT_ID, item.video, { caption: `${senderLink}: Видео` });
      });

      bot.sendMessage(chatId, "✅ Отчет отправлен.");
      state.reportBuffer = [];
      state.lastReminder = null;

      if (state.pendingReminders.length > 0) {
        bot.sendMessage(chatId, "Есть еще незавершенные отчеты, выберите один для отправки:");
        // Можно вызвать sendPendingReports(bot, chatId)
      }
    });

    bot.answerCallbackQuery(query.id);
    log(`Пользователь ${chatId} завершил отчет`);
  }
}

export function handleMessage(bot, msg) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const state = userState[chatId];
  if (!state) return;

  // --- Проверка пароля ---
  if (state.step === "enter_password") {
    if (text === POINTS[state.point].password) {
      state.verified = true;
      state.step = "reports";

      bot.sendMessage(chatId, "Пароль верный! Теперь вы будете получать напоминания об отчетах.", getEndKeyboard());
      log(`Пользователь ${chatId} авторизован для точки "${state.point}"`);

      scheduleReminders(bot, chatId, state.point);
    } else {
      bot.sendMessage(chatId, "Неверный пароль, попробуйте еще раз:");
      log(`Неверный пароль для точки "${state.point}" пользователем ${chatId}`);
    }
    return;
  }

  // --- Сбор контента в отчет ---
  if (state.verified && state.lastReminder) {
    if (!state.reportBuffer) state.reportBuffer = [];

    const item = { from: msg.from };
    if (msg.text) item.text = msg.text;
    if (msg.photo) item.photo = msg.photo[msg.photo.length - 1].file_id;
    if (msg.video) item.video = msg.video.file_id;

    state.reportBuffer.push(item);

    bot.sendMessage(chatId, "Контент добавлен в отчет. Когда закончите, нажмите «Завершить отчет».", getFinishReportKeyboard());
    log(`Пользователь ${chatId} добавил контент к отчету "${state.lastReminder}"`);
  }
}
