/**
 * Соглашение о демо-режиме:
 * `fullclient` — встроенный тестовый пользователь бэкенда (см. docs/DEMO_CLIENT.md).
 * Если юзер залогинен под этим логином — включаем демо-UI (плашка в шапке,
 * пропуск шага установки PIN и т.д.).
 */
export const DEMO_LOGIN = "fullclient";
export const DEMO_PASSWORD = "FullClient1!";

export function isDemoLogin(login: string | null | undefined): boolean {
  return login === DEMO_LOGIN;
}
