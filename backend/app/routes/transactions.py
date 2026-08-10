from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app import bugs
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


_CURRENCY_SYMBOL = {"RUB": "₽", "USD": "$", "EUR": "€", "CNY": "¥"}
_TOPUP_PURPOSE = {"gift": "Подарок", "salary": "Зарплата", "other": "Прочее"}


def _fmt_phone(p: str) -> str:
    d = "".join(ch for ch in p if ch.isdigit())
    if len(d) == 11 and d[0] in ("7", "8"):
        d = d[1:]
    if len(d) == 10:
        return f"+7 {d[0:3]} {d[3:6]} {d[6:8]} {d[8:10]}"
    return p


def _humanize_description(
    description: str | None,
) -> tuple[str | None, list[tuple[str, str]], str | None]:
    """Разбирает технический код операции.
    Возвращает (назначение, [доп. строки (label, value)], комментарий).
    Доп. строки формируются по типу операции — чтобы данные шли отдельными колонками."""
    import re

    from app.banks import BANKS_CATALOG

    if not description or not description.strip():
        return None, [], None
    raw = description.strip()

    comment: str | None = None
    m = re.search(r":comment_(.*)$", raw)
    if m:
        comment = m.group(1) or None
        raw = raw[: m.start()]
    raw = re.sub(r":fee_[^:]*", "", raw)  # комиссия — отдельной строкой

    parts = raw.split(":")
    head = parts[0]

    def part(i: int) -> str:
        return parts[i] if len(parts) > i else ""

    bank_label = {code: label for code, label in BANKS_CATALOG}

    if head in ("self_deposit", "topup"):
        purpose = part(1)
        extra = [("Категория", _TOPUP_PURPOSE.get(purpose, purpose))] if purpose else []
        return "Пополнение счёта", extra, comment
    if head in ("p2p_transfer", "p2p_transfer_by_account"):
        return "Перевод между своими счетами", [], comment
    if head == "external_transfer":
        extra = [("Счёт получателя", part(2))] if part(2) else []
        return "Перевод по номеру счёта в другой банк", extra, comment
    if head == "p2p_transfer_by_phone":
        extra = [("Счёт получателя", part(2))] if part(2) else []
        return "Перевод по номеру телефона (ShlapaBank)", extra, comment
    if head == "p2p_by_phone_external":
        extra = []
        if part(2):
            extra.append(("Телефон получателя", _fmt_phone(part(2))))
        if part(1):
            extra.append(("Банк получателя", bank_label.get(part(1), part(1))))
        return "Перевод по номеру телефона в другой банк", extra, comment
    if head == "card_to_card":
        extra = [("Карта получателя", part(2))] if part(2) else []
        return "Перевод по номеру карты", extra, comment
    if head == "external_card":
        extra = [("Карта получателя", part(2))] if part(2) else []
        return "Перевод по номеру карты в другой банк", extra, comment
    if head == "fx_exchange":
        extra = []
        pair = part(1)
        if pair:
            extra.append(("Направление", pair.replace("->", " → ")))
            if part(2):
                to_cur = pair.split("->")[-1]
                extra.append(("Зачислено", f"{part(2)} {to_cur}".strip()))
        return "Обмен валюты", extra, comment
    if head == "mobile":
        extra = []
        if part(1):
            extra.append(("Оператор", part(1)))
        if part(2):
            extra.append(("Номер телефона", _fmt_phone(part(2))))
        return "Оплата мобильной связи", extra, comment
    if head == "vendor":
        extra = []
        if part(1):
            extra.append(("Поставщик", part(1)))
        if part(2):
            extra.append(("Лицевой счёт", part(2)))
        return "Оплата поставщика", extra, comment
    return "Операция", [], comment


