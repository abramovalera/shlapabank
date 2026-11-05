import { useEffect, useState } from "react";
import { useAccounts, useCard, useCardRequisites, useChangeCardAccount, useGuardedMutate, useIssueCard } from "../../api/hooks";
import type { Account } from "../../api/types";
import { Badge, Card, LoadError, Notice, Skeleton } from "../../ui/blocks";
import { Button } from "../../ui/Button";
import { Modal } from "../../ui/Modal";
import { AccountSelect } from "../../ui/account";
import { maskCard } from "../../ui/format";

function CardFace({
  number,
  holder,
  expiry,
  cvv,
  blocked,
}: {
  number: string;
  holder: string;
  expiry: string;
  cvv?: string;
  blocked?: boolean;
}) {
  return (
    <div
      data-testid="card-face"
      className={`flex h-[132px] flex-col justify-between rounded-[14px] bg-navy p-[18px] text-white ${blocked ? "opacity-60" : ""}`}
    >
      <div className="flex items-center justify-between">
        <span className="font-bold">ShlapaBank</span>
        <span className="text-[13px] font-semibold text-ink-faint">МИР</span>
      </div>
      <div className="text-lg font-medium tracking-[2px]" data-testid="card-number">
        {number}
      </div>
      <div className="flex justify-between gap-3 text-xs text-ink-soft">
        <span className="truncate" data-testid="card-holder">
          {holder}
        </span>
        <span className="flex gap-3">
          {cvv && (
            <span>
              CVC <span data-testid="card-cvv" className="font-semibold text-white">{cvv}</span>
            </span>
          )}
          <span data-testid="card-expiry">{expiry}</span>
        </span>
      </div>
    </div>
  );
}

function IssueCard({ accounts }: { accounts: Account[] }) {
  const issue = useIssueCard();
  const issueOnce = useGuardedMutate(issue);
  const [accountId, setAccountId] = useState<number | null>(accounts[0]?.id ?? null);
  useEffect(() => {
    if (accountId == null && accounts[0]) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  return (
    <>
      <div className="text-sm text-ink-muted">
        Бесплатная виртуальная карта МИР для покупок в интернете. Выпустим сразу, деньги будут списываться с выбранного счёта.
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="card-issue-account" className="text-[13px] font-medium text-ink-muted">
          Счёт карты
        </label>
        <AccountSelect
          id="card-issue-account"
          testId="card-issue-account"
          accounts={accounts}
          value={accountId}
          onChange={setAccountId}
        />
      </div>
      {issue.error && (
        <Notice tone="error" testId="card-issue-error">
          {issue.error.message}
        </Notice>
      )}
      <Button
        data-testid="card-issue"
        disabled={accountId == null}
        loading={issue.isPending}
        onClick={() => accountId != null && issueOnce({ account_id: accountId })}
      >
        Выпустить карту
      </Button>
      {accountId == null && (
        <div className="-mt-1 text-center text-[13px] text-ink-muted" data-testid="card-issue-hint">
          Выберите счёт карты
        </div>
      )}
    </>
  );
}

export function CardSection() {
  const card = useCard();
  const accounts = useAccounts();
  const [shown, setShown] = useState(false);
  const requisites = useCardRequisites(shown && !!card.data);
  const [changing, setChanging] = useState(false);
  const [newAccountId, setNewAccountId] = useState<number | null>(null);
  const change = useChangeCardAccount();
  const changeOnce = useGuardedMutate(change);

  const list = accounts.data ?? [];
  const c = card.data;
  const cardAccount = c ? list.find((a) => a.id === c.account_id) : undefined;

  function openChange() {
    change.reset();
    setNewAccountId(c?.account_id ?? null);
    setChanging(true);
  }

  return (
    <Card className="flex flex-col gap-3.5 px-4 py-5 sm:px-6" testId="card-section">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold">Виртуальная карта</h2>
        {c?.status === "BLOCKED" && (
          <Badge tone="red" testId="card-status">
            Заблокирована
          </Badge>
        )}
      </div>

      {card.isPending || accounts.isPending ? (
        <>
          <Skeleton className="h-[132px] w-full rounded-[14px]" />
          <Skeleton className="h-10 w-full rounded-small" />
        </>
      ) : card.isError ? (
        <LoadError className="!px-0 !py-0" testId="card-error" message={card.error.message} onRetry={() => card.refetch()} />
      ) : !c ? (
        <IssueCard accounts={list} />
      ) : (
        <>
          <CardFace
            number={shown && requisites.data ? maskCard(requisites.data.number) : c.number_masked}
            holder={shown && requisites.data ? requisites.data.holder : c.holder}
            expiry={shown && requisites.data ? requisites.data.expiry : c.expiry}
            cvv={shown ? requisites.data?.cvv : undefined}
            blocked={c.status === "BLOCKED"}
          />
          {shown && requisites.isError && (
            <Notice tone="error" testId="card-requisites-error">
              {requisites.error.message}
            </Notice>
          )}
          <div className="text-[13px] text-ink-muted" data-testid="card-account">
            Списания со счёта <span className="font-semibold text-ink">{cardAccount?.name ?? "—"}</span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="soft"
              className="flex-1"
              data-testid="card-requisites-toggle"
              loading={shown && requisites.isFetching}
              onClick={() => setShown((s) => !s)}
            >
              {shown ? "Скрыть" : "Реквизиты"}
            </Button>
            <Button size="sm" variant="secondary" className="flex-1" data-testid="card-change-account" onClick={openChange}>
              Сменить счёт
            </Button>
          </div>
        </>
      )}

      <Modal
        open={changing}
        title="Счёт карты"
        subtitle="С этого счёта будут списываться покупки по карте"
        testId="card-change-modal"
        onClose={() => setChanging(false)}
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="card-change-select" className="text-[13px] font-medium text-ink-muted">
            Счёт
          </label>
          <AccountSelect
            id="card-change-select"
            testId="card-change-select"
            accounts={list}
            value={newAccountId}
            onChange={setNewAccountId}
          />
        </div>
        {change.error && (
          <Notice tone="error" testId="card-change-error">
            {change.error.message}
          </Notice>
        )}
        <div className="flex gap-2.5">
          <Button variant="secondary" className="flex-1" data-testid="card-change-cancel" onClick={() => setChanging(false)}>
            Отмена
          </Button>
          <Button
            className="flex-1"
            data-testid="card-change-submit"
            disabled={newAccountId == null || newAccountId === c?.account_id}
            loading={change.isPending}
            onClick={() =>
              newAccountId != null && changeOnce({ account_id: newAccountId }, { onSuccess: () => setChanging(false) })
            }
          >
            Сохранить
          </Button>
        </div>
        {newAccountId === c?.account_id && (
          <div className="-mt-2 text-center text-[13px] text-ink-muted" data-testid="card-change-submit-hint">
            Карта уже привязана к этому счёту
          </div>
        )}
      </Modal>
    </Card>
  );
}
