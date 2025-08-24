module.exports = {
  apps: [
    {
      name: "tigranFoodBot",
      script: "./bot.js",
      watch: false,             // не следим за изменениями, чтобы не перезапускался сам
      env: {
        NODE_ENV: "production",
        TG_BOT_TOKEN: process.env.TG_BOT_TOKEN,
        TG_ADMIN_CHAT_ID: process.env.TG_ADMIN_CHAT_ID,
      },
      error_file: "./logs/error.log",   // файл для ошибок
      out_file: "./logs/out.log",       // обычные логи
      log_file: "./logs/combined.log",  // объединённый лог
      merge_logs: true,                 // объединять out и error
      max_size: "512M",                 // максимальный размер файла
      retain: 5,                        // хранить последние 5 файлов
      compress: false                    // не сжимать
    }
  ]
};
