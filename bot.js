import TelegramBot from "node-telegram-bot-api";
import 'dotenv/config'; // автоматически подхватывает .env
import { config } from "./config.js";
import { POINTS } from "./reports.js";
import { log } from "./scripts/logger.js";
import { getStartKeyboard, getEndKeyboard } from "./scripts/keyboards.js";
import { userState } from "./scripts/state.js";
import { handleStart, handleEnd, handleCallback, handleMessage } from "./scripts/handlers.js";

const { TOKEN } = config;

// ==== Создание бота ====
const bot = new TelegramBot(TOKEN, { polling: true });
log("Бот запущен и ожидает команду /start");

// ==== Обработчики ====
bot.onText(/\/start/, (msg) => handleStart(bot, msg));
bot.onText(/\/end/, (msg) => handleEnd(bot, msg));
bot.on("callback_query", (query) => handleCallback(bot, query));
bot.on("message", (msg) => handleMessage(bot, msg));

export { bot };
