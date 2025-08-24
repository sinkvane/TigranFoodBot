export function log(message) {
  const now = new Date().toISOString();
  console.log(`[${now}] ${message}`);
}
