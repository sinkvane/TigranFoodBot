import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';

const { TG_BOT_TOKEN } = process.env;

if (!TG_BOT_TOKEN) {
  console.error("❌ Не найден TG_BOT_TOKEN в .env");
  process.exit(1);
}

const bot = new TelegramBot(TG_BOT_TOKEN, { polling: true });

console.log("🤖 Бот запущен! Напиши любое сообщение в Telegram, чтобы получить chat_id.");

bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const user = msg.from?.username ? `@${msg.from.username}` : msg.from?.first_name || "Без имени";

  console.log(`✅ Получен chat_id: ${chatId} от пользователя ${user}`);
  bot.sendMessage(chatId, `Ваш chat_id: ${chatId}`);
});
