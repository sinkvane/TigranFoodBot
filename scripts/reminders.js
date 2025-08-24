import { REMINDERS, POINTS } from "../reports.js";
import { config } from "../config.js";
import { log } from "./logger.js";
import { userState } from "./state.js";
import cron from "node-cron";

const { TIMEZONE } = config;

export function sendPendingReports(bot, chatId) {
  const state = userState[chatId];
  if (!state || !state.pendingReminders || state.pendingReminders.length === 0) return;

  // Копируем массив, чтобы можно было итерировать
  const pending = [...state.pendingReminders];

  // Если нет текущего отчёта, выдаём все новые уведомления
  pending.forEach(reminderName => {
    const reminder = REMINDERS.find(r => r.name === reminderName);
    if (!reminder) return;

    // Добавляем в очередь текущего отчёта, если он свободен
    if (!state.lastReminder) {
      state.lastReminder = reminder.name;
      state.pendingReminders = state.pendingReminders.filter(r => r !== reminder.name);

      // --- уведомление без кнопок и "нажмите завершить"
      bot.sendMessage(chatId, `🔔 Поступил отчет: "${reminder.name}". Отправьте фото, видео или текст.`);
      log(`Отчёт "${reminder.name}" выдан пользователю ${chatId}`);
    }
  });

  // Если после этого остались ещё отчёты, выдаём их через кнопки
  if (state.pendingReminders.length > 1) {
    const buttons = state.pendingReminders.map(r => {
      const rem = REMINDERS.find(rem => rem.name === r);
      if (!rem) return null;
      return [{ text: r, callback_data: `report:${rem.key}` }];
    }).filter(Boolean);

    if (buttons.length > 0) {
      bot.sendMessage(chatId, "🔔 Поступили новые отчеты, выберите один для отправки:", {
        reply_markup: { inline_keyboard: buttons }
      });
      log(`Несколько отчётов отправлены пользователю ${chatId}: ${state.pendingReminders.join(", ")}`);
    }
  }
}

export function scheduleReminders(bot, chatId, pointName) {
  const point = POINTS[pointName];
  if (!point) return;

  const tz = TIMEZONE[point.tz];
  const pointType = point.type;

  REMINDERS.forEach(reminder => {
    if (reminder.pointType && reminder.pointType !== pointType) return;

    const cronKey = `${chatId}_${reminder.key}`;
    if (!userState[cronKey]) {
      userState[cronKey] = true;

      cron.schedule(reminder.cron, () => {
        const state = userState[chatId];
        if (!state || !state.verified) return;

        if (!state.pendingReminders) state.pendingReminders = [];

        // --- добавляем отчёт в очередь
        state.pendingReminders.push(reminder.name);
        log(`[CRON] Добавлен отчёт "${reminder.name}" для пользователя ${chatId}`);

        // --- сразу выдаём все pending
        sendPendingReports(bot, chatId);
      }, { timezone: tz });
    }
  });
}
