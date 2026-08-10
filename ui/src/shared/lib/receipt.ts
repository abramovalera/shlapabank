import { api } from "@/shared/api/client";

/**
 * Скачивает HTML-чек операции. Через axios (а не window.open), чтобы ушёл
 * заголовок Authorization — эндпоинт /transactions/{id}/receipt требует JWT,
 * иначе браузерный GET получает 401.
 */
export async function downloadReceipt(transactionId: number): Promise<void> {
  const res = await api.get(`/transactions/${transactionId}/receipt`, {
    responseType: "blob",
  });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chek-operacii-${transactionId}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
