import { useCallback, useEffect, useRef } from "react";
import {
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type MutateOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import { http, toApiError, ApiError } from "./client";
import type {
  Account,
  Card,
  CardRequisites,
  Limits,
  LoginChallenge,
  MobileOperator,
  Operation,
  OperationBodies,
  OperationKind,
  OperationsPage,
  OperationsQuery,
  Provider,
  Recipient,
  Tariff,
  TokenResponse,
  User,
} from "./types";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      // 4xx не повторяем — повтор не поможет
      retry: (count, error) => {
        const e = toApiError(error);
        if (e.status >= 400 && e.status < 500) return false;
        return count < 1;
      },
    },
    mutations: { retry: false },
  },
});

async function get<T>(url: string, params?: object, signal?: AbortSignal): Promise<T> {
  try {
    const r = await http.get<T>(url, { params, signal });
    return r.data;
  } catch (e) {
    throw toApiError(e);
  }
}

async function send<T>(method: "post" | "patch" | "delete", url: string, body?: unknown): Promise<T> {
  try {
    const r = await http.request<T>({ method, url, data: body });
    return r.data;
  } catch (e) {
    throw toApiError(e);
  }
}

export const keys = {
  me: ["me"] as const,
  accounts: ["accounts"] as const,
  card: ["card"] as const,
  requisites: ["card", "requisites"] as const,
  tariffs: ["tariffs"] as const,
  limits: ["limits"] as const,
  providers: ["dictionary", "providers"] as const,
  operators: ["dictionary", "mobile-operators"] as const,
  operations: ["operations"] as const,
  operation: (id: number) => ["operation", id] as const,
};

/** После любой операции с деньгами обновляем всё, что от неё зависит. */
export function invalidateMoney(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: keys.accounts });
  qc.invalidateQueries({ queryKey: keys.card });
  qc.invalidateQueries({ queryKey: keys.operations });
  qc.invalidateQueries({ queryKey: keys.limits });
}

// ---------- Вход и регистрация ----------

export function useLogin() {
  return useMutation<LoginChallenge, ApiError, { phone: string; password: string }>({
    mutationFn: (body) => send("post", "/auth/login", body),
  });
}

export function useLoginConfirm() {
  return useMutation<TokenResponse, ApiError, { challenge_id: string; code: string }>({
    mutationFn: (body) => send("post", "/auth/login/confirm", body),
  });
}

/** Сроки шага кода по часам банка (сдвиг времени банка браузер сам не узнает). */
export function fetchLoginChallenge(challengeId: string) {
  return get<LoginChallenge>(`/auth/login/${encodeURIComponent(challengeId)}`);
}

export function useLoginResend() {
  return useMutation<LoginChallenge, ApiError, { challenge_id: string }>({
    mutationFn: (body) => send("post", "/auth/login/resend", body),
  });
}

export function useRegister() {
  return useMutation<
    User,
    ApiError,
    { phone: string; password: string; first_name: string; last_name: string }
  >({
    mutationFn: (body) => send("post", "/auth/register", body),
  });
}

export function useMe() {
  return useQuery<User, ApiError>({
    queryKey: keys.me,
    queryFn: ({ signal }) => get("/me", undefined, signal),
    staleTime: 5 * 60_000,
  });
}

// ---------- Счета ----------

