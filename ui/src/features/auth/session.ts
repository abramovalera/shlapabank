/**
 * Флаг "сессия разблокирована" живёт в sessionStorage — стирается при закрытии вкладки.
 * Смысл: при повторном открытии браузера PIN-экран должен появиться снова, даже если
 * токен ещё валиден.
 */
const KEY = "sb_session_unlocked";

export function isSessionUnlocked(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function markSessionUnlocked(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* нет sessionStorage — просто игнор */
  }
}

export function clearSessionUnlock(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* игнор */
  }
}
