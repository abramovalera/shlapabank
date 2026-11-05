import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAccounts, useCreateAccount, useDeleteAccount, useGuardedMutate, useRenameAccount } from "../../api/hooks";
import type { Account } from "../../api/types";
import type { ApiError } from "../../api/client";
import { Card, LoadError, Notice, RowsSkeleton } from "../../ui/blocks";
import { Button } from "../../ui/Button";
import { Field, TextInput } from "../../ui/fields";
import { Modal } from "../../ui/Modal";
import { AccountBadge, accountTone } from "../../ui/account";
import { formatAccountNumber, formatMoney, last4, lowerFirst, plural, toCents } from "../../ui/format";
import { IconCard, IconDots } from "../../ui/icons";
import { ACCOUNT_NAME_MAX } from "../../ui/validate";

export const ACCOUNTS_MAX = 3;

type ModalState =
  | { kind: "open" }
  | { kind: "details"; id: number }
  | { kind: "rename"; id: number }
  | { kind: "close"; id: number }
  | null;

function accountNameProblem(name: string, accounts: Account[], selfId: number | null): string | null {
  const v = name.trim();
  if (!v) return "Введите название счёта";
  if (v.length > ACCOUNT_NAME_MAX) return `Не длиннее ${ACCOUNT_NAME_MAX} символов`;
  const self = accounts.find((a) => a.id === selfId);
  if (self && self.name === v) return "Название не изменилось";
  if (accounts.some((a) => a.id !== selfId && a.name.toLowerCase() === v.toLowerCase())) {
    return "Счёт с таким названием уже есть";
  }
  return null;
}

/** Форма с названием счёта — для открытия и переименования. */
function AccountNameForm({
  testPrefix,
  initial,
  accounts,
  selfId,
  submitText,
  pending,
  apiError,
  onSubmit,
  onCancel,
  onEdit,
}: {
  testPrefix: string;
  initial: string;
  accounts: Account[];
  selfId: number | null;
  submitText: string;
  pending: boolean;
  apiError: ApiError | null;
  onSubmit: (name: string) => void;
  onCancel: () => void;
  onEdit: () => void;
}) {
  const [name, setName] = useState(initial);
  const problem = accountNameProblem(name, accounts, selfId);
  const fieldError = apiError && (apiError.field === "name" || apiError.code === "account_name_taken") ? apiError.message : null;
  const generalError = apiError && !fieldError ? apiError.message : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (problem || pending) return;
    onSubmit(name.trim());
  }

  return (
    <form className="flex flex-col gap-[18px]" onSubmit={submit} noValidate>
      <Field
        id={`${testPrefix}-name`}
        label="Название счёта"
        testId={`${testPrefix}-name`}
        error={fieldError}
        hint={`До ${ACCOUNT_NAME_MAX} символов`}
      >
        <TextInput
          id={`${testPrefix}-name`}
          data-testid={`${testPrefix}-name`}
          value={name}
          onValueChange={(v) => {
            setName(v);
            onEdit();
          }}
          maxLength={ACCOUNT_NAME_MAX}
          placeholder="Например, На отпуск"
          autoComplete="off"
          invalid={!!fieldError}
        />
      </Field>
      {generalError && (
        <Notice tone="error" testId={`${testPrefix}-error`}>
          {generalError}
        </Notice>
      )}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2.5">
          <Button variant="secondary" className="flex-1" onClick={onCancel} data-testid={`${testPrefix}-cancel`}>
            Отмена
          </Button>
          <Button type="submit" className="flex-1" disabled={!!problem} loading={pending} data-testid={`${testPrefix}-submit`}>
            {submitText}
          </Button>
        </div>
        {problem && (
          <div className="text-center text-[13px] text-ink-muted" data-testid={`${testPrefix}-submit-hint`}>
            {problem}
          </div>
        )}
      </div>
    </form>
  );
}

