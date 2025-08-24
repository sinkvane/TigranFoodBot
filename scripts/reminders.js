// reminders.js
import cron from "node-cron";
import { REMINDERS, POINTS } from "../reports.js";
import { config } from "../config.js";
import { log } from "./logger.js";
import { userState } from "./state.js";

const { TIMEZONE } = config;

// --- Выдача отчётов из очереди ---
export function sendPendingReports(bot, chatId) {
  const state = userState[chatId];
  if (!state || !state.pendingReminders || state.pendingReminders.length === 0) return;

  // если нет текущего отчета и в очереди один — запускаем сразу
  if (!state.lastReminder && state.pendingReminders.length === 1) {
    const reminder = REMINDERS.find(rem => rem.name === state.pendingReminders[0]);
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

  // если нет текущего отчета и в очереди несколько — показываем меню выбора
  if (!state.lastReminder && state.pendingReminders.length > 1) {
    const buttons = state.pendingReminders.map(r => {
      const rem = REMINDERS.find(rem => rem.name === r);
      if (!rem) return null;
      return [{ text: r, callback_data: `report:${rem.name}` }];
    }).filter(Boolean);

    if (buttons.length > 0) {
      bot.sendMessage(chatId, "🔔 Поступили оставшиеся отчеты, выберите один для отправки:", {
        reply_markup: { inline_keyboard: buttons }
      });
      log(`Несколько отчётов отправлены пользователю ${chatId}: ${state.pendingReminders.join(", ")}`);
    }
  }
}

// --- Планирование cron для напоминаний ---
export function scheduleReminders(bot, chatId, pointName) {
  const tzKey = POINTS[pointName].tz;
  const tz = TIMEZONE[tzKey];
  const pointType = POINTS[pointName].type;

  REMINDERS.forEach(reminder => {
    if (reminder.pointType && reminder.pointType !== pointType) return;

    cron.schedule(
      reminder.cron,
      () => {
        const state = userState[chatId];
        if (!state || !state.verified) return;

        if (!state.pendingReminders) state.pendingReminders = [];

        // кладём в очередь всегда
        if (!state.pendingReminders.includes(reminder.name)) {
          state.pendingReminders.push(reminder.name);
          log(`Добавлен в очередь отчёт "${reminder.name}" для пользователя ${chatId}`);
        }

        // если сейчас нет активного отчета — выдаем сразу
        if (!state.lastReminder) {
          if (!state.reminderTimer) {
            state.reminderTimer = setTimeout(() => {
              sendPendingReports(bot, chatId);
              state.reminderTimer = null;
            }, 1000);
          }
        }
      },
      { timezone: tz }
    );
  });
}
