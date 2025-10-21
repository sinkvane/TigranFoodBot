import dotenv from "dotenv";
dotenv.config();
import TelegramBot from "node-telegram-bot-api";
import { notifyDeploy, saveCurrentUsers } from "./scripts/deployNotifier.js";
import { config } from "./config.js";
import { POINTS } from "./reports.js";
import { log } from "./scripts/logger.js";
import { getStartKeyboard, getEndKeyboard } from "./scripts/keyboards.js";
import { userState } from "./scripts/state.js";
import { handleStart, handleEnd, handleCallback, handleMessage } from "./scripts/handlers.js";
import { scheduleReportStatus } from "./scripts/reminders.js";

const { TOKEN } = config;

const bot = new TelegramBot(TOKEN, { polling: true });
log("Бот запущен и ожидает команду /start");

scheduleReportStatus();

bot.onText(/\/start/, (msg) => handleStart(bot, msg));
bot.onText(/\/end/, (msg) => handleEnd(bot, msg));
bot.on("callback_query", (query) => handleCallback(bot, query));
bot.on("message", (msg) => handleMessage(bot, msg));

bot.on("polling_error", (err) => {
  log(`[Polling error] ${err.code || err.message}`);
});

(async () => {
  try {
    await notifyDeploy(bot);
    saveCurrentUsers();
  } catch (err) {
    log(`[DEPLOY] Ошибка при уведомлении пользователей: ${err.message}`);
  }
})();


export { bot };
