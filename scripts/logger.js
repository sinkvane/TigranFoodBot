// --- Универсальный логгер ---
function getTimestamp() {
  const now = new Date();
  return now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0') + ':' +
    String(now.getSeconds()).padStart(2, '0');
}

export function log(message) {
  const now = getTimestamp();
  console.log(`[${now}] ${message}`);
}

// --- Переопределение console.error для добавления времени ---
const originalError = console.error;
console.error = (...args) => {
  const now = getTimestamp();
  originalError(`[${now}]`, ...args);
};
