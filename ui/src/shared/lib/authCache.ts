import { QueryClient } from "@tanstack/react-query";

/**
 * Единая точка сброса всех кешей при смене пользователя.
 * Вызывается на login/logout — чтобы данные предыдущего юзера не «текли» в новый.
 */
export function resetUserCache(qc: QueryClient) {
  qc.clear();
}
