import dotenv from "dotenv";
import { REMINDERS, POINTS } from "./reports.js";
import { userState } from "./scripts/state.js";
import { sendPendingReports } from "./scripts/reminders.js";
import { log } from "./scripts/logger.js";
import TelegramBot from "node-telegram-bot-api";

dotenv.config();

/**
 * === Пример использования ===
 * 
 * 1️⃣ Отправить отчёт "fridge_clean" всем активным пользователям:
 *    node trigger-report.js fridge_clean -all
 *
 * 2️⃣ Отправить отчёт "fridge_clean" только для точки "ул. Назарбаева 52":
 *    node trigger-report.js fridge_clean --point "ул. Назарбаева 52"
 * 
 * Скрипт:
 * - Найдёт отчёт по ключу (reportKey)
 * - Добавит его в очередь pendingReminders выбранным пользователям
 * - Вызовет sendPendingReports() — бот сразу отправит уведомления с кнопками
 */

const args = process.argv.slice(2);
const reportKey = args[0];
const allFlag = args.includes("-all");
const pointIndex = args.indexOf("--point");
const pointName = pointIndex > -1 ? args[pointIndex + 1] : null;

if (!reportKey) {
  console.error("❌ Укажи ключ отчёта. Пример: node trigger-report.js fridge_clean");
  process.exit(1);
}

// Проверка точки
if (pointName && !POINTS[pointName]) {
  console.error(`❌ Точка "${pointName}" не найдена. Доступные точки:\n${Object.keys(POINTS).join("\n")}`);
  process.exit(1);
}

// Инициализация Telegram-бота
const botToken = process.env.BOT_TOKEN;
if (!botToken) {
  console.error("❌ Не найден BOT_TOKEN в .env");
  process.exit(1);
}

const bot = new TelegramBot(botToken, { polling: false });

// Находим отчёт по ключу
const reminder = REMINDERS.find(r => r.key === reportKey);
if (!reminder) {
  console.error(`❌ Отчёт с ключом "${reportKey}" не найден в reports.js`);
  process.exit(1);
}

console.log(`🚀 Форсированно отправляем отчёт: "${reminder.name}" (${reminder.key})`);

let sentCount = 0;

// Перебираем всех пользователей
for (const [chatId, state] of Object.entries(userState)) {
  if (!state.verified) continue; // Только активные смены

  // Фильтр по точке
  if (!allFlag && pointName && state.point !== pointName) continue;

  if (!state.pendingReminders) state.pendingReminders = [];
  state.pendingReminders.push(reminder.name);

  sendPendingReports(bot, chatId);
  sentCount++;

  log(`[MANUAL_TRIGGER] Отчёт "${reminder.name}" вручную отправлен пользователю ${chatId}`);
}

console.log(`✅ Отчёт "${reminder.name}" добавлен в очередь ${sentCount} пользователям.`);
process.exit(0);