export function useAccounts() {
  return useQuery<Account[], ApiError>({
    queryKey: keys.accounts,
    queryFn: ({ signal }) => get("/accounts", undefined, signal),
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation<Account, ApiError, { name: string }>({
    mutationFn: (body) => send("post", "/accounts", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.accounts }),
  });
}

export function useRenameAccount() {
  const qc = useQueryClient();
  return useMutation<Account, ApiError, { id: number; name: string }>({
    mutationFn: ({ id, name }) => send("patch", `/accounts/${id}`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.accounts });
      qc.invalidateQueries({ queryKey: keys.operations });
    },
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, { id: number }>({
    mutationFn: ({ id }) => send("delete", `/accounts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.accounts }),
  });
}

// ---------- Карта ----------

export function useCard() {
  return useQuery<Card | null, ApiError>({
    queryKey: keys.card,
    queryFn: async ({ signal }) => {
      try {
        return await get<Card>("/card", undefined, signal);
      } catch (e) {
        // нет карты — это не ошибка, а пустое состояние
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    // 404 сюда не доходит (это null), прочие 4xx тоже не повторяем
    retry: (count, error) => !(error.status >= 400 && error.status < 500) && count < 1,
  });
}

export function useCardRequisites(enabled: boolean) {
  return useQuery<CardRequisites, ApiError>({
    queryKey: keys.requisites,
    queryFn: ({ signal }) => get("/card/requisites", undefined, signal),
    enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useIssueCard() {
  const qc = useQueryClient();
  return useMutation<Card, ApiError, { account_id: number }>({
    mutationFn: (body) => send("post", "/card", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.card });
      qc.invalidateQueries({ queryKey: keys.accounts });
    },
  });
}

export function useChangeCardAccount() {
  const qc = useQueryClient();
  return useMutation<Card, ApiError, { account_id: number }>({
    mutationFn: (body) => send("patch", "/card", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.card });
      qc.invalidateQueries({ queryKey: keys.accounts });
    },
  });
}

// ---------- Справочники, тарифы, лимиты ----------

export function useTariffs() {
  return useQuery<Tariff[], ApiError>({
    queryKey: keys.tariffs,
    queryFn: ({ signal }) => get("/tariffs", undefined, signal),
    staleTime: 10 * 60_000,
  });
}

export function useLimits(enabled = true) {
  return useQuery<Limits, ApiError>({
    queryKey: keys.limits,
    queryFn: ({ signal }) => get("/limits", undefined, signal),
    enabled,
  });
}

export function useProviders() {
  return useQuery<Provider[], ApiError>({
    queryKey: keys.providers,
    queryFn: ({ signal }) => get("/dictionary/providers", undefined, signal),
    staleTime: 60 * 60_000,
  });
}

export function useMobileOperators() {
  return useQuery<MobileOperator[], ApiError>({
    queryKey: keys.operators,
    queryFn: ({ signal }) => get("/dictionary/mobile-operators", undefined, signal),
    staleTime: 60 * 60_000,
  });
}

// ---------- Получатели ----------
// При смене номера react-query отменяет устаревший запрос через signal.

export function useRecipientByPhone(phone: string | null) {
  return useQuery<Recipient, ApiError>({
    queryKey: ["recipient", "phone", phone],
    queryFn: ({ signal }) => get("/recipients/phone", { phone }, signal),
    enabled: !!phone,
    staleTime: 30_000,
    retry: false,
  });
}

export function useRecipientByCard(number: string | null) {
  return useQuery<Recipient, ApiError>({
    queryKey: ["recipient", "card", number],
    queryFn: ({ signal }) => get("/recipients/card", { number }, signal),
    enabled: !!number,
    staleTime: 30_000,
    retry: false,
  });
}

// ---------- Операции ----------

export function useOperation(id: number | null) {
  return useQuery<Operation, ApiError>({
    queryKey: keys.operation(id ?? 0),
    queryFn: ({ signal }) => get(`/operations/${id}`, undefined, signal),
    enabled: id != null && id > 0,
  });
}

/** Операции, ждущие кода из SMS (например, страницу обновили на шаге ввода кода). */
export function useWaitingOperations() {
  return useQuery<OperationsPage, ApiError>({
    queryKey: [...keys.operations, "waiting"],
    queryFn: ({ signal }) => get("/operations", { status: "WAITING_CODE", limit: 20, offset: 0 }, signal),
  });
}

export function useRecentOperations(limit = 5) {
  return useQuery<OperationsPage, ApiError>({
    queryKey: [...keys.operations, "recent", limit],
    queryFn: ({ signal }) => get("/operations", { limit, offset: 0 }, signal),
  });
}

export const PAGE_SIZE = 20;

export function useOperationsList(query: Omit<OperationsQuery, "limit" | "offset">) {
  return useInfiniteQuery<OperationsPage, ApiError>({
    queryKey: [...keys.operations, "list", query],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      get("/operations", { ...query, limit: PAGE_SIZE, offset: pageParam }, signal),
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total && last.items.length > 0 ? loaded : undefined;
    },
  });
}

/** Все операции по фильтру (страницами по 100) — для сводок. Ограничено 10 страницами. */
export function useAllOperations(query: Omit<OperationsQuery, "limit" | "offset">, enabled = true) {
  return useQuery<Operation[], ApiError>({
    queryKey: [...keys.operations, "all", query],
    enabled,
    queryFn: async ({ signal }) => {
      const result: Operation[] = [];
      for (let page = 0; page < 10; page++) {
        const r = await get<OperationsPage>(
          "/operations",
          { ...query, limit: 100, offset: page * 100 },
          signal,
        );
        result.push(...r.items);
        if (r.items.length === 0 || result.length >= r.total) break;
      }
      return result;
    },
  });
}

export function useCreateOperation<K extends OperationKind>(kind: K) {
  const qc = useQueryClient();
  return useMutation<Operation, ApiError, OperationBodies[K]>({
    mutationFn: (body) => send("post", `/operations/${kind}`, body),
    onSuccess: (op) => {
      qc.setQueryData(keys.operation(op.id), op);
      invalidateMoney(qc);
    },
  });
}

export function useConfirmOperation() {
  const qc = useQueryClient();
  return useMutation<Operation, ApiError, { id: number; code: string }>({
    mutationFn: ({ id, code }) => send("post", `/operations/${id}/confirm`, { code }),
    onSuccess: (op) => {
      qc.setQueryData(keys.operation(op.id), op);
      invalidateMoney(qc);
    },
    onError: (_e, { id }) => {
      // Попытки кончились или операция уже не ждёт кода — обновляем и её, и блок «Ждут подтверждения»
      qc.invalidateQueries({ queryKey: keys.operation(id) });
      qc.invalidateQueries({ queryKey: keys.operations });
    },
  });
}

export function useResendOperationCode() {
  const qc = useQueryClient();
  return useMutation<Operation, ApiError, { id: number }>({
    mutationFn: ({ id }) => send("post", `/operations/${id}/resend-code`),
    onSuccess: (op) => qc.setQueryData(keys.operation(op.id), op),
  });
}

/**
 * mutate с защитой от повторного вызова (двойной клик, повторный Enter).
 * isPending у мутации и disabled у кнопки применяются только после перерисовки, а второй клик
 * приходит раньше — поэтому синхронный флаг в ref. Возвращает false, если запрос уже идёт.
 */
export function useGuardedMutate<TData, TError, TVars, TCtx>(m: UseMutationResult<TData, TError, TVars, TCtx>) {
  const busy = useRef(false);
  // Мутацию сбросили (reset) посреди запроса — колбэки mutate не придут, снимаем флаг по isPending
  useEffect(() => {
    if (!m.isPending) busy.current = false;
  }, [m.isPending]);
  return (vars: TVars, opts?: MutateOptions<TData, TError, TVars, TCtx>): boolean => {
    if (busy.current || m.isPending) return false;
    busy.current = true;
    m.mutate(vars, {
      ...opts,
      onSettled: (...args) => {
        busy.current = false;
        opts?.onSettled?.(...args);
      },
    });
    return true;
  };
}

/**
 * Защита от повторного запуска для асинхронных действий, которые не мутации («Показать ещё»).
 * Пока предыдущий вызов не завершился, новый не запускается и возвращает undefined.
 */
export function useSingleFlight() {
  const busy = useRef(false);
  return useCallback(<T,>(fn: () => Promise<T>): Promise<T> | undefined => {
    if (busy.current) return undefined;
    busy.current = true;
    return fn().finally(() => {
      busy.current = false;
    });
  }, []);
}

export function useCancelOperation() {
  const qc = useQueryClient();
  return useMutation<Operation, ApiError, { id: number }>({
    mutationFn: ({ id }) => send("post", `/operations/${id}/cancel`),
    onSuccess: (op) => {
      qc.setQueryData(keys.operation(op.id), op);
      qc.invalidateQueries({ queryKey: keys.operations });
    },
  });
}
