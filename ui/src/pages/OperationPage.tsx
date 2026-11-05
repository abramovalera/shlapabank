import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { keys, useAccounts, useOperation } from "../api/hooks";
import type { Account, Operation } from "../api/types";
import { KeyValue, LoadError, Notice, Skeleton } from "../ui/blocks";
import { Button, ButtonLink } from "../ui/Button";
import { formatDateTime, formatMoney, formatPhone, toCents } from "../ui/format";
import { IconCheck, IconClock, IconCross } from "../ui/icons";
import { resultTitle } from "../ui/operation";
import { ConfirmModal } from "./payments/ConfirmModal";
import { NotFoundPage } from "./NotFoundPage";

function accountLabel(a: { name: string; number_masked: string }) {
  return `${a.name} ${a.number_masked}`;
}

/**
 * Строки деталей — только те, что есть у этого типа операции.
 * У проведённой операции под каждым счётом — его текущий баланс (из свежего списка счетов).
 */
function detailRows(op: Operation, accounts: Account[] | undefined): { key: string; label: string; value: string; fee?: boolean }[] {
  const cp = op.counterparty;
  const rows: { key: string; label: string; value: string; fee?: boolean }[] = [];
  const balanceRow = (key: string, id: number) => {
    const a = op.status === "DONE" ? accounts?.find((x) => x.id === id) : undefined;
    if (a) rows.push({ key, label: "Баланс сейчас", value: formatMoney(a.balance) });
  };
  if (cp?.phone) rows.push({ key: "phone", label: "Телефон", value: formatPhone(cp.phone) });
  if (cp?.card_masked) rows.push({ key: "card", label: "Карта", value: cp.card_masked });
  if (cp?.bank_name && op.type !== "OWN_TRANSFER") rows.push({ key: "bank", label: "Банк", value: cp.bank_name });
  if (cp?.operator_name) rows.push({ key: "operator", label: "Оператор", value: cp.operator_name });
  if (cp?.provider_name) rows.push({ key: "provider", label: "Поставщик", value: cp.provider_name });
  if (cp?.payer_account) rows.push({ key: "payer", label: "Лицевой счёт", value: cp.payer_account });
  if (op.direction === "in") {
    rows.push({ key: "account", label: "На счёт", value: accountLabel(op.account) });
  } else {
    rows.push({ key: "account", label: "Со счёта", value: accountLabel(op.account) });
  }
  balanceRow("balance", op.account.id);
  if (op.to_account) {
    rows.push({ key: "to-account", label: "На счёт", value: accountLabel(op.to_account) });
    balanceRow("to-balance", op.to_account.id);
  }
  if (op.direction === "out") {
    // Сумма, комиссия и итог списания — рядом, чтобы сходилось с суммой в истории
    const fee = toCents(op.fee);
    const payment = op.type === "MOBILE" || op.type === "UTILITY";
    rows.push({ key: "amount", label: payment ? "Сумма платежа" : "Сумма перевода", value: formatMoney(op.amount) });
    rows.push({ key: "fee", label: "Комиссия", value: fee > 0 ? formatMoney(op.fee) : "бесплатно", fee: fee > 0 });
    // У отклонённых и отменённых деньги не списаны
    const debited = op.status === "DONE" || op.status === "WAITING_CODE";
    rows.push({
      key: "total",
      label: op.status === "WAITING_CODE" ? "Спишем со счёта" : "Списано со счёта",
      value: formatMoney(debited ? op.total : 0),
    });
  }
  if (op.message) rows.push({ key: "message", label: "Сообщение", value: op.message });
  rows.push({ key: "date", label: "Дата", value: formatDateTime(op.completed_at ?? op.created_at) });
  rows.push({ key: "number", label: "Номер операции", value: op.number });
  return rows;
}

const STATUS_VIEW = {
  DONE: { bg: "bg-success-soft", text: "text-success-dark", icon: <IconCheck size={30} strokeWidth={2.2} color="#1a9e55" /> },
  DECLINED: { bg: "bg-danger-soft", text: "text-danger", icon: <IconCross size={30} strokeWidth={2.2} color="#d92d20" /> },
  CANCELLED: { bg: "bg-page", text: "text-ink-muted", icon: <IconCross size={30} strokeWidth={2.2} color="#6b7a8c" /> },
  WAITING_CODE: { bg: "bg-warn-soft", text: "text-warn", icon: <IconClock size={30} strokeWidth={2.2} color="#d9730d" /> },
};

