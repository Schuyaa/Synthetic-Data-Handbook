/** Прочитать сохранённое состояние по ключу. Возвращает объект или null. */
export function loadSessionState(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

/** Сохранить состояние по ключу. Тихо игнорирует ошибки записи. */
export function saveSessionState(key, state) {
  try {
    sessionStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* приватный режим / превышение квоты — просто не сохраняем */
  }
}
