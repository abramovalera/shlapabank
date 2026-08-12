"""Инвестиции — брокерский раздел.

Всё живое: цены тикают (app/invest_prices.py), рыночные заявки исполняются сразу,
лимитные висят и лениво исполняются, когда рынок пересекает лимит (проверка на
каждом чтении портфеля/заявок). Деньги ходят через брокерский счёт (Account с
account_type=BROKER), сделки пишутся в общую историю операций (тип INVEST).
"""

import csv
import io
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants import (
    BROKER_FEE_RATE,
    INVEST_MAX_ORDER,
    INVEST_MIN_ORDER,
    INVEST_PRICE_BAND,
)
from app.db import get_db
from app.invest_catalog import all_instruments, get_instrument, lot_size
from app import invest_prices as prices
from app.models import (
    Account,
    AccountType,
    Currency,
    InvestOrder,
    InvestPosition,
    OrderSide,
    OrderStatus,
    OrderType,
    Transaction,
    TransactionStatus,
    TransactionType,
    User,
)
from app.otp import validate_otp_for_user
from app.schemas import (
    BrokerDepositRequest,
    InstrumentDetail,
    InstrumentPublic,
    OrderBookResponse,
    OrderCreateRequest,
    OrderPublic,
    PortfolioResponse,
    PositionPublic,
)
from app.security import require_active_user

router = APIRouter(prefix="/api/v1/invest", tags=["invest"])

_Q = Decimal("0.01")
_Q4 = Decimal("0.0001")


