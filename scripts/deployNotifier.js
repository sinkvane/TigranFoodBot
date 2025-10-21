import fs from "fs";
import { log } from "./logger.js";
import { userState } from "./state.js";

const FILE_PATH = "./.deploy-users.json";

/**
 * Загружает список пользователей, которые уже использовали бота
 */
export function loadPreviousUsers() {
  try {
    if (!fs.existsSync(FILE_PATH)) return [];
    const data = fs.readFileSync(FILE_PATH, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    log(`[DEPLOY] Ошибка загрузки старого списка пользователей: ${err.message}`);
    return [];
  }
}

/**
 * Сохраняет текущий список пользователей в файл
 */
export function saveCurrentUsers() {
  try {
    const ids = Object.keys(userState).map(Number).filter(id => !isNaN(id));
    fs.writeFileSync(FILE_PATH, JSON.stringify(ids, null, 2));
    log(`[DEPLOY] Список пользователей сохранён (${ids.length})`);
  } catch (err) {
    log(`[DEPLOY] Ошибка сохранения списка пользователей: ${err.message}`);
  }
}

/**
 * Уведомляет старых пользователей о деплое
 */
export async function notifyDeploy(bot) {
  const oldUsers = loadPreviousUsers();
  const currentUsers = Object.keys(userState).map(Number).filter(id => !isNaN(id));

  if (oldUsers.length === 0) {
    log("[DEPLOY] Нет данных о прошлых пользователях, уведомление пропущено");
    return;
  }

  let notified = 0;
  for (const chatId of oldUsers) {
    try {
      await bot.sendMessage(chatId, "🔄 Обновление! Пожалуйста, перезапустите бота — установлена новая версия.");
      notified++;
    } catch {
      // Игнорируем, если пользователь заблокировал бота
    }
  }

  log(`[DEPLOY] Уведомлено пользователей: ${notified}/${oldUsers.length}`);

  // Сохраняем новый список пользователей после уведомления
  saveCurrentUsers();
}
