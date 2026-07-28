import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  token: string | null;
  role: string | null;
  login: string | null;
  loggedInAt: number | null; // timestamp последнего успешного входа
  pinHash: string | null;
  pinSetAt: number | null;
  setToken: (token: string, role: string | null, login: string) => void;
  setPin: (pin: string) => void;
  clearPin: () => void;
  verifyPin: (pin: string) => boolean;
  isPinExpired: () => boolean;
  touchPin: () => void;
  logout: () => void;
}

/** Простой не-крипто хеш — цель только избежать хранения PIN в открытом виде в localStorage. */
function hashPin(pin: string): string {
  let h = 0;
  const salted = `sb-pin::${pin}`;
  for (let i = 0; i < salted.length; i++) {
    h = ((h << 5) - h + salted.charCodeAt(i)) | 0;
  }
  return String(h);
}

const PIN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      role: null,
      login: null,
      loggedInAt: null,
      pinHash: null,
      pinSetAt: null,
      setToken: (token, role, login) =>
        set({ token, role, login, loggedInAt: Date.now() }),
      setPin: (pin) => set({ pinHash: hashPin(pin), pinSetAt: Date.now() }),
      clearPin: () => set({ pinHash: null, pinSetAt: null }),
      verifyPin: (pin) => {
        const st = get();
        if (!st.pinHash) return false;
        if (st.pinSetAt && Date.now() - st.pinSetAt > PIN_TTL_MS) return false;
        return st.pinHash === hashPin(pin);
      },
      isPinExpired: () => {
        const st = get();
        if (!st.pinHash || !st.pinSetAt) return false;
        return Date.now() - st.pinSetAt > PIN_TTL_MS;
      },
      touchPin: () => {
        // Обновляем timestamp — «PIN использовали, сбрасываем TTL».
        if (get().pinHash) set({ pinSetAt: Date.now() });
      },
      logout: () =>
        set({
          token: null,
          role: null,
          login: null,
          loggedInAt: null,
          pinHash: null,
          pinSetAt: null,
        }),
    }),
    { name: "sb_auth" }
  )
);
