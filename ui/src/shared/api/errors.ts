/**
 * Единый формат ошибок от бэкенда:
 *   { "error": { "code": "...", "message": "...", "field": null } }
 *
 * Хелпер вытягивает `message` для показа пользователю или `code` для программного switch.
 */
export interface ApiErrorBody {
  error?: { code: string; message?: string; field?: string | null };
  // Legacy — на случай если какой-то endpoint ещё не переехал
  detail?: string | { msg?: string };
}

export function apiErrorMessage(err: any): string {
  const data = err?.response?.data as ApiErrorBody | undefined;
  if (data?.error?.message) return data.error.message;
  if (typeof data?.detail === "string") return data.detail;
  if (data?.detail && typeof data.detail === "object" && data.detail.msg)
    return data.detail.msg;
  if (err?.message) return err.message;
  return "Что-то пошло не так";
}

export function apiErrorCode(err: any): string | null {
  const data = err?.response?.data as ApiErrorBody | undefined;
  if (data?.error?.code) return data.error.code;
  if (typeof data?.detail === "string") return data.detail.split(":", 1)[0].trim();
  return null;
}

export function apiErrorField(err: any): string | null {
  const data = err?.response?.data as ApiErrorBody | undefined;
  return data?.error?.field ?? null;
}
