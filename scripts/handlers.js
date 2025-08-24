import { POINTS, REMINDERS } from "../reports.js";
import { config } from "../config.js";
import { log } from "./logger.js";
import { getStartKeyboard, getEndKeyboard } from "./keyboards.js";
import { userState } from "./state.js";
import { scheduleReminders, sendPendingReports } from "./reminders.js";

const { ADMIN_CHAT_ID } = config;

function escapeMarkdownV2(text) {
  if (!text) return "";
  return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

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

  if (state.reminderTimer) clearTimeout(state.reminderTimer);

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
    if (!reminder || !userState[chatId]) {
      bot.answerCallbackQuery(query.id);
      return;
    }

    const state = userState[chatId];
    state.lastReminder = reminder.name;
    state.pendingReminders = state.pendingReminders.filter(r => r !== reminder.name);

    bot.sendMessage(chatId, `Вы выбрали отчет: "${reminder.name}". Отправьте фото, видео или текст.`);
    bot.answerCallbackQuery(query.id);
    log(`Пользователь ${chatId} выбрал отчет "${reminder.name}"`);
  }
}

export function handleMessage(bot, msg) {
  const chatId = msg.chat.id;
  const state = userState[chatId];
  if (!state) return;

  // --- Проверка пароля ---
  if (state.step === "enter_password") {
    if (msg.text === POINTS[state.point].password) {
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

  // --- Сбор сообщений в буфер ---
  if (state.verified && state.lastReminder) {
    if (!state.reportBuffer) state.reportBuffer = [];
    state.reportBuffer.push({
      text: msg.text,
      photo: msg.photo ? msg.photo[msg.photo.length - 1].file_id : null,
      video: msg.video ? msg.video.file_id : null,
      from: msg.from,
    });

    bot.sendMessage(chatId, "✅ Контент добавлен в отчет. Когда закончите, нажмите «Завершить отчет».");
  }
}

// --- Функция завершения отчета ---
export function handleFinishReport(bot, chatId) {
  const state = userState[chatId];
  if (!state || !state.lastReminder || !state.reportBuffer || state.reportBuffer.length === 0) {
    bot.sendMessage(chatId, "⚠️ Нет данных для отправки.");
    return;
  }

  let reportText = `Отчет "${escapeMarkdownV2(state.lastReminder)}" с точки ${escapeMarkdownV2(state.point)}\n\n`;

  state.reportBuffer.forEach(item => {
    const senderLink = `[${item.from.username ? '@'+item.from.username : escapeMarkdownV2(item.from.first_name)}](tg://user?id=${item.from.id})`;
    if (item.text) reportText += `${senderLink}:\n${escapeMarkdownV2(item.text)}\n\n`;
    if (item.photo) reportText += `${senderLink}: [Фото]\n\n`;
    if (item.video) reportText += `${senderLink}: [Видео]\n\n`;
  });

  bot.sendMessage(ADMIN_CHAT_ID, reportText, { parse_mode: "MarkdownV2" })
    .then(() => {
      bot.sendMessage(chatId, "✅ Отчет отправлен!");
      state.lastReminder = null;
      state.reportBuffer = [];
    })
    .catch(err => {
      console.error("Ошибка при отправке отчета:", err);
      bot.sendMessage(chatId, "❌ Ошибка при отправке отчета.");
    });
}
