import { POINTS, REMINDERS } from "../reports.js";
import { config } from "../config.js";
import { log } from "./logger.js";
import { getStartKeyboard, getEndKeyboard, getFinishReportKeyboard } from "./keyboards.js";
import { userState } from "./state.js";
import { scheduleReminders } from "./reminders.js";

const { ADMIN_CHAT_ID } = config;

// --- Склонение слова "отчет" ---
function declension(count) {
  if (count % 10 === 1 && count % 100 !== 11) return "отчет";
  if ([2,3,4].includes(count % 10) && ![12,13,14].includes(count % 100)) return "отчета";
  return "отчетов";
}

// --- /start ---
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

// --- /end ---
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

// --- Callback ---
export function handleCallback(bot, query) {
  const chatId = query.message.chat.id;
  const data = query.data;
  let state = userState[chatId];

  // --- Выбор точки ---
  if (data.startsWith("point:")) {
    const pointName = data.split(":")[1];
    if (!POINTS[pointName]) {
      bot.answerCallbackQuery(query.id, { text: "Точка не найдена" });
      return;
    }

    state = {
      step: "enter_password",
      point: pointName,
      verified: false,
      pendingReminders: [],
      reportBuffer: [],
      lastReminder: null,
      reminderTimer: null,
      _lastMsgId: null
    };
    userState[chatId] = state;

    bot.sendMessage(chatId, `Введите пароль для точки: ${pointName}`);
    bot.answerCallbackQuery(query.id);
    log(`Пользователь ${chatId} выбрал точку "${pointName}"`);
    return;
  }

  // --- Выбор отчета ---
  if (data.startsWith("report:")) {
    if (!state) {
      bot.answerCallbackQuery(query.id);
      return;
    }

    const key = data.split(":")[1];
    const reminder = REMINDERS.find(r => r.key === key);
    if (!reminder) {
      bot.answerCallbackQuery(query.id);
      return;
    }

    state.lastReminder = reminder.name;
    state.pendingReminders = state.pendingReminders.filter(r => r !== reminder.name);

    bot.sendMessage(chatId, `Вы выбрали отчет: "${reminder.name}". Отправьте текст, фото или видео.`, getFinishReportKeyboard());
    bot.answerCallbackQuery(query.id);
    log(`Пользователь ${chatId} выбрал отчет "${reminder.name}"`);
  }

  // --- Завершение отчета ---
  if (data === "finish_report") {
    if (!state || !state.lastReminder || !state.reportBuffer || state.reportBuffer.length === 0) {
      bot.answerCallbackQuery(query.id, { text: "Нет контента для отправки." });
      return;
    }

    // Формируем текст с заголовком + все тексты
    let combinedText = `Отчет "${state.lastReminder}" с точки ${state.point}\n\n`;
    state.reportBuffer.forEach(item => {
      if (item.text) {
        const senderLink = item.from.username ? '@' + item.from.username : item.from.first_name;
        combinedText += `${senderLink}: ${item.text}\n`;
      }
    });

    bot.sendMessage(ADMIN_CHAT_ID, combinedText.trim()).then(async () => {
      // --- Сбор фото и видео ---
      const mediaGroup = [];
      state.reportBuffer.forEach(item => {
        const senderLink = item.from.username ? '@' + item.from.username : item.from.first_name;

        if (item.photo && item.photo.length > 0) {
          item.photo.forEach(f => mediaGroup.push({ type: "photo", media: f, caption: item.text || `${senderLink}: Фото` }));
        }
        if (item.video && item.video.length > 0) {
          item.video.forEach(f => mediaGroup.push({ type: "video", media: f, caption: item.text || `${senderLink}: Видео` }));
        }
      });

      if (mediaGroup.length > 0) {
        await bot.sendMediaGroup(ADMIN_CHAT_ID, mediaGroup);
      }

      bot.sendMessage(chatId, "✅ Отчет отправлен.");
      state.reportBuffer = [];
      state.lastReminder = null;

      // --- Проверка оставшихся отчетов ---
      if (state.pendingReminders.length > 0) {
        const count = state.pendingReminders.length;
        const word = declension(count);

        const buttons = state.pendingReminders.map(rName => [{ text: rName, callback_data: `report:${REMINDERS.find(r => r.name === rName).key}` }]);
        bot.sendMessage(chatId, `Есть еще ${count} незавершенных ${word}, выберите один для отправки:`, {
          reply_markup: { inline_keyboard: buttons }
        });
      }
    });

    bot.answerCallbackQuery(query.id);
    log(`Пользователь ${chatId} завершил отчет`);
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

  // --- Сбор контента в отчет ---
  if (state.verified && state.lastReminder) {
    if (!state.reportBuffer) state.reportBuffer = [];

    const existingItem = state.reportBuffer.find(
      item => item.from.id === msg.from.id && !item.sent
    );

    let item;
    if (existingItem) {
      item = existingItem;
      // Обновляем текст если есть
      if (msg.text || msg.caption) {
        item.text = (item.text ? item.text + "\n" : "") + msg.text || msg.caption;
      }
    } else {
      item = { from: msg.from, text: msg.text || msg.caption || null, photo: [], video: [], sent: false };
      state.reportBuffer.push(item);
    }

    if (msg.photo && msg.photo.length > 0) {
      msg.photo.forEach(f => {
        if (!item.photo.includes(f.file_id)) item.photo.push(f.file_id);
      });
    }

    if (msg.video) {
      if (!item.video.includes(msg.video.file_id)) item.video.push(msg.video.file_id);
    }

    // --- Один раз отправляем сообщение пользователю о добавлении контента ---
    if (!state._lastMsgId || state._lastMsgId !== msg.message_id) {
      state._lastMsgId = msg.message_id;
      bot.sendMessage(chatId, "Контент добавлен в отчет. Когда закончите, нажмите «Завершить отчет».", getFinishReportKeyboard());
      log(`Пользователь ${chatId} добавил контент к отчету "${state.lastReminder}"`);
    }
  }
}
