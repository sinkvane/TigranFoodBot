// reminders.js
import cron from "node-cron";
import { REMINDERS, POINTS } from "../reports.js";
import { config } from "../config.js";
import { log } from "./logger.js";
import { userState } from "./state.js";

const { TIMEZONE } = config;

// Отправка всех pendingReminders пользователю
export function sendPendingReports(bot, chatId) {
  const state = userState[chatId];
  if (!state || !state.pendingReminders || state.pendingReminders.length === 0) return;

  if (state.pendingReminders.length === 1) {
    const reminder = REMINDERS.find(r => r.name === state.pendingReminders[0]);
    if (reminder) {
      state.lastReminder = reminder.name;
      state.pendingReminders = state.pendingReminders.filter(r => r !== reminder.name);
      bot.sendMessage(
        chatId,
        `🔔 Поступил отчет: "${reminder.name}". Отправьте фото, видео или текст. Когда закончите, нажмите «Завершить отчет».`
      );
      log(`Один отчёт "${reminder.name}" сразу выдан пользователю ${chatId}`);
    }
    return;
  }

  // Несколько отчетов — предложить выбор
  const buttons = state.pendingReminders
    .map(r => {
      const rem = REMINDERS.find(rem => rem.name === r);
      if (!rem) return null;
      return [{ text: r, callback_data: `report:${rem.key}` }];
    })
    .filter(Boolean);

  if (buttons.length > 0) {
    bot.sendMessage(chatId, "🔔 Поступили оставшиеся отчеты, выберите один для отправки:", {
      reply_markup: { inline_keyboard: buttons }
    });
    log(`Несколько отчётов отправлены пользователю ${chatId}: ${state.pendingReminders.join(", ")}`);
  }
}

// Планирование всех напоминаний для пользователя
export function scheduleReminders(bot, chatId, pointName) {
  const point = POINTS[pointName];
  if (!point) return;

  const tz = TIMEZONE[point.tz];
  const pointType = point.type;

  REMINDERS.forEach(reminder => {
    if (reminder.pointType && reminder.pointType !== pointType) return;

    cron.schedule(
      reminder.cron,
      () => {
        const state = userState[chatId];
        if (!state || !state.verified) return;

        if (!state.pendingReminders) state.pendingReminders = [];
        if (!state.pendingReminders.includes(reminder.name)) {
          state.pendingReminders.push(reminder.name);
          log(`[CRON] Добавлен отчёт "${reminder.name}" для пользователя ${chatId}`);
          sendPendingReports(bot, chatId);
        }
      },
      { timezone: tz }
    );

    log(`[CRON] Запланирован отчёт "${reminder.name}" для точки "${pointName}"`);
  });
}
