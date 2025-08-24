import { REMINDERS, POINTS } from "../reports.js";
import { config } from "../config.js";
import { log } from "./logger.js";
import { userState } from "./state.js";
import cron from "node-cron";

const { TIMEZONE } = config;

export function sendPendingReports(bot, chatId) {
  const state = userState[chatId];
  if (!state || !state.pendingReminders || state.pendingReminders.length === 0) return;

  // Если пользователь ещё не начал работу с отчетом
  if (!state.lastReminder) {
    // Отменяем старое сообщение
    if (state._pendingMessageId) {
      bot.deleteMessage(chatId, state._pendingMessageId).catch(() => {});
      state._pendingMessageId = null;
    }

    // Если таймер уже висит, сбрасываем его
    if (state._sendTimer) clearTimeout(state._sendTimer);

    // Ставим новый таймер на 1.5 секунды
    state._sendTimer = setTimeout(() => {
      const buttons = state.pendingReminders.map(r => {
        const rem = REMINDERS.find(rem => rem.name === r);
        if (!rem) return null;
        return [{ text: r, callback_data: `report:${rem.key}` }];
      }).filter(Boolean);

      if (buttons.length > 0) {
        bot.sendMessage(chatId, "🔔 Поступили новые отчеты, выберите один для отправки:", {
          reply_markup: { inline_keyboard: buttons }
        }).then(msg => state._pendingMessageId = msg.message_id);

        log(`[REMINDERS] Несколько отчётов отправлены пользователю ${chatId}: ${state.pendingReminders.join(", ")}`);
      }

      state._sendTimer = null;
    }, 1500);
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

        // Добавляем новый отчёт в очередь, даже если предыдущие ещё не выбраны
        state.pendingReminders.push(reminder.name);
        log(`[CRON] Добавлен отчёт "${reminder.name}" для пользователя ${chatId}`);

        // Если пользователь не начал работу с отчетом, обновляем уведомление
        if (!state.lastReminder) {
          sendPendingReports(bot, chatId);
        }
      }, { timezone: tz });
    }
  });
}