/** Все причины, по которым счёт сейчас нельзя закрыть (пусто — можно). */
function closeReasons(account: Account, accounts: Account[]): { id: string; text: string }[] {
  const reasons: { id: string; text: string }[] = [];
  if (toCents(account.balance) !== 0) reasons.push({ id: "balance", text: "На счёте есть деньги — сначала переведите их на другой счёт" });
  if (account.has_card) reasons.push({ id: "card", text: "К счёту привязана карта — сначала привяжите её к другому счёту" });
  if (accounts.length <= 1) reasons.push({ id: "last", text: "Это ваш единственный счёт" });
  return reasons;
}

export function AccountsSection() {
  const accounts = useAccounts();
  const [modal, setModal] = useState<ModalState>(null);
  const create = useCreateAccount();
  const rename = useRenameAccount();
  const remove = useDeleteAccount();
  const createOnce = useGuardedMutate(create);
  const renameOnce = useGuardedMutate(rename);
  const removeOnce = useGuardedMutate(remove);

  const list = accounts.data ?? [];
  const current = modal && modal.kind !== "open" ? list.find((a) => a.id === modal.id) ?? null : null;

  function closeModal() {
    setModal(null);
    create.reset();
    rename.reset();
    remove.reset();
  }

  return (
    <Card className="py-3" testId="accounts">
      <div className="flex items-baseline justify-between px-4 pb-1.5 pt-2 sm:px-6">
        <h2 className="text-[17px] font-semibold">Счета</h2>
        {accounts.data && (
          <span className="text-[13px] text-ink-faint" data-testid="accounts-count">
            {list.length} из {ACCOUNTS_MAX}
          </span>
        )}
      </div>

      {accounts.isPending ? (
        <RowsSkeleton rows={2} testId="accounts-loading" />
      ) : accounts.isError ? (
        <LoadError testId="accounts-error" message={accounts.error.message} onRetry={() => accounts.refetch()} />
      ) : (
        <>
          {list.map((a) => (
            <div key={a.id} className="flex items-center hover:bg-[#f8f9fb]" data-testid={`account-row-${a.id}`}>
              <Link
                to={`/history?account_id=${a.id}`}
                data-testid={`account-link-${a.id}`}
                className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-ink hover:text-ink hover:no-underline sm:pl-6"
              >
                <AccountBadge tone={accountTone(list, a.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold" data-testid={`account-name-${a.id}`}>
                    {a.name}
                  </span>
                  {/* Номер и значок карты — одной строкой без переносов */}
                  <span className="flex items-center gap-1.5 whitespace-nowrap text-[13px] text-ink-faint">
                    <span data-testid={`account-number-${a.id}`}>•• {last4(a.number)}</span>
                    {a.has_card && (
                      <span
                        className="inline-flex text-ink-muted"
                        title="К счёту привязана карта"
                        aria-label="с картой"
                        role="img"
                        data-testid={`account-card-icon-${a.id}`}
                      >
                        <IconCard size={15} />
                      </span>
                    )}
                  </span>
                </span>
                <span className="flex-none whitespace-nowrap font-semibold" data-testid={`account-balance-${a.id}`}>
                  {formatMoney(a.balance)}
                </span>
              </Link>
              <button
                type="button"
                data-testid={`account-menu-${a.id}`}
                aria-label={`Действия со счётом «${a.name}»`}
                onClick={() => setModal({ kind: "details", id: a.id })}
                className="mx-1.5 grid h-9 w-9 flex-none place-items-center rounded-full text-ink-muted hover:bg-page hover:text-ink sm:mr-3"
              >
                <IconDots />
              </button>
            </div>
          ))}
          {list.length >= ACCOUNTS_MAX ? (
            <div className="mx-4 mb-1 mt-2 rounded-small bg-page px-3 py-2.5 text-[13px] text-ink-muted sm:mx-6" data-testid="accounts-limit-note">
              Открыто {list.length} {plural(list.length, "счёт", "счёта", "счетов")} из {ACCOUNTS_MAX} возможных. Чтобы
              открыть новый, закройте счёт с нулевым балансом.
            </div>
          ) : (
            <div className="px-4 pb-1 pt-2 sm:px-6">
              <Button
                variant="soft"
                size="sm"
                className="w-full"
                data-testid="accounts-open"
                onClick={() => setModal({ kind: "open" })}
              >
                Открыть новый счёт
              </Button>
            </div>
          )}
        </>
      )}

      <Modal open={modal?.kind === "open"} title="Новый счёт" testId="account-open-modal" onClose={closeModal}>
        <AccountNameForm
          testPrefix="account-open"
          initial=""
          accounts={list}
          selfId={null}
          submitText="Открыть счёт"
          pending={create.isPending}
          apiError={create.error}
          onEdit={() => create.reset()}
          onCancel={closeModal}
          onSubmit={(name) => createOnce({ name }, { onSuccess: closeModal })}
        />
      </Modal>

      {current && modal?.kind === "details" && (
        <Modal open title={current.name} testId="account-details-modal" onClose={closeModal}>
          <div className="rounded-control bg-page px-4 py-1.5">
            <div className="flex justify-between gap-4 py-2 shadow-row-bottom">
              <span className="text-ink-muted">Баланс</span>
              <span className="font-semibold" data-testid="account-details-balance">
                {formatMoney(current.balance)}
              </span>
            </div>
            <div className="flex flex-col py-2">
              <span className="text-ink-muted">Номер счёта</span>
              <span className="font-medium" data-testid="account-details-number">
                {formatAccountNumber(current.number)}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="soft" data-testid="account-details-rename" onClick={() => setModal({ kind: "rename", id: current.id })}>
              Переименовать
            </Button>
            {(() => {
              // Окно подтверждения — только когда закрыть можно; иначе кнопка неактивна и под ней все причины
              const reasons = closeReasons(current, list);
              return (
                <>
                  <Button
                    variant="danger"
                    data-testid="account-details-close"
                    disabled={reasons.length > 0}
                    onClick={() => setModal({ kind: "close", id: current.id })}
                  >
                    Закрыть счёт
                  </Button>
                  {reasons.length > 0 && (
                    <div className="text-[13px] text-ink-muted" data-testid="account-details-close-hint">
                      Счёт нельзя закрыть:
                      <ul className="mt-1 list-disc pl-5">
                        {reasons.map((r) => (
                          <li key={r.id} data-testid={`account-details-close-reason-${r.id}`}>
                            {r.text}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </Modal>
      )}

      {current && modal?.kind === "rename" && (
        <Modal open title="Переименовать счёт" testId="account-rename-modal" onClose={closeModal}>
          <AccountNameForm
            testPrefix="account-rename"
            initial={current.name}
            accounts={list}
            selfId={current.id}
            submitText="Сохранить"
            pending={rename.isPending}
            apiError={rename.error}
            onEdit={() => rename.reset()}
            onCancel={closeModal}
            onSubmit={(name) => renameOnce({ id: current.id, name }, { onSuccess: closeModal })}
          />
        </Modal>
      )}

      {current && modal?.kind === "close" && (
        <Modal open title={`Закрыть счёт «${current.name}»?`} testId="account-close-modal" onClose={closeModal}>
          {(() => {
            // Сюда попадаем, только когда закрыть можно; если за это время что-то изменилось — покажем причины
            const reasons = closeReasons(current, list);
            return (
              <>
                {reasons.length > 0 ? (
                  <Notice tone="info" testId="account-close-blocker">
                    Счёт нельзя закрыть: {reasons.map((r) => lowerFirst(r.text)).join("; ")}.
                  </Notice>
                ) : (
                  <div className="text-ink-muted">Счёт закроется, восстановить его будет нельзя.</div>
                )}
                {remove.error && (
                  <Notice tone="error" testId="account-close-error">
                    {remove.error.message}
                  </Notice>
                )}
                <div className="flex gap-2.5">
                  <Button variant="secondary" className="flex-1" onClick={closeModal} data-testid="account-close-cancel">
                    Отмена
                  </Button>
                  <Button
                    variant="danger"
                    className="flex-1"
                    disabled={reasons.length > 0}
                    loading={remove.isPending}
                    data-testid="account-close-confirm"
                    onClick={() => removeOnce({ id: current.id }, { onSuccess: closeModal })}
                  >
                    Закрыть счёт
                  </Button>
                </div>
              </>
            );
          })()}
        </Modal>
      )}
    </Card>
  );
}
