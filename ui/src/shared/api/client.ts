import axios from "axios";
import { useAuthStore } from "@/shared/stores/auth";
import { clearSessionUnlock } from "@/features/auth/session";

/**
 * Единый axios-инстанс для всех запросов к бэкенду.
 * Подставляет Bearer-токен из auth-store и обрабатывает 401 (выкидывает на логин).
 */
export const api = axios.create({
  baseURL: "/api/v1",
  timeout: 15_000,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error?.response?.status === 401) {
      useAuthStore.getState().logout();
      clearSessionUnlock();
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);
