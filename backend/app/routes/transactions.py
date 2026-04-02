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

    def _enum_value(value):
        return getattr(value, "value", value)

    def _format_details(description: str | None) -> str | None:
        if not description:
            return None
        raw = description.strip()
        if not raw:
            return None

        # Приводим технические коды в чеке к человекочитаемому виду.
        if raw.startswith("external_transfer:"):
            parts = raw.split(":")
            # Формат: external_transfer:<CURRENCY>:<MASKED_ACCOUNT>:fee_<FEE>
            if len(parts) >= 4:
                currency_part = parts[1]
                account_part = parts[2]
                fee_part = parts[3]
                fee_value = fee_part.replace("fee_", "", 1)
                return f"Внешний перевод ({currency_part}), счёт {account_part}, комиссия {fee_value}"
            return "Внешний перевод"
        if raw == "p2p_transfer":
            return "Перевод между своими счетами"
        if raw.startswith("mobile:"):
            # Формат: mobile:<OPERATOR>:<PHONE>
            parts = raw.split(":")
            if len(parts) >= 3:
                return f"Мобильная связь: {parts[1]}, номер {parts[2]}"
            return "Оплата мобильной связи"
        if raw.startswith("vendor:"):
            # Формат: vendor:<PROVIDER>:<ACCOUNT_NUMBER>
            parts = raw.split(":")
            if len(parts) >= 3:
                return f"Оплата поставщика: {parts[1]}, лицевой счёт {parts[2]}"
            return "Оплата поставщика"
        return raw

    created = tx.created_at.strftime("%d.%m.%Y %H:%M") if tx.created_at else ""
    fee = _fee_from_tx(tx)
    total = tx.amount + fee
    currency = _enum_value(tx.currency)
    tx_type = _enum_value(tx.type)
    tx_status = _enum_value(tx.status)
    amount_str = f"{total} {currency}"
    type_label = {"TOPUP": "Пополнение", "TRANSFER": "Перевод", "PAYMENT": "Платёж"}.get(
        str(tx_type), str(tx_type)
    )
    rows = [
        ("Сумма", amount_str),
    ]
    if fee > 0:
        rows.append(("Комиссия", f"{fee} {currency}"))
    rows.extend(
        [
            ("Дата и время", created),
            ("Тип операции", type_label),
            ("Статус", str(tx_status)),
        ]
    )
    if from_num:
        rows.append(("Счёт списания", from_num))
    if to_num:
        rows.append(("Счёт зачисления", to_num))
    details = _format_details(tx.description)
    if details:
        rows.append(("Детали", details))

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
  <div class="footer">Операция №{tx.id} · {tx_status}</div>
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
