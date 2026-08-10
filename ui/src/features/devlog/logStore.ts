import { create } from "zustand";

/**
 * Клиентский журнал запросов/ответов для плавающей панели логов.
 * Тела редактируются от секретов. Живёт в памяти вкладки (кольцо MAX).
 *
 * Хеши:
 *  - id            — уникальный хеш ОДНОГО запроса (для поиска конкретного вызова);
 *  - correlationId — хеш ПАЧКИ запросов вкладки (X-SB-Correlation-Id), меняется
 *                    кнопкой «новая цепочка».
 */

export interface LogEntry {
  id: string;
  correlationId: string;
  ts: number;
  method: string;
  url: string;
  status: number | null; // null — сеть/таймаут без ответа
  ok: boolean;
  durationMs: number | null;
  requestBody?: unknown;
  responseBody?: unknown;
  error?: string;
}

const MAX = 400;

export function genId(len = 8): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID().replace(/-/g, "").slice(0, len);
    }
  } catch {
    /* ignore */
  }
  return Math.random().toString(16).slice(2, 2 + len);
}

const SENSITIVE = /^(password|current_password|new_password|confirm_password|access_token|refresh_token|token|otp|otp_code|secret|authorization)$/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? "••••" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Приводит тело (строка JSON или объект) к безопасному, редактированному, ограниченному виду. */
export function sanitizeBody(body: unknown): unknown {
  if (body === undefined || body === null || body === "") return undefined;
  let parsed: unknown = body;
  if (typeof body === "string") {
    try {
      parsed = JSON.parse(body);
    } catch {
      return body.length > 2000 ? body.slice(0, 2000) + "…" : body;
    }
  }
  if (parsed instanceof FormData) return "[FormData]";
  const red = redact(parsed);
  try {
    const s = JSON.stringify(red);
    if (s.length > 20_000) return JSON.parse(s.slice(0, 20_000)) ?? s.slice(0, 20_000) + "…";
  } catch {
    return "[unserializable]";
  }
  return red;
}

interface LogState {
  entries: LogEntry[];
  paused: boolean;
  correlationId: string;
  add: (e: LogEntry) => void;
  clear: () => void;
  setPaused: (v: boolean) => void;
  newCorrelation: () => string;
}

export const useLogStore = create<LogState>((set) => ({
  entries: [],
  paused: false,
  correlationId: genId(12),
  add: (e) =>
    set((s) => (s.paused ? s : { entries: [...s.entries.slice(-(MAX - 1)), e] })),
  clear: () => set({ entries: [] }),
  setPaused: (v) => set({ paused: v }),
  newCorrelation: () => {
    const id = genId(12);
    set({ correlationId: id });
    return id;
  },
}));

/** Не-хук доступ для axios-интерцептора (вне React-дерева). */
export const logBus = {
  correlationId: () => useLogStore.getState().correlationId,
  add: (e: LogEntry) => useLogStore.getState().add(e),
};
