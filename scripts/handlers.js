import { POINTS, REMINDERS } from "../reports.js";
import { config } from "../config.js";
import { log } from "./logger.js";
import { getStartKeyboard, getEndKeyboard, getFinishReportKeyboard } from "./keyboards.js";
import { userState } from "./state.js";
import { scheduleReminders, sendPendingReports } from "./reminders.js";

const { ADMIN_CHAT_ID } = config;

function declension(count) {
  if (count % 10 === 1 && count % 100 !== 11) return "отчет";
  if ([2,3,4].includes(count % 10) && ![12,13,14].includes(count % 100)) return "отчета";
  return "отчетов";
}

// --- Универсальное получение имени пользователя ---
function getUserName(input) {
  const from = input?.from || input;
  if (!from) return "Неизвестный пользователь";
  const name = from.username ? `@${from.username}` : (from.first_name || "Без имени");
  const id = from.id ? ` (id: ${from.id})` : "";
  return name + id;
}

export function handleStart(bot, msg) {
  const chatId = msg.chat.id;
  const state = userState[chatId];
  const userName = getUserName(msg.from);

  if (state && state.verified) {
    bot.sendMessage(chatId, "Смена уже активна. Для завершения нажмите /end.", getEndKeyboard());
    return;
  }

  bot.sendMessage(chatId, "Нажмите /start, чтобы начать смену.", getStartKeyboard());
  const inlineButtons = Object.keys(POINTS).map(key => [{ text: key, callback_data: `point:${key}` }]);
  bot.sendMessage(chatId, "Выберите точку:", { reply_markup: { inline_keyboard: inlineButtons } });
  log(`Пользователь ${userName} вызвал /start`);
}

export function handleEnd(bot, msg) {
  const chatId = msg.chat.id;
  const state = userState[chatId];
  const userName = getUserName(msg.from);

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
  state._pendingMessageId = null;

  bot.sendMessage(chatId, "✅ Смена завершена. Нажмите /start для новой смены.", getStartKeyboard());
  log(`Пользователь ${userName} завершил смену с помощью /end`);
}

export function handleCallback(bot, query) {
  const chatId = query.message.chat.id;
  const data = query.data;
  let state = userState[chatId];
  const userName = getUserName(query.from || query.message.from);

  if (data.startsWith("point:")) {
    const pointName = data.split(":")[1];
    if (!POINTS[pointName]) {
      bot.answerCallbackQuery(query.id, { text: "Точка не найдена" });
      return;
    }

    state = {
      from: query.from,
      step: "enter_password",
      point: pointName,
      verified: false,
      pendingReminders: [],
      reportBuffer: [],
      lastReminder: null,
      _lastMsgId: null,
      _contentAdded: false,
      _pendingMessageId: null
    };
    userState[chatId] = state;

    bot.sendMessage(chatId, `Введите пароль для точки: ${pointName}`);
    bot.answerCallbackQuery(query.id);
    log(`Пользователь ${userName} выбрал точку "${pointName}"`);
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
    log(`Пользователь ${userName} выбрал отчет "${reminder.key}"`);
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

    const reminder = REMINDERS.find(r => r.name === state.lastReminder);
    const reminderKey = reminder ? reminder.key : "unknown";

    let combinedText = `Отчет "${state.lastReminder}" с точки ${state.point}\n\n`;
    itemsForReport.forEach(item => {
      if (item.text) {
        const senderName = getUserName(item.from);
        combinedText += `${senderName}: ${item.text}\n`;
      }
    });

    bot.sendMessage(ADMIN_CHAT_ID, combinedText.trim()).then(async () => {
      const mediaGroup = [];
      const sentFiles = new Set();

      itemsForReport.forEach(item => {
        const senderName = getUserName(item.from);

        if (item.photo) {
          item.photo.forEach(f => {
            if (!sentFiles.has(f)) {
              mediaGroup.push({ type: "photo", media: f, caption: item.text || `${senderName}: Фото` });
              sentFiles.add(f);
            }
          });
        }
        if (item.video) {
          item.video.forEach(f => {
            if (!sentFiles.has(f)) {
              mediaGroup.push({ type: "video", media: f, caption: item.text || `${senderName}: Видео` });
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

      state.lastReminder = null;
      state._lastMsgId = null;
      state._contentAdded = false;

      if (state.pendingReminders.length > 0) {
        sendPendingReports(bot, chatId);
      }
    });

    bot.answerCallbackQuery(query.id);
    log(`Пользователь ${userName} завершил отчет "${reminderKey}"`);
  }
}

export function handleMessage(bot, msg) {
  const chatId = msg.chat.id;
  let state = userState[chatId];
  if (!state) return;
  const userName = getUserName(msg.from);

  // --- Проверка пароля ---
  if (state.step === "enter_password") {
    const correctPassword = POINTS[state.point]?.password;
    if (!correctPassword) {
      bot.sendMessage(chatId, "Ошибка: точка не найдена.");
      return;
    }

    if (msg.text === correctPassword) {
      state.verified = true;
      state.step = "reports";
      bot.sendMessage(chatId, "Пароль верный! Теперь вы будете получать напоминания об отчетах.", getEndKeyboard());
      log(`Пользователь ${userName} авторизован для точки "${state.point}"`);
      scheduleReminders(bot, chatId, state.point);
    } else {
      bot.sendMessage(chatId, "Неверный пароль, попробуйте еще раз:");
      log(`Неверный пароль для точки "${state.point}" пользователем ${userName}`);
    }
    return;
  }

  // --- Обработка отчетов ---
  if (state.verified && state.lastReminder) {
    if (!state.reportBuffer) state.reportBuffer = [];

    let item = state.reportBuffer.find(
      i => i.from.id === msg.from.id && i.reminder === state.lastReminder && !i.sent
    );

    if (!item) {
      item = { from: msg.from, reminder: state.lastReminder, text: null, photo: [], video: [], sent: false };
      state.reportBuffer.push(item);
    }

    let contentAddedNow = false;

    if (msg.text || msg.caption) {
      item.text = item.text ? item.text + "\n" : "";
      item.text += msg.text || msg.caption;
      contentAddedNow = true;
    }

    if (msg.photo && msg.photo.length > 0) {
      const largestPhotoId = msg.photo[msg.photo.length - 1].file_id;
      if (!item.photo.includes(largestPhotoId)) {
        item.photo.push(largestPhotoId);
        contentAddedNow = true;
      }
    }

    if (msg.video && msg.video.file_id) {
      if (!item.video.includes(msg.video.file_id)) {
        item.video.push(msg.video.file_id);
        contentAddedNow = true;
      }
    }

    if (contentAddedNow) {
      const reminder = REMINDERS.find(r => r.name === state.lastReminder);
      const reminderKey = reminder ? reminder.key : "unknown";
      bot.sendMessage(chatId, "Контент добавлен в отчет. Когда закончите, нажмите «Завершить отчет».", getFinishReportKeyboard());
      log(`Пользователь ${userName} добавил контент к отчету "${reminderKey}"`);
    }
  }
}
