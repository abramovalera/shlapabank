import { create } from "zustand";

const TOKEN_KEY = "shlapabank.token";

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // хранилище недоступно (приватный режим) — живём с токеном в памяти
  }
}

const LAST_PHONE_KEY = "shlapabank.lastPhone";

/** 10 цифр телефона последнего успешного входа — подставляем на экране входа. */
export function readLastPhone(): string {
  try {
    return localStorage.getItem(LAST_PHONE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeLastPhone(digits10: string) {
  try {
    localStorage.setItem(LAST_PHONE_KEY, digits10);
  } catch {
    // хранилище недоступно — просто не запомним
  }
}

const LOGIN_CHALLENGE_KEY = "shlapabank.loginChallenge";

/**
 * Шаг ввода кода входа — переживает обновление страницы (только в этой вкладке).
 * Сроки — моменты по часам браузера, посчитанные при получении ответа (момент ответа + секунды).
 */
export interface SavedLoginChallenge {
  challenge_id: string;
  phone_masked: string;
  /** 10 цифр телефона, с которым входили */
  phone: string;
  resendAt: number;
  expiresAt: number;
}

export function readLoginChallenge(): SavedLoginChallenge | null {
  try {
    const raw = sessionStorage.getItem(LOGIN_CHALLENGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SavedLoginChallenge>;
    if (
      typeof v.challenge_id !== "string" ||
      typeof v.phone_masked !== "string" ||
      typeof v.phone !== "string" ||
      typeof v.resendAt !== "number" ||
      typeof v.expiresAt !== "number"
    ) {
      return null;
    }
    return v as SavedLoginChallenge;
  } catch {
    return null;
  }
}

export function writeLoginChallenge(v: SavedLoginChallenge | null) {
  try {
    if (v) sessionStorage.setItem(LOGIN_CHALLENGE_KEY, JSON.stringify(v));
    else sessionStorage.removeItem(LOGIN_CHALLENGE_KEY);
  } catch {
    // хранилище недоступно — после обновления страницы начнём вход заново
  }
}

interface SessionState {
  token: string | null;
  /** Вышли из-за 401 (токен истёк) — на входе показываем плашку */
  expired: boolean;
  signIn: (token: string) => void;
  /** expired = true — только для выхода по 401, обычное «Выйти» без плашки */
  signOut: (expired?: boolean) => void;
}

export const useSession = create<SessionState>((set) => ({
  token: readToken(),
  expired: false,
  signIn: (token) => {
    writeToken(token);
    set({ token, expired: false });
  },
  signOut: (expired = false) => {
    writeToken(null);
    set({ token: null, expired });
  },
}));