export function OperationPage() {
  const { id } = useParams();
  const opId = /^\d+$/.test(id ?? "") ? Number(id) : null;
  const q = useOperation(opId);
  const accounts = useAccounts();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  // Операция проведена — баланс счетов должен быть свежим и здесь, и на главной после возврата
  const doneId = q.data?.status === "DONE" ? q.data.id : null;
  useEffect(() => {
    if (doneId != null) qc.invalidateQueries({ queryKey: keys.accounts });
  }, [doneId, qc]);

  if (opId == null || q.error?.status === 404) return <NotFoundPage />;

  const op = q.data;
  const view = op ? STATUS_VIEW[op.status] : null;
  const cp = op?.counterparty;
  // Без повторов: у ЖКХ название и поставщик совпадают («Сеть+ · Сеть+»)
  const who = op
    ? [cp?.name || op.title, cp?.bank_name || cp?.provider_name || cp?.operator_name]
        .filter((v, i, all): v is string => !!v && all.indexOf(v) === i)
        .join(" · ")
    : "";
  const amountText = op
    ? op.direction === "in" && op.status === "DONE"
      ? formatMoney(op.amount, { sign: "+" })
      : formatMoney(op.amount)
    : "";

  return (
    <main className="mx-auto flex max-w-page justify-center px-4 py-10 sm:px-6">
      <section
        data-testid="operation-result"
        className="flex w-full max-w-[500px] flex-col gap-5 rounded-dialog bg-white px-5 pb-7 pt-8 sm:px-7"
      >
        {q.isPending ? (
          <div className="flex flex-col items-center gap-3" aria-busy="true" aria-label="Загрузка">
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-40 w-full rounded-control" />
          </div>
        ) : q.isError || !op || !view ? (
          <LoadError className="!px-0" testId="operation-load-error" message={q.error?.message} onRetry={() => q.refetch()} />
        ) : (
          <>
            <div className="flex flex-col items-center gap-2.5 text-center">
              <span className={`grid h-16 w-16 place-items-center rounded-full ${view.bg}`}>{view.icon}</span>
              <span className={`text-[15px] font-semibold ${view.text}`} data-testid="operation-status" data-status={op.status}>
                {resultTitle(op)}
              </span>
              <span
                className={`text-[36px] font-bold leading-[44px] tracking-[-0.5px] ${
                  op.status === "DECLINED"
                    ? "text-ink-faint line-through"
                    : op.status === "CANCELLED"
                      ? "text-ink-faint"
                      : op.direction === "in"
                        ? "text-success"
                        : ""
                }`}
                data-testid="operation-amount"
              >
                {amountText}
              </span>
              <span className="text-ink-muted" data-testid="operation-counterparty">
                {op.type === "OWN_TRANSFER" ? op.subtitle || op.title : who}
              </span>
            </div>

            {op.status === "DECLINED" && (
              <Notice tone="error" title="Причина отказа" testId="operation-decline-reason">
                {op.decline_reason?.message ?? "Операция отклонена."}
              </Notice>
            )}
            {op.status === "WAITING_CODE" && (
              <Notice tone="info" testId="operation-waiting">
                Операция не подтверждена. Введите код из SMS, чтобы завершить её.
              </Notice>
            )}

            <div className="rounded-control bg-page px-4 py-1.5" data-testid="operation-details">
              {detailRows(op, accounts.data).map((r, i, all) => (
                <KeyValue
                  key={r.key}
                  label={r.label}
                  value={<span className={r.fee ? "font-semibold text-fee" : ""}>{r.value}</span>}
                  testId={`operation-detail-${r.key}`}
                  last={i === all.length - 1}
                />
              ))}
            </div>

            {op.status === "WAITING_CODE" && (
              <Button size="lg" data-testid="operation-confirm" onClick={() => setConfirming(true)}>
                Ввести код
              </Button>
            )}
            <div className="flex gap-2.5">
              <ButtonLink to="/history" variant="soft" className="flex-1" data-testid="operation-to-history">
                В историю
              </ButtonLink>
              <ButtonLink to="/" className="flex-1" data-testid="operation-to-home">
                На главную
              </ButtonLink>
            </div>
            {confirming && (
              <ConfirmModal
                operation={op}
                receivedAt={q.dataUpdatedAt}
                onFinished={(fid) => {
                  setConfirming(false);
                  q.refetch();
                  if (fid !== op.id) navigate(`/operations/${fid}`);
                }}
                onCancelled={() => {
                  setConfirming(false);
                  q.refetch();
                }}
              />
            )}
          </>
        )}
      </section>
    </main>
  );
}
