import { REMINDERS, POINTS } from "../reports.js";
import { config } from "../config.js";
import { log } from "./logger.js";
import { userState } from "./state.js";
import cron from "node-cron";

const { TIMEZONE } = config;

// --- Получение имени пользователя для логов ---
function getUserName(state) {
  if (!state || !state.from) return "Неизвестный пользователь";
  return state.from.username ? `@${state.from.username}` : state.from.first_name;
}

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

        const userName = getUserName(state);
        log(`[REMINDERS] Несколько отчётов отправлены пользователю ${userName}: ${state.pendingReminders.join(", ")}`);
      }

      state._sendTimer = null;
    }, 1500);
  }
}

/**
 * Проверка всех старых смен при старте бота.
 * Завершает смены, открытые более 2 суток.
 */
export function cleanOldShifts(bot) {
  const now = Date.now();

  for (const [chatId, state] of Object.entries(userState)) {
    if (state.startTime && (now - state.startTime) > 2 * 24 * 60 * 60 * 1000) {
      state.pendingReminders = [];
      state.reportBuffer = [];
      state.verified = false;
      state.step = null;
      state.lastReminder = null;
      state._lastMsgId = null;
      state._contentAdded = false;
      state.startTime = null;

      if (state._pendingMessageId) {
        try { 
          bot.deleteMessage(chatId, state._pendingMessageId.toString()).catch(() => {}); 
        } catch (e) {}
      }
      state._pendingMessageId = null;

      const userName = getUserName(state);
      log(`[CLEANUP] Смена пользователя ${userName} автоматически завершена при старте бота (более 2 суток)`);
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

        // ✅ Авто-завершение смены через 2 суток (48 часов)
        if (state.startTime && (Date.now() - state.startTime) > 2 * 24 * 60 * 60 * 1000) {
          state.pendingReminders = [];
          state.reportBuffer = [];
          state.verified = false;
          state.step = null;
          state.lastReminder = null;
          state._lastMsgId = null;
          state._contentAdded = false;
          state.startTime = null;

          if (state._pendingMessageId) {
            try {
              bot.deleteMessage(chatId, state._pendingMessageId.toString()).catch(() => {});
            } catch (e) {}
          }

          state._pendingMessageId = null;
          const userName = getUserName(state);
          log(`[AUTO-END] Смена пользователя ${userName} автоматически завершена (более 2 суток)`);
          return;
        }

        if (!state.pendingReminders) state.pendingReminders = [];

        // Добавляем новый отчёт в очередь, даже если предыдущие ещё не выбраны
        state.pendingReminders.push(reminder.name);
        const userName = getUserName(state);
        log(`[CRON] Добавлен отчёт "${reminder.name}" для пользователя ${userName}`);

        // Если пользователь не начал работу с отчетом, обновляем уведомление
        if (!state.lastReminder) {
          sendPendingReports(bot, chatId);
        }
      }, { timezone: tz });
    }
  });
}