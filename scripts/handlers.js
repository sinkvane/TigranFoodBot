// handlers.js
import { POINTS, REMINDERS } from "../reports.js";
import { getEndKeyboard, getFinishReportKeyboard, getStartKeyboard } from "./keyboards.js";
import { scheduleReminders } from "./reminders.js";
import { log } from "./logger.js";

export const userState = {};

// --- /start ---
export function handleStart(bot, msg) {
  const chatId = msg.chat.id;
  const state = userState[chatId] || {
    step: "enter_password",
    point: null,
    verified: false,
    pendingReminders: [],
    reportBuffer: [],
    lastReminder: null,
    _lastMsgId: null,
  };
  userState[chatId] = state;

  const pointNames = Object.keys(POINTS).map(p => [{ text: p }]);
  bot.sendMessage(chatId, "Выберите точку:", {
    reply_markup: { keyboard: pointNames, resize_keyboard: true, one_time_keyboard: true },
  });
}

// --- /end ---
export function handleEnd(bot, msg) {
  const chatId = msg.chat.id;
  const state = userState[chatId];
  if (!state || !state.verified) {
    bot.sendMessage(chatId, "Смена не активна. Нажмите /start для начала смены.", getStartKeyboard());
    return;
  }

  // сброс всех данных
  Object.assign(state, {
    verified: false,
    step: null,
    point: null,
    lastReminder: null,
    reportBuffer: [],
    pendingReminders: [],
    _lastMsgId: null
  });

  bot.sendMessage(chatId, "✅ Смена завершена. Нажмите /start для новой смены.", getStartKeyboard());
  log(`Пользователь ${chatId} завершил смену`);
}

// --- handleMessage ---
export function handleMessage(bot, msg) {
  const chatId = msg.chat.id;
  const state = userState[chatId];
  if (!state) return;

  // === Ввод пароля / выбор точки ===
  if (state.step === "enter_password") {
    if (!state.point) {
      const point = Object.keys(POINTS).find(p => p === msg.text);
      if (point) {
        state.point = point;
        bot.sendMessage(chatId, `Введите пароль для ${point}:`);
        return;
      } else {
        bot.sendMessage(chatId, "Выберите точку из списка выше:");
        return;
      }
    }

    if (msg.text === POINTS[state.point].password) {
      state.verified = true;
      state.step = "reports";
      state.pendingReminders = [];
      state.reportBuffer = [];
      log(`Пользователь ${chatId} авторизован для точки "${state.point}"`);
      bot.sendMessage(chatId, "Пароль верный! Теперь вы будете получать напоминания об отчетах.", getEndKeyboard());
      scheduleReminders(bot, chatId, state.point);
    } else {
      bot.sendMessage(chatId, "Неверный пароль, попробуйте еще раз:");
    }
    return;
  }

  // === Сбор отчёта ===
  if (state.verified && state.lastReminder) {
    const item = { from: msg.from, text: msg.caption || msg.text || null, photo: [], video: [] };

    if (msg.photo && msg.photo.length > 0) item.photo.push(msg.photo[msg.photo.length - 1].file_id);
    if (msg.video) item.video.push(msg.video.file_id);

    state.reportBuffer.push(item);

    if (!state._lastMsgId || state._lastMsgId !== msg.message_id) {
      state._lastMsgId = msg.message_id;
      bot.sendMessage(chatId, "Контент добавлен в отчет. Когда закончите, нажмите «Завершить отчет».", getFinishReportKeyboard());
    }
  }
}

// --- handleCallback ---
export function handleCallback(bot, query) {
  const chatId = query.message.chat.id;
  const state = userState[chatId];
  if (!state) return;

  const data = query.data;

  if (data.startsWith("report:")) {
    const reminderName = REMINDERS.find(r => r.key === data.split(":")[1])?.name;
    if (!reminderName) return;

    state.lastReminder = reminderName;
    state.reportBuffer = [];
    state.pendingReminders = state.pendingReminders.filter(r => r !== reminderName);

    bot.sendMessage(chatId, `Вы начали отчет: ${reminderName}. Отправьте фото/видео и нажмите «Завершить отчет».`, getFinishReportKeyboard());
  }

  if (data === "finish_report") {
    if (!state.reportBuffer || state.reportBuffer.length === 0) {
      bot.sendMessage(chatId, "Вы ничего не добавили в отчет!");
      return;
    }

    console.log("Отчет пользователя:", state.point, state.lastReminder, state.reportBuffer);
    bot.sendMessage(chatId, `Отчет "${state.lastReminder}" завершён ✅`);

    state.reportBuffer = [];
    state.lastReminder = null;
    state._lastMsgId = null;

    if (state.pendingReminders.length > 0) {
      if (state.pendingReminders.length === 1) {
        const next = state.pendingReminders[0];
        state.lastReminder = next;
        state.pendingReminders = [];
        bot.sendMessage(chatId, `Следующий отчёт: "${next}". Отправьте фото/видео и нажмите «Завершить отчет».`, getFinishReportKeyboard());
      } else {
        const buttons = state.pendingReminders.map(r => [{ text: r, callback_data: `report:${REMINDERS.find(rem => rem.name === r)?.key}` }]);
        bot.sendMessage(chatId, "У вас остались непройденные отчёты:", { reply_markup: { inline_keyboard: buttons } });
      }
    }
  }

  bot.answerCallbackQuery(query.id);
}
