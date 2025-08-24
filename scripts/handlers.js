import { POINTS, REMINDERS } from "../reports.js";
import { config } from "../config.js";
import { log } from "./logger.js";
import { getStartKeyboard, getEndKeyboard } from "./keyboards.js";
import { userState } from "./state.js";
import { sendPendingReports, scheduleReminders } from "./reminders.js";

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
    bot.sendMessage(chatId, "Смена не активна. Нажмите /start для новой смены.", getStartKeyboard());
    return;
  }

  if (state.reminderTimer) {
    clearTimeout(state.reminderTimer);
    state.reminderTimer = null;
  }

  state.pendingReminders = [];
  state.verified = false;
  state.step = null;
  state.lastReminder = null;
  state.reportBuffer = [];

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
    log(`Пользователь ${chatId} выбрал точку "${pointName}" через inline кнопку`);
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
    if (!state.reportBuffer) state.reportBuffer = [];

    bot.sendMessage(chatId, `Вы выбрали отчет: "${reminder.name}". Отправьте фото или текст.`, {
      reply_markup: { inline_keyboard: [[{ text: 'Завершить отчет', callback_data: 'finish_report' }]] },
    });
    bot.answerCallbackQuery(query.id);
    log(`Пользователь ${chatId} выбрал отчет "${reminder.name}"`);
  }

  if (data === "finish_report" && state && state.reportBuffer && state.reportBuffer.length > 0) {
    const reminderName = state.lastReminder;
    const senderLink = `[${query.from.username ? '@'+query.from.username : query.from.first_name}](tg://user?id=${query.from.id})`;
    const forwardText = `Отчет "${reminderName}" с точки ${state.point}\n\nОтправил: ${senderLink}`;

    state.reportBuffer.forEach(item => {
      if (typeof item === "string") {
        bot.sendMessage(ADMIN_CHAT_ID, `${forwardText}\n\n${item}`, { parse_mode: "Markdown" });
      } else {
        bot.sendPhoto(ADMIN_CHAT_ID, item, { caption: forwardText, parse_mode: "Markdown" });
      }
    });

    state.reportBuffer = [];
    state.lastReminder = null;

    bot.sendMessage(chatId, "✅ Отчет отправлен.");

    if (state.pendingReminders.length > 0) sendPendingReports(bot, chatId);
  }
}

export function handleMessage(bot, msg) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const state = userState[chatId];

  if (!state) return;

  // Проверка пароля
  if (state.step === "enter_password") {
    if (text === POINTS[state.point].password) {
      state.verified = true;
      state.step = "reports";
      state.reportBuffer = [];

      bot.sendMessage(chatId, "Пароль верный! Теперь вы будете получать напоминания об отчетах.", getEndKeyboard());
      log(`Пользователь ${chatId} авторизован для точки "${state.point}"`);

      scheduleReminders(bot, chatId, state.point);
    } else {
      bot.sendMessage(chatId, "Неверный пароль, попробуйте еще раз:");
      log(`Неверный пароль для точки "${state.point}" пользователем ${chatId}`);
    }
    return;
  }

  // Отправка сообщений в текущий отчет
  if (state.verified && state.lastReminder && (msg.text || msg.photo || msg.video)) {
    const messageData = msg.text || (msg.photo ? msg.photo[msg.photo.length - 1].file_id : null) || (msg.video ? msg.video.file_id : null);

    if (messageData) {
      if (!state.reportBuffer) state.reportBuffer = [];
      state.reportBuffer.push(messageData);

      bot.sendMessage(chatId, 'Сообщение добавлено в текущий отчет. Когда закончите, нажмите "Завершить отчет".', {
        reply_markup: { inline_keyboard: [[{ text: 'Завершить отчет', callback_data: 'finish_report' }]] },
      });
    }
  }
}
