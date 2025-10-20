// --- Универсальный логгер ---
export function log(message) {
  const now = new Date().toISOString();
  console.log(`[${now}] ${message}`);
}

// --- Переопределение console.error для добавления времени ---
const originalError = console.error;
console.error = (...args) => {
  const now = new Date().toISOString();
  originalError(`[${now}]`, ...args);
};
