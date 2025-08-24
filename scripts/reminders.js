import cron from "node-cron";
import { REMINDERS, POINTS } from "../reports.js";
import { config } from "../config.js";
import { log } from "./logger.js";
import { userState } from "./state.js";

const { TIMEZONE } = config;

export function sendPendingReports(bot, chatId) {
  const state = userState[chatId];
  if (!state || !state.pendingReminders || state.pendingReminders.length === 0) return;

  // если только 1 отчёт — сразу просим его
  if (state.pendingReminders.length === 1) {
    const reminder = REMINDERS.find(r => r.name === state.pendingReminders[0]);
    if (!reminder) return;

    state.lastReminder = reminder.name;
    state.pendingReminders = state.pendingReminders.filter(r => r !== reminder.name);
    state.reportBuffer = []; // новый буфер для отчета

    bot.sendMessage(chatId, `🔔 Поступил отчет: "${reminder.name}". Отправьте фото, видео или текст. После завершения нажмите кнопку "Завершить отчет".`, {
      reply_markup: {
        inline_keyboard: [[{ text: "✅ Завершить отчет", callback_data: "finish_report" }]]
      }
    });
    log(`Один отчёт "${reminder.name}" выдан пользователю ${chatId}`);
    return;
  }

  // если несколько отчётов — показываем кнопки
  const buttons = state.pendingReminders.map(r => {
    const rem = REMINDERS.find(rem => rem.name === r);
    if (!rem) return null;
    return [{ text: r, callback_data: `report:${rem.key}` }];
  }).filter(Boolean);

  if (buttons.length > 0) {
    bot.sendMessage(chatId, "🔔 Поступили оставшиеся отчеты, выберите один для отправки:", { 
      reply_markup: { inline_keyboard: buttons } 
    });
    log(`Несколько отчётов отправлены пользователю ${chatId}: ${state.pendingReminders.join(", ")}`);
  }
}

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
        if (!state.pendingReminders.includes(reminder.name)) state.pendingReminders.push(reminder.name);

        // таймер нужен только чтобы разово показать напоминания
        if (!state.reminderTimer) {
          state.reminderTimer = setTimeout(() => {
            sendPendingReports(bot, chatId);
            state.reminderTimer = null;
          }, 1000);
        }
      },
      { timezone: tz }
    );
  });
}
