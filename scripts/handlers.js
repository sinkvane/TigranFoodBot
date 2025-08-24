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
    _lastMsgId: null
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

  state.verified = false;
  state.step = null;
  state.point = null;
  state.lastReminder = null;
  state.reportBuffer = [];
  state.pendingReminders = [];
  state._lastMsgId = null;

  bot.sendMessage(chatId, "✅ Смена завершена. Нажмите /start для новой смены.", getStartKeyboard());
  log(`Пользователь ${chatId} завершил смену`);
}

// --- обработка сообщений ---
export function handleMessage(bot, msg) {
  const chatId = msg.chat.id;
  const state = userState[chatId];
  if (!state) return;

  // === Ввод пароля ===
  if (state.step === "enter_password") {
    const point = Object.keys(POINTS).find(p => p === msg.text);
    if (point) {
      state.point = point;
      bot.sendMessage(chatId, `Введите пароль для ${point}:`);
      return;
    }

    if (state.point && msg.text === POINTS[state.point].password) {
      state.verified = true;
      state.step = "reports";
      state.pendingReminders = [];
      state.reportBuffer = [];
      log(`Пользователь ${chatId} авторизован для точки "${state.point}"`);
      bot.sendMessage(chatId, "Пароль верный! Теперь вы будете получать напоминания об отчетах.", getEndKeyboard());

      // Сразу запускаем cron только после авторизации
      scheduleReminders(bot, chatId, state.point);
    } else if (state.point) {
      bot.sendMessage(chatId, "Неверный пароль, попробуйте еще раз:");
    }
    return;
  }

  // === Сбор отчёта ===
  if (state.verified && state.lastReminder) {
    if (!state.reportBuffer) state.reportBuffer = [];

    const item = { from: msg.from, text: msg.caption || msg.text || null, photo: [], video: [] };

    // фото: берём только самое большое
    if (msg.photo && msg.photo.length > 0) {
      item.photo.push(msg.photo[msg.photo.length - 1].file_id);
    }

    // видео
    if (msg.video) {
      item.video.push(msg.video.file_id);
    }

    state.reportBuffer.push(item);

    // отвечаем один раз
    if (!state._lastMsgId || state._lastMsgId !== msg.message_id) {
      state._lastMsgId = msg.message_id;
      bot.sendMessage(chatId, "Контент добавлен в отчет. Когда закончите, нажмите «Завершить отчет».", getFinishReportKeyboard());
    }
  }
}

// --- callback для кнопок ---
export function handleCallback(bot, query) {
  const chatId = query.message.chat.id;
  const state = userState[chatId];
  if (!state) return;

  const data = query.data;

  if (data.startsWith("report:")) {
    const reminderName = data.split(":")[1];
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

    // предложить следующий из очереди
    if (state.pendingReminders.length > 0) {
      if (state.pendingReminders.length === 1) {
        const next = state.pendingReminders[0];
        state.lastReminder = next;
        state.pendingReminders = [];
        bot.sendMessage(chatId, `Следующий отчёт: "${next}". Отправьте фото/видео и нажмите «Завершить отчет».`, getFinishReportKeyboard());
      } else {
        const buttons = state.pendingReminders.map(r => [{ text: r, callback_data: `report:${r}` }]);
        bot.sendMessage(chatId, "У вас остались непройденные отчёты:", {
          reply_markup: { inline_keyboard: buttons },
        });
      }
    }
  }

  bot.answerCallbackQuery(query.id);
}
