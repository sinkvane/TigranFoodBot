import 'dotenv/config'; 
import TelegramBot from "node-telegram-bot-api";
import { notifyDeploy } from "./scripts/deployNotifier.js";
import { config } from "./config.js";
import { POINTS } from "./reports.js";
import { log } from "./scripts/logger.js";
import { getStartKeyboard, getEndKeyboard } from "./scripts/keyboards.js";
import { userState } from "./scripts/state.js";
import { handleStart, handleEnd, handleCallback, handleMessage } from "./scripts/handlers.js";
import { scheduleReportStatus } from "./scripts/reminders.js";

const bot = new TelegramBot(config.TOKEN, { polling: true });
log("Бот запущен и ожидает команду /start");

// Запуск напоминаний/отчётов
scheduleReportStatus();

// Хендлеры команд
bot.onText(/\/start/, (msg) => handleStart(bot, msg));
bot.onText(/\/end/, (msg) => handleEnd(bot, msg));
bot.on("callback_query", (query) => handleCallback(bot, query));
bot.on("message", (msg) => handleMessage(bot, msg));

// Логируем ошибки polling
bot.on("polling_error", (err) => {
  log(`[Polling error] ${err.code || err.message}`);
});

// Отправка уведомлений о деплое и сохранение пользователей
(async () => {
  try {
    await notifyDeploy(bot);
  } catch (err) {
    log(`[DEPLOY] Ошибка при уведомлении пользователей: ${err.message}`);
  }
})();

export { bot };
