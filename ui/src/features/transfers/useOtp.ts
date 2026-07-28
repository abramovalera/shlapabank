import { useMutation } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

/**
 * Хук на запрос OTP-кода. В учебном режиме бэкенд возвращает код в ответе
 * (полей `otp` + `ttlSeconds` + `message`), в проде — только `ttlSeconds`.
 */
export interface OtpPreview {
  otp: string;
  ttlSeconds: number;
  message?: string;
}

export function useRequestOtp() {
  return useMutation({
    mutationFn: async (): Promise<OtpPreview> =>
      (await api.get("/helper/otp/preview")).data,
  });
}
