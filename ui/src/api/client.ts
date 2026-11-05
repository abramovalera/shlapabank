import axios, { AxiosError } from "axios";
import { useSession } from "./session";

export const http = axios.create({
  baseURL: "/api/v1",
  timeout: 20000,
  // Массивы в query передаём повторяющимися параметрами: type=A&type=B
  paramsSerializer: { indexes: null },
});

http.interceptors.request.use((config) => {
  const token = useSession.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (r) => r,
  (error: AxiosError) => {
    const url = error.config?.url ?? "";
    // 401 на /auth/* — это ошибка входа, а не протухшая сессия
    if (error.response?.status === 401 && !url.startsWith("/auth/")) {
      // Плашку «Сессия истекла» показываем, только если токен вообще был
      const s = useSession.getState();
      if (s.token) s.signOut(true);
    }
    return Promise.reject(error);
  },
);

/** Ошибка API в едином виде: {error: {code, message, field, ...доп. поля}}. */
export class ApiError extends Error {
  status: number;
  code: string;
  field: string | null;
  extra: Record<string, unknown>;

  constructor(status: number, code: string, message: string, field: string | null, extra: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
    this.extra = extra;
  }

  get attemptsLeft(): number | null {
    const v = this.extra.attempts_left;
    return typeof v === "number" ? v : null;
  }

  /** 429 resend_too_early: через сколько секунд можно запросить новый код (по часам банка). */
  get resendInSeconds(): number | null {
    const v = this.extra.resend_in_seconds;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }
}

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (axios.isAxiosError(e)) {
    const status = e.response?.status ?? 0;
    const body = e.response?.data as { error?: Record<string, unknown> } | undefined;
    const err = body?.error;
    if (err && typeof err.message === "string") {
      const { code, message, field, ...extra } = err;
      return new ApiError(
        status,
        typeof code === "string" ? code : "error",
        message,
        typeof field === "string" ? field : null,
        extra,
      );
    }
    if (status === 0) {
      return new ApiError(0, "network", "Не удалось связаться с банком. Проверьте подключение и попробуйте ещё раз.", null, {});
    }
    if (status >= 500) {
      return new ApiError(status, "server", "Сервис временно недоступен. Попробуйте позже.", null, {});
    }
    return new ApiError(status, "unknown", "Что-то пошло не так. Попробуйте ещё раз.", null, {});
  }
  return new ApiError(0, "unknown", "Что-то пошло не так. Попробуйте ещё раз.", null, {});
}

export function isCanceled(e: unknown) {
  return axios.isCancel(e);
}
