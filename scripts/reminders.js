import { REMINDERS, POINTS } from "../reports.js";
import { config } from "../config.js";
import { log } from "./logger.js";
import { userState } from "./state.js";
import cron from "node-cron";

const { TIMEZONE } = config;

export function sendPendingReports(bot, chatId) {
  const state = userState[chatId];
  if (!state || !state.pendingReminders || state.pendingReminders.length === 0) return;

  // Отфильтруем отчёты, которые ещё не были выданы
  const unissuedReports = state.pendingReminders.filter(r => r !== state.lastReminder);

  if (unissuedReports.length === 0 && state.pendingReminders.length === 1) {
    // Только один отчёт в очереди, и он ещё не показывался текстом
    const reminder = REMINDERS.find(r => r.name === state.pendingReminders[0]);
    if (!reminder) return;

    state.lastReminder = reminder.name;
    state.pendingReminders = state.pendingReminders.filter(r => r !== reminder.name);

    bot.sendMessage(chatId, `🔔 Поступил отчет: "${reminder.name}". Отправьте фото, видео или текст.`);
    log(`Один отчёт "${reminder.name}" выдан пользователю ${chatId} текстом`);
    return;
  }

  // Иначе показываем все pendingReminders списком кнопок
  const buttons = state.pendingReminders.map(r => {
    const rem = REMINDERS.find(rem => rem.name === r);
    if (!rem) return null;
    return [{ text: r, callback_data: `report:${rem.key}` }];
  }).filter(Boolean);

  if (buttons.length > 0) {
    bot.sendMessage(chatId, "Есть новые отчеты, выберите один для отправки:", {
      reply_markup: { inline_keyboard: buttons }
    });

    log(`Несколько отчётов отправлены пользователю ${chatId}: ${state.pendingReminders.join(", ")}`);
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

        // Добавляем новый отчёт в очередь, даже если первый ещё не выбран
        state.pendingReminders.push(reminder.name);
        log(`[CRON] Добавлен отчёт "${reminder.name}" для пользователя ${chatId}`);

        // Отправляем уведомления о всех pending отчётах
        sendPendingReports(bot, chatId);
      }, { timezone: tz });
    }
  });
}
