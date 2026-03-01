from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Account, Transaction, User
from app.schemas import TransactionPublic
from app.security import require_active_user

router = APIRouter(prefix="/api/v1/transactions", tags=["transactions"])

BANK_LABEL = "ShlapaBank"


def _user_can_access_transaction(tx: Transaction, current_user: User, db: Session) -> bool:
    """Проверка: транзакция принадлежит пользователю (инициатор или счета свои)."""
    if tx.initiated_by == current_user.id:
        return True
    owned = set(db.scalars(select(Account.id).where(Account.user_id == current_user.id)).all())
    if tx.from_account_id and tx.from_account_id in owned:
        return True
    if tx.to_account_id and tx.to_account_id in owned:
        return True
    return False


def _fee_from_tx(tx: Transaction) -> "Decimal":
    """Комиссия: из колонки fee или из description для старых записей."""
    from decimal import Decimal

    fee = getattr(tx, "fee", None)
    if fee is not None and fee > 0:
        return fee
    desc = tx.description or ""
    if ":fee_" in desc:
        try:
            part = desc.rsplit(":fee_", 1)[-1].split(":")[0]
            return Decimal(part)
        except Exception:
            pass
    return Decimal("0")


def _build_receipt_html(tx: Transaction, from_num: str | None, to_num: str | None) -> str:
    """Собирает HTML чека по операции."""
    from decimal import Decimal
    from html import escape

    created = tx.created_at.strftime("%d.%m.%Y %H:%M") if tx.created_at else ""
    fee = _fee_from_tx(tx)
    total = tx.amount + fee
    amount_str = f"{total} {tx.currency}"
    type_label = {"TOPUP": "Пополнение", "TRANSFER": "Перевод", "PAYMENT": "Платёж"}.get(
        str(tx.type), str(tx.type)
    )
    rows = [
        ("Сумма", amount_str),
        ("Дата и время", created),
        ("Тип операции", type_label),
        ("Статус", str(tx.status)),
    ]
    if fee > 0:
        rows.append(("Комиссия", f"{fee} {tx.currency}"))
    if from_num:
        rows.append(("Счёт списания", from_num))
    if to_num:
        rows.append(("Счёт зачисления", to_num))
    if tx.description:
        rows.append(("Детали", tx.description))

    rows_html = "".join(
        f'<div class="row"><span class="label">{escape(str(k))}</span><br><span class="value">{escape(str(v))}</span></div>'
        for k, v in rows
    )
    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <title>Чек операции №{tx.id}</title>
  <style>
    body {{ font-family: "Segoe UI", Arial, sans-serif; padding: 24px; max-width: 400px; margin: 0 auto; }}
    h1 {{ font-size: 18px; margin: 0 0 20px; }}
    .row {{ margin-bottom: 12px; }}
    .label {{ font-size: 12px; color: #666; }}
    .value {{ font-size: 15px; font-weight: 500; }}
    .footer {{ margin-top: 24px; font-size: 11px; color: #888; }}
  </style>
</head>
<body>
  <h1>{escape(BANK_LABEL)} — Чек операции</h1>
  {rows_html}
  <div class="footer">Операция №{tx.id} · {tx.status}</div>
</body>
</html>"""


@router.get(
    "",
    response_model=list[TransactionPublic],
    summary="Получить историю операций",
)
def list_transactions(
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    owned_account_ids = db.scalars(select(Account.id).where(Account.user_id == current_user.id)).all()
    return db.scalars(
        select(Transaction)
        .where(
            or_(
                Transaction.initiated_by == current_user.id,
                Transaction.from_account_id.in_(owned_account_ids),
                Transaction.to_account_id.in_(owned_account_ids),
            )
        )
        .order_by(Transaction.created_at.desc())
    ).all()


@router.get(
    "/{transaction_id}/receipt",
    response_class=HTMLResponse,
    summary="Скачать чек по операции",
    description="Возвращает HTML-чек для сохранения или печати. Доступен только для своих операций.",
)
def get_receipt(
    transaction_id: int,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tx = db.scalar(select(Transaction).where(Transaction.id == transaction_id))
    if not tx:
        raise HTTPException(status_code=404, detail="not_found")
    if not _user_can_access_transaction(tx, current_user, db):
        raise HTTPException(status_code=404, detail="not_found")

    from_num = None
    to_num = None
    if tx.from_account_id:
        acc = db.scalar(select(Account).where(Account.id == tx.from_account_id))
        if acc:
            from_num = acc.account_number
    if tx.to_account_id:
        acc = db.scalar(select(Account).where(Account.id == tx.to_account_id))
        if acc:
            to_num = acc.account_number

    html = _build_receipt_html(tx, from_num, to_num)
    return HTMLResponse(html, headers={"Content-Disposition": f'attachment; filename="chek-operacii-{tx.id}.html"'})
