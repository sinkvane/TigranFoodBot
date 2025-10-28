import { REMINDERS, POINTS } from "../reports.js";
import { removeDeployUser } from "./deployNotifier.js";
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

  if (!state.lastReminder) {
    if (state._pendingMessageId) {
      bot.deleteMessage(chatId, state._pendingMessageId).catch(() => { });
      state._pendingMessageId = null;
    }

    if (state._sendTimer) clearTimeout(state._sendTimer);

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
        const keys = state.pendingReminders
          .map(r => REMINDERS.find(rem => rem.name === r)?.key)
          .filter(Boolean);

        if (keys.length > 0) {
          const logMessage = `[REMINDERS] Отчёты отправлены пользователю ${userName}:\n` +
            keys.map(k => `- ${k}`).join("\n") +
            `\n[Всего: ${keys.length}]`;
          log(logMessage);
        }
      }

      state._sendTimer = null;
    }, 1500);
  }
}

/**
 * Склонение слова "отчёт"
 */
function declension(count) {
  if (count % 10 === 1 && count % 100 !== 11) return "отчет";
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return "отчета";
  return "отчетов";
}

/**
 * Каждые 30 минут — лог количества отчётов у пользователей
 */
export function scheduleReportStatus() {
  cron.schedule("*/30 * * * *", () => {
    const now = new Date().toLocaleTimeString("ru-RU", { hour12: false });
    log(`[REPORT STATUS] Проверка активных отчётов (${now})`);

    let totalReports = 0;
    let hasUsers = false;

    for (const [_, state] of Object.entries(userState)) {
      if (!state.verified) continue;
      const count = state.pendingReminders?.length || 0;
      totalReports += count;

      const name = state.from?.username
        ? `@${state.from.username}`
        : (state.from?.first_name || "Без имени");

      if (count > 0) {
        const logMessage = `[REPORT STATUS] Пользователь ${name} имеет ${count} ${declension(count)}:\n` +
          state.pendingReminders
            .map(r => `- ${REMINDERS.find(rem => rem.name === r)?.key || r}`)
            .join("\n") +
          `\n[Всего: ${count}]`;
        log(logMessage);
      } else {
        log(`[REPORT STATUS] Пользователь ${name} не имеет активных отчётов`);
      }

      hasUsers = true;
    }

    if (!hasUsers) {
      log(`[REPORT STATUS] Нет активных пользователей`);
      return;
    }

    if (totalReports === 0) {
      log(`[REPORT STATUS] Все пользователи без активных отчётов`);
      return;
    }
  }, { timezone: "Europe/Moscow" });
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
            try { delete state._pendingMessageId; } catch (_) { }
          }

          const userName = getUserName(state);
          log(`[AUTO-END] Смена пользователя ${userName} автоматически завершена (более 1 суток)`);
          return;
        }

        if (!state.pendingReminders) state.pendingReminders = [];

        state.pendingReminders.push(reminder.name);
        const userName = getUserName(state);

        // --- Многострочный лог для CRON ---
        const keys = [reminder.key]; // логируем только что добавленный отчёт
        const logMessage = `[CRON] Добавлен отчёт для пользователя ${userName}:\n` +
          keys.map(k => `- ${k}`).join("\n") +
          `\n[Всего: ${keys.length}]`;
        log(logMessage);

        if (!state.lastReminder) {
          sendPendingReports(bot, chatId);
        }
      }, { timezone: tz });
    }
  });
}

const MAX_PENDING_REPORTS = 20; 

cron.schedule("0 * * * *", () => {
  let endedCount = 0;

  for (const [chatIdStr, state] of Object.entries(userState)) {
    if (!state || !state.verified) continue;

    const pendingCount = state.pendingReminders?.length || 0;

    if (pendingCount >= MAX_PENDING_REPORTS) {
      // --- Чистим состояние пользователя ---
      state.pendingReminders = [];
      state.reportBuffer = [];
      state.verified = false;
      state.step = null;
      state.lastReminder = null;
      state._lastMsgId = null;
      state._contentAdded = false;
      state.startTime = null;
      if (state._pendingMessageId) delete state._pendingMessageId;

      // --- Надёжный chatId как число ---
      const realChatId = Number(state.from?.id ?? chatIdStr);

      log(`[AUTO-END] Удалён пользователь ${realChatId} из Deploy`);
      removeDeployUser(realChatId);

      endedCount++;
    }
  }

  if (endedCount === 0) {
    log(`[AUTO-END] Нет пользователей с ${MAX_PENDING_REPORTS}+ неотправленными отчётами`);
  }
}, { timezone: "Europe/Moscow" });