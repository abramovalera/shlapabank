import { useState } from "react";
import { useCancelOperation, useConfirmOperation, useGuardedMutate, useMe, useResendOperationCode } from "../../api/hooks";
import type { Operation } from "../../api/types";
import { Button } from "../../ui/Button";
import { Notice } from "../../ui/blocks";
import { CodeStep, expiryDeadline, resendDeadline } from "../../ui/code";
import { Modal } from "../../ui/Modal";
import { formatMoney, toCents } from "../../ui/format";

/** «+79991234567» → «+7 999 ***-45-67». */
function maskOwnPhone(phone: string | undefined): string {
  const d = (phone ?? "").replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return "ваш номер";
  return `+7 ${d.slice(0, 3)} ***-${d.slice(6, 8)}-${d.slice(8, 10)}`;
}

function cancelText(op: Operation) {
  return op.type === "MOBILE" || op.type === "UTILITY" ? "Отменить платёж" : "Отменить перевод";
}

/** Подтверждение операции кодом из SMS. */
export function ConfirmModal({
  operation,
  receivedAt,
  onFinished,
  onCancelled,
}: {
  operation: Operation;
  /** Когда получен ответ с этой операцией (Date.now()); по умолчанию — сейчас */
  receivedAt?: number;
  /** Операция завершилась (DONE/DECLINED) или больше не ждёт кода — показываем результат */
  onFinished: (id: number) => void;
  onCancelled: () => void;
}) {
  const me = useMe();
  const [op, setOp] = useState(operation);
  // «Новый код через …» и «код истёк» — от момента ответа + секунды из ответа (часы банка ≠ часы браузера)
  const [resendAt, setResendAt] = useState(() => resendDeadline(operation.code?.resend_in_seconds, receivedAt));
  const [expiresAt, setExpiresAt] = useState(() => expiryDeadline(operation.code?.expires_in_seconds, receivedAt));
  function takeOp(res: Operation) {
    const at = Date.now();
    setOp(res);
    setResendAt(resendDeadline(res.code?.resend_in_seconds, at));
    setExpiresAt(expiryDeadline(res.code?.expires_in_seconds, at));
  }
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const confirm = useConfirmOperation();
  const resend = useResendOperationCode();
  const cancel = useCancelOperation();
  const confirmOnce = useGuardedMutate(confirm);
  const resendOnce = useGuardedMutate(resend);
  const cancelOnce = useGuardedMutate(cancel);
  const busy = confirm.isPending || cancel.isPending;

  function submit(code: string) {
    if (busy) return;
    setError(null);
    confirmOnce(
      { id: op.id, code },
      {
        onSuccess: (res) => {
          if (res.status === "WAITING_CODE") {
            takeOp(res);
            setResetKey((k) => k + 1);
          } else {
            onFinished(res.id);
          }
        },
        onError: (e) => {
          // Попытки кончились или операция уже не ждёт кода — показываем её итог
          if (e.code === "code_attempts_exceeded" || e.status === 409 || (e.code === "invalid_code" && e.attemptsLeft === 0)) {
            onFinished(op.id);
            return;
          }
          if (e.code === "invalid_code" && e.attemptsLeft != null) {
            setError(`Неверный код. Осталось попыток: ${e.attemptsLeft}`);
          } else {
            setError(e.message);
          }
          setResetKey((k) => k + 1);
        },
      },
    );
  }

  function resendCode() {
    resendOnce(
      { id: op.id },
      {
        onSuccess: (res) => {
          takeOp(res);
          setError(null);
          setResetKey((k) => k + 1);
        },
        onError: (e) => {
          setError(e.message);
          // 429 resend_too_early: банк сообщает, сколько ещё ждать
          if (e.resendInSeconds != null) setResendAt(resendDeadline(e.resendInSeconds));
        },
      },
    );
  }

  function cancelOperation() {
    cancelOnce({ id: op.id }, { onSuccess: onCancelled, onError: (e) => setError(e.message) });
  }

  const cp = op.counterparty;
  const who = cp?.name || cp?.provider_name || cp?.operator_name || op.title;
  const where = cp?.bank_name || cp?.provider_name || cp?.operator_name || op.subtitle;
  const fee = toCents(op.fee);

  return (
    <Modal open title="Введите код из SMS" testId="confirm-modal" onClose={null}>
      <CodeStep
        testPrefix="confirm"
        sentTo={maskOwnPhone(me.data?.phone)}
        resendAt={resendAt}
        expiresAt={expiresAt}
        error={error}
        verifying={confirm.isPending}
        resending={resend.isPending || cancel.isPending}
        onSubmit={submit}
        onResend={resendCode}
        resetKey={resetKey}
        summary={
          <div className="flex items-center justify-between gap-3 rounded-control bg-page px-3.5 py-3" data-testid="confirm-summary">
            <span className="min-w-0">
              <span className="block truncate font-semibold" data-testid="confirm-recipient">
                {who}
              </span>
              <span className="text-[13px] text-ink-muted">
                {where && where !== who ? where : ""}
                {where && where !== who && fee > 0 ? " · " : ""}
                {fee > 0 && `с комиссией ${formatMoney(op.fee, { compact: true })}`}
              </span>
            </span>
            <span className="whitespace-nowrap text-xl font-bold" data-testid="confirm-total">
              {formatMoney(op.total)}
            </span>
          </div>
        }
        footer={
          <Button variant="secondary" data-testid="confirm-cancel" loading={cancel.isPending} disabled={confirm.isPending} onClick={cancelOperation}>
            {cancelText(op)}
          </Button>
        }
      />
    </Modal>
  );
}

/** Плашка «операция отменена» над формой. */
export function CancelledNotice() {
  return (
    <Notice tone="neutral" testId="operation-cancelled">
      Операция отменена, деньги не списаны.
    </Notice>
  );
}
