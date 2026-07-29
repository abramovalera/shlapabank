import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  token: string | null;
  role: string | null;
  login: string | null;
  loggedInAt: number | null; // timestamp последнего успешного входа
  setToken: (token: string, role: string | null, login: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      role: null,
      login: null,
      loggedInAt: null,
      setToken: (token, role, login) =>
        set({ token, role, login, loggedInAt: Date.now() }),
      logout: () =>
        set({
          token: null,
          role: null,
          login: null,
          loggedInAt: null,
        }),
    }),
    { name: "sb_auth" }
  )
);