def _build_receipt_html(tx: Transaction, from_label: str | None, to_label: str | None) -> str:
    """Собирает стилизованный HTML-чек по операции."""
    from html import escape

    def _enum_value(value):
        return getattr(value, "value", value)

    created = tx.created_at.strftime("%d.%m.%Y · %H:%M") if tx.created_at else "—"
    fee = _fee_from_tx(tx)
    total = tx.amount + fee
    currency = str(_enum_value(tx.currency))
    symbol = _CURRENCY_SYMBOL.get(currency, currency)
    tx_type = str(_enum_value(tx.type))
    tx_status = str(_enum_value(tx.status))
    is_incoming = tx_type == "TOPUP"
    type_label = {"TOPUP": "Пополнение", "TRANSFER": "Перевод", "PAYMENT": "Платёж"}.get(tx_type, tx_type)
    status_label = {"COMPLETED": "Выполнено", "FAILED": "Отклонено", "PENDING": "В обработке"}.get(
        tx_status, tx_status
    )
    status_ok = tx_status == "COMPLETED"

    def money(v) -> str:
        # 12 345,67 — неразрывные пробелы для разрядов.
        s = f"{v:,.2f}".replace(",", " ").replace(".", ",")
        return f"{symbol} {s}"

    details, extra_rows, comment = _humanize_description(tx.description)
    sign = "+" if is_incoming else "−"

    rows: list[tuple[str, str]] = []
    if details:
        rows.append(("Назначение", details))
    rows.extend(extra_rows)  # детали по типу операции — каждая своей строкой
    rows.append(("Тип операции", type_label))
    rows.append(("Дата и время", created))
    if from_label:
        rows.append(("Счёт списания", from_label))
    if to_label:
        rows.append(("Счёт зачисления", to_label))
    if comment:
        rows.append(("Сообщение", f"«{comment}»"))
    if fee > 0:
        rows.append(("Комиссия", money(fee)))
    rows.append(("Номер операции", f"№{tx.id}"))

    rows_html = "".join(
        f'<div class="row"><span class="label">{escape(k)}</span>'
        f'<span class="value">{escape(v)}</span></div>'
        for k, v in rows
    )

    amount_color = "#1f9d57" if is_incoming else "#0B1223"
    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Чек операции №{tx.id} — {escape(BANK_LABEL)}</title>
  <style>
    :root {{ color-scheme: light; }}
    * {{ box-sizing: border-box; }}
    body {{
      font-family: "Segoe UI", Roboto, Arial, sans-serif;
      background: #EEF1F8; color: #0B1223; margin: 0; padding: 24px;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }}
    .receipt {{
      max-width: 420px; margin: 0 auto; background: #fff; border-radius: 18px;
      overflow: hidden; box-shadow: 0 10px 40px rgba(11,18,35,.12);
    }}
    .head {{
      background: linear-gradient(135deg, #FFA347 0%, #F09427 100%);
      padding: 22px 24px; color: #0B1223; display: flex; align-items: center; gap: 12px;
    }}
    .logo {{
      width: 40px; height: 40px; border-radius: 11px; background: rgba(11,18,35,.12);
      display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 20px;
    }}
    .brand {{ font-weight: 700; font-size: 17px; line-height: 1.1; }}
    .brand small {{ display: block; font-weight: 500; font-size: 11px; opacity: .8; margin-top: 2px; }}
    .amount-block {{ padding: 26px 24px 8px; text-align: center; }}
    .amount {{ font-size: 34px; font-weight: 700; letter-spacing: -.5px; color: {amount_color}; }}
    .amount .cur {{ font-size: 20px; }}
    .status {{
      display: inline-block; margin-top: 12px; padding: 5px 12px; border-radius: 999px;
      font-size: 12px; font-weight: 600;
      background: {"#E4F7EC" if status_ok else "#FDE7EB"}; color: {"#1f9d57" if status_ok else "#d3324b"};
    }}
    .rows {{ padding: 8px 24px 20px; }}
    .row {{ display: flex; justify-content: space-between; gap: 16px; padding: 11px 0; border-bottom: 1px solid #EEF1F8; }}
    .row:last-child {{ border-bottom: 0; }}
    .label {{ color: #6B7280; font-size: 13px; }}
    .value {{ font-weight: 600; font-size: 13px; text-align: right; }}
    .footer {{ padding: 16px 24px 24px; text-align: center; color: #9AA1AF; font-size: 11px; line-height: 1.5; }}
    @media print {{ body {{ background: #fff; padding: 0; }} .receipt {{ box-shadow: none; }} }}
  </style>
</head>
<body>
  <div class="receipt">
    <div class="head">
      <div class="logo">S</div>
      <div class="brand">{escape(BANK_LABEL)}<small>Электронный чек операции</small></div>
    </div>
    <div class="amount-block">
      <div class="amount">{sign} {money(total)}</div>
      <div class="status">{escape(status_label)}</div>
    </div>
    <div class="rows">
      {rows_html}
    </div>
    <div class="footer">
      Документ сформирован автоматически и не требует подписи.<br>
      {escape(BANK_LABEL)} · учебный проект
    </div>
  </div>
</body>
</html>"""


@router.get(
    "/{transaction_id}",
    response_model=TransactionPublic,
    summary="Получить одну операцию по id",
    description=(
        "Возвращает JSON операции. Доступ есть только если пользователь — инициатор операции "
        "либо один из её счетов принадлежит ему."
    ),
)
def get_transaction(
    transaction_id: int,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tx = db.scalar(select(Transaction).where(Transaction.id == transaction_id))
    if not tx:
        raise HTTPException(status_code=404, detail="not_found")
    if not _user_can_access_transaction(tx, current_user, db):
        raise HTTPException(status_code=404, detail="not_found")
    return tx


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
        # BE-4 (bugs): сортировка по возрастанию — старые операции оказываются сверху.
        .order_by(Transaction.created_at.asc() if bugs.on() else Transaction.created_at.desc())
    ).all()


@router.get(
    "/{transaction_id}/receipt",
    response_class=HTMLResponse,
    summary="Скачать HTML-чек по операции",
    description=(
        "Возвращает **HTML-чек** (не JSON!) с заголовком `Content-Disposition: attachment` — "
        "браузер предложит сохранить файл. Открыв файл в браузере, можно распечатать или "
        "сохранить как PDF через диалог печати.\n\n"
        "Доступен только для операций, где текущий пользователь — инициатор или владелец "
        "одного из счетов."
    ),
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

    def _acc_label(account_id: int | None) -> str | None:
        if not account_id:
            return None
        acc = db.scalar(select(Account).where(Account.id == account_id))
        if not acc:
            return None
        # В чеке (документе) показываем ПОЛНЫЙ номер счёта, а не маску.
        return f"«{acc.name}» · {acc.account_number}"

    from_label = _acc_label(tx.from_account_id)
    to_label = _acc_label(tx.to_account_id)

    html = _build_receipt_html(tx, from_label, to_label)
    return HTMLResponse(html, headers={"Content-Disposition": f'attachment; filename="chek-operacii-{tx.id}.html"'})
