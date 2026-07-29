"""Единая точка получения OTP — `/helper/otp/preview`.

Используется во всех операциях, требующих подтверждения кодом:
- Переводы, платежи (клиент залогинен → берём его user).
- Смена пароля в профиле (клиент залогинен).
- Восстановление пароля (не залогинен → передаём ?login=X).

Один эндпоинт, один формат ответа.
"""

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.db import get_db
from app.dependencies import get_account_for_helper, get_own_active_account
from app.models import Account, Transaction, TransactionStatus, TransactionType, User, UserRole
from app.otp import OTP_TTL_MINUTES, issue_otp_preview
from app.schemas import AccountPublic
from app.security import require_active_user

router = APIRouter(prefix="/api/v1/helper", tags=["helper"])


def _resolve_user_by_token(authorization: str | None, db: Session) -> User | None:
    """Мягкий парсер токена — если валидный, возвращает user; иначе None (не бросает)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    try:
        from jose import jwt
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        sub = payload.get("sub")
        if not sub:
            return None
        return db.scalar(select(User).where(User.id == int(sub)))
    except Exception:
        return None


@router.get(
    "/accounts",
    summary="Получить список счетов (админ — все, клиент — свои)",
)
def helper_list_accounts(
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    if current_user.role == UserRole.ADMIN:
        accounts = list(
            db.scalars(
                select(Account)
                .options(joinedload(Account.owner))
                .where(Account.is_active.is_(True))
                .order_by(Account.id)
            )
        )
        return [
            {
                **AccountPublic.model_validate(a).model_dump(),
                "owner_login": a.owner.login if a.owner else None,
            }
            for a in accounts
        ]
    accounts = list(
        db.scalars(
            select(Account).where(
                Account.user_id == current_user.id,
                Account.is_active.is_(True),
            ).order_by(Account.id)
        )
    )
    return [AccountPublic.model_validate(a).model_dump() for a in accounts]


@router.get(
    "/otp/preview",
    summary="Получить актуальный OTP-код (единая точка)",
    description=(
        "**Единая точка выдачи OTP** для всех операций.\n\n"
        "Два режима:\n"
        "1. **С Bearer-токеном (без параметров)** — вернёт OTP для текущего пользователя. "
        "Используется для подтверждения переводов, платежей, смены пароля в профиле.\n"
        "2. **Без токена, с параметром `?login=<логин>`** — вернёт OTP для указанного пользователя. "
        "Используется в восстановлении пароля, когда клиент ещё не залогинен.\n\n"
        "**Учебный проект:** реального SMS нет — OTP возвращается прямо в ответе для удобства "
        "тестирования и подсказки в UI. В проде этот эндпоинт должен быть закрыт."
    ),
)
def helper_otp_preview(
    login: str | None = Query(
        default=None,
        description="Логин пользователя. Указывать только если Bearer-токена нет.",
        example=None,
    ),
    authorization: str | None = Header(default=None, include_in_schema=False),
    db: Session = Depends(get_db),
):
    user: User | None = None
    if login:
        user = db.scalar(select(User).where(User.login == login))
        # Не палим существование логина — возвращаем как будто OK.
        # Плюс: OTP админу через login-режим никогда не отдаём (иначе через
        # /helper + /password/reset-confirm можно было бы залезть в админку без Bearer).
        if not user or user.role == UserRole.ADMIN:
            return {
                "userId": None,
                "otp": None,
                "ttlSeconds": OTP_TTL_MINUTES * 60,
                "message": "Если пользователь существует, код сгенерирован",
            }
    else:
        user = _resolve_user_by_token(authorization, db)
        if not user:
            raise HTTPException(status_code=401, detail="unauthorized")

    code = issue_otp_preview(user.id)
    return {
        "userId": user.id,
        "otp": code,
        "ttlSeconds": OTP_TTL_MINUTES * 60,
        "message": f"Ваш код подтверждения: {code}",
    }


# Лимит баланса и сумм: Numeric(14, 2) — макс 12 знаков до запятой
_MAX_BALANCE = Decimal("999999999999.99")


@router.post(
    "/accounts/{account_id}/increase",
    response_model=AccountPublic,
    summary="Увеличить баланс счёта (без OTP)",
)
def helper_increase_balance(
    account_id: int,
    amount: Decimal = Query(..., gt=0, description="Сумма пополнения"),
    purpose: str | None = Query(None, description="salary (только админ), gift, или пусто — пополнение"),
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    if amount > _MAX_BALANCE:
        raise HTTPException(status_code=400, detail="amount_too_large")
    if purpose == "salary" and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="salary_credit_admin_only")
    account = get_account_for_helper(account_id, current_user, db)
    if account.balance + amount > _MAX_BALANCE:
        raise HTTPException(status_code=400, detail="amount_too_large")
    account.balance += amount
    db.add(account)

    desc = "helper_topup"
    if purpose == "salary":
        desc = "admin_credit"
    elif purpose == "gift":
        desc = "helper_topup:gift"

    tx = Transaction(
        from_account_id=None,
        to_account_id=account.id,
        type=TransactionType.TOPUP,
        amount=amount,
        currency=account.currency,
        status=TransactionStatus.COMPLETED,
        initiated_by=current_user.id,
        description=desc,
        fee=Decimal("0"),
    )
    db.add(tx)
    db.commit()
    db.refresh(account)
    return account


@router.post(
    "/accounts/{account_id}/decrease",
    response_model=AccountPublic,
    summary="Уменьшить баланс счёта",
)
def helper_decrease_balance(
    account_id: int,
    amount: Decimal = Query(..., gt=0, description="Сумма списания"),
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    account = get_own_active_account(account_id, current_user, db)
    if account.balance < amount:
        raise HTTPException(status_code=400, detail="insufficient_funds")
    account.balance -= amount
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.post(
    "/accounts/{account_id}/zero",
    response_model=AccountPublic,
    summary="Обнулить счёт",
)
def helper_zero_balance(
    account_id: int,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    account = get_own_active_account(account_id, current_user, db)
    account.balance = Decimal("0.00")
    db.add(account)
    db.commit()
    db.refresh(account)
    return account
