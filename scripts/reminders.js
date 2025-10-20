import { REMINDERS, POINTS } from "../reports.js";
import { config } from "../config.js";
import { log } from "./logger.js";
import { userState } from "./state.js";
import cron from "node-cron";

const { TIMEZONE } = config;

// --- Универсальное получение имени пользователя ---
function getUserName(input) {
  const from = input?.from || input;
  if (!from) return "Неизвестный пользователь";
  const name = from.username ? `@${from.username}` : (from.first_name || "Без имени");
  const id = from.id ? ` (id: ${from.id})` : "";
  return name + id;
}

/**
 * Отправка пользователю напоминаний (списка доступных отчётов)
 */
export function sendPendingReports(bot, chatId) {
  const state = userState[chatId];
  if (!state || !state.pendingReminders || state.pendingReminders.length === 0) return;

  // Если пользователь ещё не начал работу с отчетом
  if (!state.lastReminder) {
    // Удаляем старое сообщение с кнопками, если оно есть
    if (state._pendingMessageId) {
      bot.deleteMessage(chatId, state._pendingMessageId).catch(() => {});
      state._pendingMessageId = null;
    }

    // Сбрасываем старый таймер
    if (state._sendTimer) clearTimeout(state._sendTimer);

    // Ставим новый таймер на 1.5 секунды (чтобы не спамить)
    state._sendTimer = setTimeout(() => {
      const buttons = state.pendingReminders
        .map(r => {
          const rem = REMINDERS.find(rem => rem.name === r);
          if (!rem) return null;
          return [{ text: rem.name, callback_data: `report:${rem.key}` }];
        })
        .filter(Boolean);

      if (buttons.length > 0) {
        bot.sendMessage(chatId, "🔔 Поступили новые отчёты, выберите один для отправки:", {
          reply_markup: { inline_keyboard: buttons }
        }).then(msg => (state._pendingMessageId = msg.message_id));

        const userName = getUserName(state);
        // логируем по ключам
        const keys = state.pendingReminders
          .map(r => REMINDERS.find(rem => rem.name === r)?.key)
          .filter(Boolean)
          .join(", ");
        log(`[REMINDERS] Несколько отчётов (ключи) отправлены пользователю ${userName}: ${keys}`);
      }

      state._sendTimer = null;
    }, 1500);
  }
}


/**
 * Проверка всех старых смен при старте бота.
 * Завершает смены, открытые более 1 суток.
 */
export function cleanOldShifts() {
  const now = Date.now();

  for (const [chatId, state] of Object.entries(userState)) {
    if (state.startTime && (now - state.startTime) > 24 * 60 * 60 * 1000) { // 1 сутки
      // Очистка состояния
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
          delete state._pendingMessageId;
        } catch (_) {}
      }

      const userName = getUserName(state);
      log(`[CLEANUP] Смена пользователя ${userName} автоматически завершена при старте бота (более 1 суток)`);
    }
  }
}

/**
 * Планирование напоминаний (cron-задачи)
 */
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

        // ✅ Автоматическое завершение смены через 1 сутки (24 часа)
        if (state.startTime && (Date.now() - state.startTime) > 24 * 60 * 60 * 1000) {
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
              delete state._pendingMessageId;
            } catch (_) {}
          }

          const userName = getUserName(state);
          log(`[AUTO-END] Смена пользователя ${userName} автоматически завершена (более 1 суток)`);
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