def _q2(v: Decimal) -> Decimal:
    return v.quantize(_Q, rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# Брокерский счёт
# ---------------------------------------------------------------------------
def _broker_number(user_id: int) -> str:
    return f"BRK-{user_id:06d}"


def _get_or_create_broker(user: User, db: Session, *, lock: bool = False) -> Account:
    stmt = select(Account).where(
        Account.user_id == user.id, Account.account_type == AccountType.BROKER
    )
    if lock:
        stmt = stmt.with_for_update()
    acc = db.scalar(stmt)
    if acc:
        return acc
    acc = Account(
        account_number=_broker_number(user.id),
        user_id=user.id,
        account_type=AccountType.BROKER,
        currency=Currency.RUB,
        name="Брокерский счёт",
        balance=Decimal("0.00"),
    )
    db.add(acc)
    db.flush()
    if lock:
        acc = db.scalar(
            select(Account).where(Account.id == acc.id).with_for_update()
        )
    return acc


# ---------------------------------------------------------------------------
# Позиции
# ---------------------------------------------------------------------------
def _get_position(user_id: int, ticker: str, db: Session) -> InvestPosition | None:
    return db.scalar(
        select(InvestPosition).where(
            InvestPosition.user_id == user_id, InvestPosition.ticker == ticker
        )
    )


# ---------------------------------------------------------------------------
# Исполнение заявки (общая логика для market и созревших limit)
# ---------------------------------------------------------------------------
def _apply_fill(order: InvestOrder, exec_price: Decimal, broker: Account, db: Session) -> None:
    """Двигает деньги и позицию, помечает заявку исполненной. Вызывать под FOR UPDATE брокера."""
    qty = order.quantity
    gross = _q2(exec_price * qty)
    fee = _q2(gross * BROKER_FEE_RATE)
    pos = _get_position(order.user_id, order.ticker, db)

    if order.side == OrderSide.BUY:
        broker.balance -= gross + fee
        if pos is None:
            pos = InvestPosition(
                user_id=order.user_id, ticker=order.ticker,
                quantity=qty, avg_price=exec_price.quantize(_Q4),
            )
            db.add(pos)
        else:
            total_qty = pos.quantity + qty
            pos.avg_price = ((pos.avg_price * pos.quantity + exec_price * qty) / total_qty).quantize(_Q4)
            pos.quantity = total_qty
        tx_type_from, tx_type_to = broker.id, None
        desc = f"invest_buy:{order.ticker}:{qty}@{_q2(exec_price)}"
    else:  # SELL
        broker.balance += gross - fee
        pos.quantity -= qty
        if pos.quantity <= 0:
            db.delete(pos)
        tx_type_from, tx_type_to = None, broker.id
        desc = f"invest_sell:{order.ticker}:{qty}@{_q2(exec_price)}"

    now = datetime.utcnow()
    order.status = OrderStatus.EXECUTED
    order.executed_price = exec_price.quantize(_Q4)
    order.fee = fee
    order.executed_at = now

    db.add(order)
    db.add(broker)
    db.add(Transaction(
        from_account_id=tx_type_from,
        to_account_id=tx_type_to,
        type=TransactionType.INVEST,
        amount=gross,
        currency=Currency.RUB,
        status=TransactionStatus.COMPLETED,
        initiated_by=order.user_id,
        description=desc,
        fee=fee,
    ))


def _crossable(order: InvestOrder, market: Decimal) -> bool:
    """Пересекает ли рынок лимитную цену (готова ли заявка к исполнению)."""
    if order.side == OrderSide.BUY:
        return market <= order.price
    return market >= order.price


def _settle_active_orders(user: User, db: Session) -> int:
    """Ленивое исполнение созревших лимиток. Возвращает число исполненных."""
    active = list(db.scalars(
        select(InvestOrder).where(
            InvestOrder.user_id == user.id, InvestOrder.status == OrderStatus.ACTIVE
        ).order_by(InvestOrder.created_at)
    ))
    if not active:
        return 0
    broker = _get_or_create_broker(user, db, lock=True)
    filled = 0
    for order in active:
        market = prices.current_price(order.ticker)
        if not _crossable(order, market):
            continue
        if order.side == OrderSide.BUY:
            need = _q2(order.price * order.quantity)
            if broker.balance < need + _q2(need * BROKER_FEE_RATE):
                continue  # денег пока не хватает — оставляем висеть
        else:
            pos = _get_position(user.id, order.ticker, db)
            if not pos or pos.quantity < order.quantity:
                continue  # бумаг пока нет — оставляем висеть
        # Исполняем по лимитной цене (не хуже для клиента).
        _apply_fill(order, order.price, broker, db)
        filled += 1
    if filled:
        db.commit()
    return filled


# ---------------------------------------------------------------------------
# Каталог / котировки
# ---------------------------------------------------------------------------
def _instrument_public(instr: dict) -> dict:
    st = prices.day_stats(instr["ticker"])
    return {
        "ticker": instr["ticker"], "name": instr["name"], "cls": instr["cls"],
        "sector": instr["sector"], "lot": instr["lot"], "currency": "RUB",
        "isin": instr.get("isin", "-"),
        "price": st["last"], "change": st["change"], "change_pct": st["change_pct"],
    }


@router.get("/instruments", response_model=list[InstrumentPublic], summary="Каталог инструментов с котировками")
def list_instruments(
    cls: str | None = Query(default=None, description="Фильтр по классу: stock/bond/fund/fx"),
    sector: str | None = Query(default=None, description="Фильтр по сектору"),
    q: str | None = Query(default=None, description="Поиск по тикеру или названию"),
    current_user: User = Depends(require_active_user),
):
    items = all_instruments()
    if cls:
        items = [i for i in items if i["cls"] == cls]
    if sector and sector != "all":
        items = [i for i in items if i["sector"] == sector]
    if q:
        ql = q.strip().lower()
        items = [i for i in items if ql in i["ticker"].lower() or ql in i["name"].lower()]
    return [_instrument_public(i) for i in items]


@router.get("/quotes", summary="Лёгкая лента котировок (для бегущей строки)")
def quotes(current_user: User = Depends(require_active_user)):
    out = []
    for i in all_instruments():
        st = prices.day_stats(i["ticker"])
        out.append({"ticker": i["ticker"], "price": st["last"], "change_pct": st["change_pct"]})
    return {"updated_at": datetime.now(timezone.utc).isoformat(), "items": out}


@router.get("/instruments/{ticker}", response_model=InstrumentDetail, summary="Карточка инструмента")
def instrument_detail(
    ticker: str,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    instr = get_instrument(ticker)
    if not instr:
        raise HTTPException(status_code=404, detail="instrument_not_found")
    base = _instrument_public(instr)
    st = prices.day_stats(ticker)
    pos = _get_position(current_user.id, ticker, db)
    return {
        **base,
        "open": st["open"], "high": st["high"], "low": st["low"], "volume": st["volume"],
        "series": prices.intraday_series(ticker, 64),
        "dividend": instr.get("div"),
        "coupon": instr.get("coupon"),
        "maturity": instr.get("maturity"),
        "position_qty": pos.quantity if pos else 0,
        "position_avg_price": str(_q2(pos.avg_price)) if pos else None,
    }


@router.get("/instruments/{ticker}/orderbook", response_model=OrderBookResponse, summary="Стакан заявок")
def instrument_orderbook(
    ticker: str,
    depth: int = Query(default=7, ge=1, le=20),
    current_user: User = Depends(require_active_user),
):
    if not get_instrument(ticker):
        raise HTTPException(status_code=404, detail="instrument_not_found")
    return prices.orderbook(ticker, depth)


# ---------------------------------------------------------------------------
# Портфель
# ---------------------------------------------------------------------------
def _build_position_public(pos: InvestPosition) -> dict:
    instr = get_instrument(pos.ticker) or {"name": pos.ticker, "cls": "stock"}
    last = prices.current_price(pos.ticker)
    value = _q2(last * pos.quantity)
    cost = _q2(pos.avg_price * pos.quantity)
    pl = _q2(value - cost)
    pl_pct = (float(pl) / float(cost) * 100) if cost else 0.0
    return {
        "ticker": pos.ticker, "name": instr["name"], "cls": instr["cls"],
        "quantity": pos.quantity, "avg_price": str(_q2(pos.avg_price)),
        "last_price": str(last), "value": str(value),
        "pl": str(pl), "pl_pct": round(pl_pct, 2),
    }


@router.get("/portfolio", response_model=PortfolioResponse, summary="Портфель: кэш + позиции + P&L")
def portfolio(
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    _settle_active_orders(current_user, db)  # созревшие лимитки исполняются
    broker = _get_or_create_broker(current_user, db)
    db.commit()

    positions = list(db.scalars(
        select(InvestPosition).where(
            InvestPosition.user_id == current_user.id, InvestPosition.quantity > 0
        ).order_by(InvestPosition.ticker)
    ))
    pub = [_build_position_public(p) for p in positions]
    positions_value = sum((Decimal(p["value"]) for p in pub), Decimal("0"))
    cost = sum((_q2(p.avg_price * p.quantity) for p in positions), Decimal("0"))
    pl_total = _q2(positions_value - cost)
    pl_total_pct = (float(pl_total) / float(cost) * 100) if cost else 0.0
    total = _q2(broker.balance + positions_value)
    return {
        "broker_account_id": broker.id,
        "broker_account_number": broker.account_number,
        "cash": str(_q2(broker.balance)),
        "positions_value": str(_q2(positions_value)),
        "total": str(total),
        "pl_total": str(pl_total),
        "pl_total_pct": round(pl_total_pct, 2),
        "positions": pub,
    }


# ---------------------------------------------------------------------------
# Заявки
# ---------------------------------------------------------------------------
@router.get("/orders", response_model=list[OrderPublic], summary="Заявки (с ленивым исполнением лимиток)")
def list_orders(
    status: OrderStatus | None = Query(default=None),
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    _settle_active_orders(current_user, db)
    stmt = select(InvestOrder).where(InvestOrder.user_id == current_user.id)
    if status:
        stmt = stmt.where(InvestOrder.status == status)
    return list(db.scalars(stmt.order_by(InvestOrder.created_at.desc())))


@router.post("/orders", response_model=OrderPublic, status_code=201, summary="Выставить заявку (покупка/продажа)")
def create_order(
    payload: OrderCreateRequest,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    if not validate_otp_for_user(current_user.id, payload.otp_code):
        raise HTTPException(status_code=400, detail="invalid_otp_code")

    instr = get_instrument(payload.ticker)
    if not instr:
        raise HTTPException(status_code=404, detail="instrument_not_found")

    qty = payload.quantity
    if qty <= 0:
        raise HTTPException(status_code=400, detail="quantity_must_be_positive")
    lot = lot_size(payload.ticker)
    if qty % lot != 0:
        raise HTTPException(status_code=400, detail="lot_size_mismatch")

    market = prices.current_price(payload.ticker)

    if payload.order_type == OrderType.LIMIT:
        if payload.price is None:
            raise HTTPException(status_code=400, detail="limit_price_required")
        limit_price = payload.price.quantize(_Q4)
        band = market * INVEST_PRICE_BAND
        if abs(limit_price - market) > band:
            raise HTTPException(status_code=400, detail="price_out_of_band")
        order_price = limit_price
    else:
        order_price = market.quantize(_Q4)

    amount = _q2(order_price * qty)
    if amount < INVEST_MIN_ORDER or amount > INVEST_MAX_ORDER:
        raise HTTPException(status_code=400, detail="invest_amount_out_of_range")

    broker = _get_or_create_broker(current_user, db, lock=True)

    order = InvestOrder(
        user_id=current_user.id,
        ticker=payload.ticker,
        side=payload.side,
        order_type=payload.order_type,
        quantity=qty,
        price=order_price,
        status=OrderStatus.ACTIVE,
        account_id=broker.id,
    )

    # Проверки достаточности для немедленного исполнения / резерва.
    if payload.side == OrderSide.SELL:
        pos = _get_position(current_user.id, payload.ticker, db)
        if not pos or pos.quantity < qty:
            raise HTTPException(status_code=400, detail="insufficient_position")
    else:
        need = amount + _q2(amount * BROKER_FEE_RATE)
        if broker.balance < need:
            raise HTTPException(status_code=400, detail="insufficient_broker_funds")

    db.add(order)
    db.flush()

    # MARKET — исполняем сразу по рынку. Маркетируемая LIMIT (рынок уже за лимитом)
    # тоже исполняется сразу и по рынку — это выгоднее клиента.
    if payload.order_type == OrderType.MARKET or _crossable(order, market):
        _apply_fill(order, market.quantize(_Q4), broker, db)

    db.commit()
    db.refresh(order)
    return order


@router.delete("/orders/{order_id}", summary="Отменить лимитную заявку")
def cancel_order(
    order_id: int,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    order = db.scalar(select(InvestOrder).where(
        InvestOrder.id == order_id, InvestOrder.user_id == current_user.id
    ))
    if not order:
        raise HTTPException(status_code=404, detail="invest_order_not_found")
    if order.status != OrderStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="order_not_active")
    order.status = OrderStatus.CANCELLED
    db.add(order)
    db.commit()
    return {"detail": "order_cancelled", "id": order_id}


@router.post("/orders/cancel-all", summary="Отменить все активные заявки")
def cancel_all_orders(
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    active = list(db.scalars(select(InvestOrder).where(
        InvestOrder.user_id == current_user.id, InvestOrder.status == OrderStatus.ACTIVE
    )))
    for o in active:
        o.status = OrderStatus.CANCELLED
        db.add(o)
    db.commit()
    return {"detail": "orders_cancelled", "count": len(active)}


# ---------------------------------------------------------------------------
# Кэш брокерского счёта: пополнение / вывод
# ---------------------------------------------------------------------------
def _rub_source(account_id: int, user: User, db: Session) -> Account:
    acc = db.scalar(select(Account).where(
        Account.id == account_id, Account.user_id == user.id
    ).with_for_update())
    if not acc:
        raise HTTPException(status_code=404, detail="account_not_found")
    if acc.account_type != AccountType.DEBIT:
        raise HTTPException(status_code=400, detail="payment_requires_rub_account")
    if acc.currency != Currency.RUB:
        raise HTTPException(status_code=400, detail="payment_requires_rub_account")
    if not acc.is_active:
        raise HTTPException(status_code=400, detail="account_inactive")
    return acc


@router.post("/cash/deposit", summary="Пополнить брокерский счёт с RUB-счёта")
def broker_deposit(
    payload: BrokerDepositRequest,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    if not validate_otp_for_user(current_user.id, payload.otp_code):
        raise HTTPException(status_code=400, detail="invalid_otp_code")
    amount = _q2(payload.amount)
    src = _rub_source(payload.account_id, current_user, db)
    if src.balance < amount:
        raise HTTPException(status_code=400, detail="insufficient_funds")
    broker = _get_or_create_broker(current_user, db, lock=True)
    src.balance -= amount
    broker.balance += amount
    db.add(src); db.add(broker)
    db.add(Transaction(
        from_account_id=src.id, to_account_id=broker.id, type=TransactionType.TRANSFER,
        amount=amount, currency=Currency.RUB, status=TransactionStatus.COMPLETED,
        initiated_by=current_user.id, description="invest_cash_in", fee=Decimal("0"),
    ))
    db.commit()
    return {"detail": "broker_deposited", "cash": str(_q2(broker.balance))}


@router.post("/cash/withdraw", summary="Вывести свободные средства с брокерского счёта на RUB-счёт")
def broker_withdraw(
    payload: BrokerDepositRequest,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    if not validate_otp_for_user(current_user.id, payload.otp_code):
        raise HTTPException(status_code=400, detail="invalid_otp_code")
    amount = _q2(payload.amount)
    dst = _rub_source(payload.account_id, current_user, db)
    broker = _get_or_create_broker(current_user, db, lock=True)
    if broker.balance < amount:
        raise HTTPException(status_code=400, detail="insufficient_broker_funds")
    broker.balance -= amount
    dst.balance += amount
    db.add(dst); db.add(broker)
    db.add(Transaction(
        from_account_id=broker.id, to_account_id=dst.id, type=TransactionType.TRANSFER,
        amount=amount, currency=Currency.RUB, status=TransactionStatus.COMPLETED,
        initiated_by=current_user.id, description="invest_cash_out", fee=Decimal("0"),
    ))
    db.commit()
    return {"detail": "broker_withdrawn", "cash": str(_q2(broker.balance))}


# ---------------------------------------------------------------------------
# Календарь дивидендов/купонов + экспорт
# ---------------------------------------------------------------------------
@router.get("/dividends", summary="Календарь дивидендов и купонов по каталогу")
def dividends(current_user: User = Depends(require_active_user)):
    rows = []
    for i in all_instruments():
        if i["cls"] == "stock" and i.get("div"):
            rows.append({
                "ticker": i["ticker"], "name": i["name"], "kind": "dividend",
                "per_unit": i["div"], "note": f"{i['div']} ₽ на акцию (в год)",
            })
        if i["cls"] == "bond" and i.get("coupon"):
            rows.append({
                "ticker": i["ticker"], "name": i["name"], "kind": "coupon",
                "per_unit": i["coupon"], "note": f"купон {i['coupon']}% · погашение {i.get('maturity','—')}",
            })
    return {"items": rows}


@router.get("/orders/export.csv", summary="Экспорт заявок в CSV")
def export_orders_csv(
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    _settle_active_orders(current_user, db)
    orders = list(db.scalars(select(InvestOrder).where(
        InvestOrder.user_id == current_user.id
    ).order_by(InvestOrder.created_at.desc())))
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["id", "created_at", "ticker", "side", "type", "qty", "price", "executed_price", "fee", "status"])
    for o in orders:
        w.writerow([
            o.id, o.created_at.isoformat(), o.ticker, o.side.value, o.order_type.value,
            o.quantity, _q2(o.price), _q2(o.executed_price) if o.executed_price is not None else "",
            _q2(o.fee), o.status.value,
        ])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="invest-orders.csv"'},
    )
