import cron from "node-cron";
import { REMINDERS, POINTS } from "../reports.js";
import { config } from "../config.js";
import { log } from "./logger.js";
import { userState } from "./state.js";

const { TIMEZONE } = config;

// Небольшая функция склонения для сообщений
function declension(count) {
  if (count % 10 === 1 && count % 100 !== 11) return "отчет";
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return "отчета";
  return "отчетов";
}

export function sendPendingReports(bot, chatId) {
  const state = userState[chatId];
  if (!state || !state.pendingReminders || state.pendingReminders.length === 0) return;

  // Дедупликация на всякий случай
  state.pendingReminders = [...new Set(state.pendingReminders)];

  const count = state.pendingReminders.length;

  // Если уже есть активный отчёт — ничего не перетираем, предлагаем кнопки выбора
  const buttons = state.pendingReminders
    .map((rName) => {
      const rem = REMINDERS.find((rem) => rem.name === rName);
      if (!rem) return null;
      return [{ text: rName, callback_data: `report:${rem.key}` }];
    })
    .filter(Boolean);

  if (state.lastReminder) {
    if (buttons.length > 0) {
      bot.sendMessage(
        chatId,
        `🔔 У вас ещё ${count} незавершенных ${declension(count)}. Выберите один для отправки:`,
        { reply_markup: { inline_keyboard: buttons } }
      );
      log(`Пользователю ${chatId} показан список оставшихся отчётов (активный уже есть).`);
    }
    return;
  }

  // Авто-активируем только если активного отчёта нет
  if (count === 1) {
    const reminder = REMINDERS.find((rem) => rem.name === state.pendingReminders[0]);
    if (reminder) {
      state.lastReminder = reminder.name;
      state.pendingReminders = state.pendingReminders.filter((r) => r !== reminder.name);
      bot.sendMessage(
        chatId,
        `🔔 Поступил отчет: "${reminder.name}". Отправьте текст, фото или видео. Когда закончите, нажмите «Завершить отчет».`
      );
      log(`Один отчёт "${reminder.name}" сразу выдан пользователю ${chatId}`);
    }
    return;
  }

  // Несколько и активного нет — показываем кнопки выбора
  if (buttons.length > 0) {
    bot.sendMessage(
      chatId,
      `🔔 Поступили ${count} ${declension(count)}. Выберите один для отправки:`,
      { reply_markup: { inline_keyboard: buttons } }
    );
    log(`Несколько отчётов отправлены пользователю ${chatId}: ${state.pendingReminders.join(", ")}`);
  }
}

export function scheduleReminders(bot, chatId, pointName) {
  const tzKey = POINTS[pointName].tz;
  const tz = TIMEZONE[tzKey];
  const pointType = POINTS[pointName].type;

  REMINDERS.forEach((reminder) => {
    // Если напоминание для другого типа точки — пропускаем
    if (reminder.pointType && reminder.pointType !== pointType) return;

    cron.schedule(
      reminder.cron,
      () => {
        const state = userState[chatId];
        if (!state || !state.verified) return;

        if (!state.pendingReminders) state.pendingReminders = [];

        // Добавляем в очередь, но не дублируем
        if (!state.pendingReminders.includes(reminder.name)) {
          state.pendingReminders.push(reminder.name);
        }

        // Небольшая "склейка" триггеров, чтобы не слать много сообщений подряд
        if (!state.reminderTimer) {
          state.reminderTimer = setTimeout(() => {
            try {
              sendPendingReports(bot, chatId);
            } finally {
              state.reminderTimer = null;
            }
          }, 300); // 300мс хватает, можно оставить 1000мс если нравится
        }
      },
      { timezone: tz }
    );
  });
}
