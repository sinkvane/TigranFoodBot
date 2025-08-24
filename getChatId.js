// getChatId.js
import TelegramBot from "node-telegram-bot-api";

// Вставь токен твоего бота
const TOKEN = "8367998181:AAHIcEr4Mn_QaFkTLh_DI36XpYu6-IEVEkU";

// Создаём бота в режиме polling
const bot = new TelegramBot(TOKEN, { polling: true });

bot.on("message", (msg) => {
  console.log("Сообщение пришло из чата:");
  console.log(msg.chat);
});
