// handlers.js
import { POINTS, REMINDERS } from "../reports.js";
import { getEndKeyboard, getFinishReportKeyboard } from "./keyboards.js";
import { scheduleReminders } from "./reminders.js";

// состояние пользователей
export const userState = {};

export function handleStart(bot, msg) {
  const chatId = msg.chat.id;
  userState[chatId] = { step: "enter_password", point: null, verified: false };

  const pointNames = Object.keys(POINTS).map((p) => [{ text: p }]);
  bot.sendMessage(chatId, "Выберите точку:", {
    reply_markup: { keyboard: pointNames, resize_keyboard: true, one_time_keyboard: true },
  });
}



export function handleMessage(bot, msg) {
  const chatId = msg.chat.id;
  const state = userState[chatId];
  if (!state) return;

  // === Ввод пароля ===
  if (state.step === "enter_password") {
    const point = Object.keys(POINTS).find((p) => p === msg.text);
    if (point) {
      state.point = point;
      bot.sendMessage(chatId, `Введите пароль для ${point}:`);
      return;
    }

    if (state.point && msg.text === POINTS[state.point].password) {
      state.verified = true;
      state.step = "reports";
      state.pendingReminders = [];
      bot.sendMessage(chatId, "Пароль верный! Теперь вы будете получать напоминания об отчетах.", getEndKeyboard());
      scheduleReminders(bot, chatId, state.point);
    } else if (state.point) {
      bot.sendMessage(chatId, "Неверный пароль, попробуйте еще раз:");
    }
    return;
  }

  // === Отчёты ===
  if (state.verified && state.lastReminder) {
    if (!state.reportBuffer) state.reportBuffer = [];

    // один объект на одно сообщение
    const item = { from: msg.from, text: msg.caption || msg.text || null, photo: [], video: [] };

    // фото: берём только самое большое (последний элемент массива)
    if (msg.photo && msg.photo.length > 0) {
      item.photo.push(msg.photo[msg.photo.length - 1].file_id);
    }

    // видео
    if (msg.video) {
      item.video.push(msg.video.file_id);
    }

    state.reportBuffer.push(item);

    // отвечаем только один раз на сообщение
    if (!state._lastMsgId || state._lastMsgId !== msg.message_id) {
      state._lastMsgId = msg.message_id;
      bot.sendMessage(chatId, "Контент добавлен в отчет. Когда закончите, нажмите «Завершить отчет».", getFinishReportKeyboard());
    }
  }
}

export function handleCallback(bot, query) {
  const chatId = query.message.chat.id;
  const state = userState[chatId];
  if (!state) return;

  const data = query.data;

  if (data.startsWith("report:")) {
    const reminderName = data.split(":")[1];
    state.lastReminder = reminderName;

    // убираем из списка ожидающих
    state.pendingReminders = state.pendingReminders.filter((r) => r !== reminderName);
    state.reportBuffer = [];

    bot.sendMessage(chatId, `Вы начали отчет: ${reminderName}. Отправьте фото/видео и нажмите «Завершить отчет».`, getFinishReportKeyboard());
  }

  if (data === "finish_report") {
    if (!state.reportBuffer || state.reportBuffer.length === 0) {
      bot.sendMessage(chatId, "Вы ничего не добавили в отчет!");
      return;
    }

    // Отправляем итоговый отчет (пока в консоль, можно привязать к API)
    console.log("Отчет пользователя:", state.point, state.lastReminder, state.reportBuffer);

    bot.sendMessage(chatId, `Отчет "${state.lastReminder}" завершён ✅`);

    // чистим текущий буфер
    state.reportBuffer = [];
    state.lastReminder = null;

    // если есть ещё незавершённые отчёты — предложить их
    if (state.pendingReminders.length > 0) {
      const buttons = state.pendingReminders.map((r) => [{ text: r, callback_data: `report:${r}` }]);
      bot.sendMessage(chatId, "У вас остались непройденные отчёты:", {
        reply_markup: { inline_keyboard: buttons },
      });
    }
  }
}
