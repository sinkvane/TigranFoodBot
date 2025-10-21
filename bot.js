import dotenv from "dotenv";
dotenv.config();
import TelegramBot from "node-telegram-bot-api";
import { config } from "./config.js";
import { POINTS } from "./reports.js";
import { log } from "./scripts/logger.js";
import { getStartKeyboard, getEndKeyboard } from "./scripts/keyboards.js";
import { userState } from "./scripts/state.js";
import { handleStart, handleEnd, handleCallback, handleMessage } from "./scripts/handlers.js";
import { scheduleReportStatus } from "./scripts/reminders.js";

const { TOKEN } = config;

// ==== Создание бота ====
const bot = new TelegramBot(TOKEN, { polling: true });
log("Бот запущен и ожидает команду /start");

scheduleReportStatus();

// ==== Обработчики ====
bot.onText(/\/start/, (msg) => handleStart(bot, msg));
bot.onText(/\/end/, (msg) => handleEnd(bot, msg));
bot.on("callback_query", (query) => handleCallback(bot, query));
bot.on("message", (msg) => handleMessage(bot, msg));

// ==== Обработка ошибок polling ====
bot.on("polling_error", (err) => {
  // Можно просто коротко через логгер
  log(`[Polling error] ${err.code || err.message}`);

  // Если хочешь — можно сделать фильтрацию, чтобы не спамил EFATAL:
  // if (err.code !== "EFATAL") log(`[Polling error] ${err.code || err.message}`);
});

export { bot };
