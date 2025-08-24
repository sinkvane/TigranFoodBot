import { REMINDERS, POINTS } from "../reports.js";
import { config } from "../config.js";
import { log } from "./logger.js";
import { userState } from "./state.js";
import cron from "node-cron";

const { TIMEZONE } = config;

export function sendPendingReports(bot, chatId) {
  const state = userState[chatId];
  if (!state || !state.pendingReminders || state.pendingReminders.length === 0) return;

  // --- Если нет текущего отчёта, выдаём следующий ---
  while (!state.lastReminder && state.pendingReminders.length > 0) {
    const reminderName = state.pendingReminders.shift();
    const reminder = REMINDERS.find(r => r.name === reminderName);
    if (!reminder) continue;

    state.lastReminder = reminder.name;

    // --- Если один отчёт, уведомление без кнопок ---
    if (state.pendingReminders.length === 0) {
      bot.sendMessage(chatId, `🔔 Поступил отчет: "${reminder.name}". Отправьте фото, видео или текст.`);
      log(`Один отчёт "${reminder.name}" выдан пользователю ${chatId}`);
    } else {
      // --- Несколько отчётов, кнопки выбора ---
      const buttons = [ [ { text: reminder.name, callback_data: `report:${reminder.key}` } ] ];
      bot.sendMessage(chatId, "🔔 Поступили новые отчеты, выберите один для отправки:", {
        reply_markup: { inline_keyboard: buttons }
      });
      log(`Несколько отчётов: первый "${reminder.name}" выдан пользователю ${chatId}`);
    }
  }
}

// --- Планирование всех напоминаний ---
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

        // --- Добавляем в очередь, если ещё нет ---
        if (!state.pendingReminders.includes(reminder.name)) {
          state.pendingReminders.push(reminder.name);
          log(`[CRON] Добавлен отчёт "${reminder.name}" для пользователя ${chatId}`);

          // --- Если нет текущего отчёта, выдаём сразу ---
          if (!state.lastReminder) {
            sendPendingReports(bot, chatId);
          }
        }
      }, { timezone: tz });
    }
  });
}
