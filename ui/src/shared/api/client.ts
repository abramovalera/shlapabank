import axios from "axios";
import { useAuthStore } from "@/shared/stores/auth";
import { logBus, genId, sanitizeBody } from "@/features/devlog/logStore";

/**
 * Единый axios-инстанс для всех запросов к бэкенду.
 * Подставляет Bearer-токен из auth-store и обрабатывает 401 (выкидывает на логин).
 * Также ведёт клиентский журнал (плавающая панель логов): correlation-хеш пачки,
 * уникальный хеш запроса, тела с редакцией секретов.
 */
export const api = axios.create({
  baseURL: "/api/v1",
  timeout: 15_000,
});

interface TraceMeta {
  id: string;
  start: number;
}

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Хеш пачки запросов этой вкладки (для группировки в панели логов).
  const correlationId = logBus.correlationId();
  config.headers["X-SB-Correlation-Id"] = correlationId;
  // Метаданные запроса для последующей записи в журнал.
  (config as unknown as { _trace?: TraceMeta })._trace = { id: genId(), start: Date.now() };
  return config;
});

function record(
  config: unknown,
  status: number | null,
  ok: boolean,
  responseBody: unknown,
  error?: string,
) {
  const cfg = (config ?? {}) as {
    _trace?: TraceMeta;
    method?: string;
    url?: string;
    baseURL?: string;
    data?: unknown;
  };
  const trace = cfg._trace;
  logBus.add({
    id: trace?.id ?? genId(),
    correlationId: logBus.correlationId(),
    ts: Date.now(),
    method: (cfg.method ?? "get").toUpperCase(),
    url: (cfg.baseURL ?? "") + (cfg.url ?? ""),
    status,
    ok,
    durationMs: trace ? Date.now() - trace.start : null,
    requestBody: sanitizeBody(cfg.data),
    responseBody: sanitizeBody(responseBody),
    error,
  });
}

api.interceptors.response.use(
  (r) => {
    record(r.config, r.status, true, r.data);
    return r;
  },
  (error) => {
    const status = error?.response?.status ?? null;
    record(
      error?.config,
      status,
      false,
      error?.response?.data,
      status ? undefined : error?.message ?? "network_error",
    );
    if (status === 401) {
      useAuthStore.getState().logout();
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);
