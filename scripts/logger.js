const originalError = console.error;
console.error = (...args) => {
  const now = new Date().toISOString();
  originalError(`[${now}]`, ...args);
};
