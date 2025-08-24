import { POINTS, REMINDERS } from "../reports.js";
import { config } from "../config.js";
import { log } from "./logger.js";
import { getStartKeyboard, getEndKeyboard, getFinishReportKeyboard } from "./keyboards.js";
import { userState } from "./state.js";
import { scheduleReminders } from "./reminders.js";

const { ADMIN_CHAT_ID } = config;

function declension(count) {
  if (count % 10 === 1 && count % 100 !== 11) return "отчет";
  if ([2,3,4].includes(count % 10) && ![12,13,14].includes(count % 100)) return "отчета";
  return "отчетов";
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

  state.pendingReminders = [];
  state.reportBuffer = [];
  state.verified = false;
  state.step = null;
  state.lastReminder = null;
  state._lastMsgId = null;
  state._contentAdded = false;

  bot.sendMessage(chatId, "✅ Смена завершена. Нажмите /start для новой смены.", getStartKeyboard());
  log(`Пользователь ${chatId} завершил смену с помощью /end`);
}

export function handleCallback(bot, query) {
  const chatId = query.message.chat.id;
  const data = query.data;
  let state = userState[chatId];

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
      _lastMsgId: null,
      _contentAdded: false
    };
    userState[chatId] = state;

    bot.sendMessage(chatId, `Введите пароль для точки: ${pointName}`);
    bot.answerCallbackQuery(query.id);
    log(`Пользователь ${chatId} выбрал точку "${pointName}"`);
    return;
  }

  if (data.startsWith("report:")) {
    if (!state) { bot.answerCallbackQuery(query.id); return; }
    const key = data.split(":")[1];
    const reminder = REMINDERS.find(r => r.key === key);
    if (!reminder) { bot.answerCallbackQuery(query.id); return; }

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

    const itemsForReport = state.reportBuffer.filter(i => i.reminder === state.lastReminder && !i.sent);
    if (itemsForReport.length === 0) {
      bot.answerCallbackQuery(query.id, { text: "Нет контента для отправки." });
      return;
    }

    let combinedText = `Отчет "${state.lastReminder}" с точки ${state.point}\n\n`;
    itemsForReport.forEach(item => {
      if (item.text) {
        const senderLink = item.from.username ? '@' + item.from.username : item.from.first_name;
        combinedText += `${senderLink}: ${item.text}\n`;
      }
    });

    bot.sendMessage(ADMIN_CHAT_ID, combinedText.trim()).then(async () => {
      const mediaGroup = [];
      const sentFiles = new Set();

      itemsForReport.forEach(item => {
        const senderLink = item.from.username ? '@' + item.from.username : item.from.first_name;

        if (item.photo) {
          item.photo.forEach(f => {
            if (!sentFiles.has(f)) {
              mediaGroup.push({ type: "photo", media: f, caption: item.text || `${senderLink}: Фото` });
              sentFiles.add(f);
            }
          });
        }
        if (item.video) {
          item.video.forEach(f => {
            if (!sentFiles.has(f)) {
              mediaGroup.push({ type: "video", media: f, caption: item.text || `${senderLink}: Видео` });
              sentFiles.add(f);
            }
          });
        }

        item.sent = true;
      });

      for (let i = 0; i < mediaGroup.length; i += 10) {
        await bot.sendMediaGroup(ADMIN_CHAT_ID, mediaGroup.slice(i, i + 10));
      }

      bot.sendMessage(chatId, "✅ Отчет отправлен.");

      if (state.pendingReminders.length > 0) {
        const count = state.pendingReminders.length;
        const word = declension(count);
        const buttons = state.pendingReminders.map(rName => [{ text: rName, callback_data: `report:${REMINDERS.find(r => r.name === rName).key}` }]);
        bot.sendMessage(chatId, `Есть еще ${count} незавершенных ${word}, выберите один для отправки:`, {
          reply_markup: { inline_keyboard: buttons }
        });
      }

      state.lastReminder = null;
      state._lastMsgId = null;
      state._contentAdded = false;
    });

    bot.answerCallbackQuery(query.id);
    log(`Пользователь ${chatId} завершил отчет`);
  }
}

export function handleMessage(bot, msg) {
  const chatId = msg.chat.id;
  const state = userState[chatId];
  if (!state) return;

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

  if (state.verified && state.lastReminder) {
    if (!state.reportBuffer) state.reportBuffer = [];

    let item = state.reportBuffer.find(
      i => i.from.id === msg.from.id && i.reminder === state.lastReminder && !i.sent
    );

    if (!item) {
      item = { from: msg.from, reminder: state.lastReminder, text: null, photo: [], video: [], sent: false };
      state.reportBuffer.push(item);
    }

    // --- Флаг, сработал ли добавленный контент ---
    let contentAddedNow = false;

    // --- Добавляем текст или caption ---
    if (msg.text || msg.caption) {
      item.text = item.text ? item.text + "\n" : "";
      item.text += msg.text || msg.caption;
      contentAddedNow = true;
    }

    // --- Добавляем фото без дублирования (берем максимальный размер) ---
    if (msg.photo && msg.photo.length > 0) {
      const largestPhotoId = msg.photo[msg.photo.length - 1].file_id;
      if (!item.photo.includes(largestPhotoId)) {
        item.photo.push(largestPhotoId);
        contentAddedNow = true;
      }
    }

    // --- Добавляем видео без дублирования ---
    if (msg.video && msg.video.file_id) {
      if (!item.video.includes(msg.video.file_id)) {
        item.video.push(msg.video.file_id);
        contentAddedNow = true;
      }
    }

    // --- Отправка уведомления только если реально добавлен контент ---
    if (contentAddedNow) {
      bot.sendMessage(chatId, "Контент добавлен в отчет. Когда закончите, нажмите «Завершить отчет».", getFinishReportKeyboard());
      log(`Пользователь ${chatId} добавил контент к отчету "${state.lastReminder}"`);
    }
  }
}