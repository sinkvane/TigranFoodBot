import fs from "fs";
import { log } from "./logger.js";

const FILE_PATH = "./.deploy-users.json";

/**
 * Загружает список пользователей, которые уже использовали бота
 * Приводит все ID к числам
 */
export function loadPreviousUsers() {
  try {
    if (!fs.existsSync(FILE_PATH)) return [];
    const data = fs.readFileSync(FILE_PATH, "utf-8");
    const users = JSON.parse(data);
    return Array.isArray(users) ? users.map(u => Number(u)) : [];
  } catch (err) {
    log(`[DEPLOY] Ошибка загрузки старого списка пользователей: ${err.message}`);
    return [];
  }
}

/**
 * Сохраняет список пользователей в файл
 */
function saveDeployUsers(ids) {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(ids, null, 2));
    log(`[DEPLOY] Список пользователей сохранён (${ids.length})`);
  } catch (err) {
    log(`[DEPLOY] Ошибка при сохраненим списка пользователей: ${err.message}`);
  }
}

/**
 * Добавляет пользователя в файл (если ещё нет)
 */
export function addDeployUser(chatId) {
  const users = loadPreviousUsers();
  const numId = Number(chatId);

  if (!users.includes(numId)) {
    users.push(numId);
    saveDeployUsers(users);
    log(`[DEPLOY] Пользователь ${numId} добавлен в deploy-users`);
  } else {
    log(`[DEPLOY] Пользователь ${numId} уже в deploy-users`);
  }
}

/**
 * Удаляет пользователя из файла
 */
export function removeDeployUser(chatId) {
  let users = loadPreviousUsers();
  const numId = Number(chatId);
  const beforeCount = users.length;

  users = users.filter(id => id !== numId);
  saveDeployUsers(users);
}

/**
 * Уведомляет старых пользователей о деплое
 */
export async function notifyDeploy(bot) {
  const oldUsers = loadPreviousUsers();

  if (oldUsers.length === 0) {
    log("[DEPLOY] Нет данных о прошлых пользователях, уведомление пропущено");
    return;
  }

  let notified = 0;
  for (const chatId of oldUsers) {
    try {
      await bot.sendMessage(chatId, "🔄 Пожалуйста, перезапустите бота — установлена новая версия. /start");
      notified++;
    } catch {
      // Игнорируем, если пользователь заблокировал бота
    }
  }

  log(`[DEPLOY] Уведомлено пользователей: ${notified}/${oldUsers.length}`);
}
