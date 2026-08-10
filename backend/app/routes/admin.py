"""Admin API: список пользователей, блокировка, удаление, банки, транзакции, сброс БД."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session, joinedload

from app import bugs, chaos
from app.banks import OUR_BANK_CODE, get_external_bank_codes
from app.core.config import settings
from app.db import get_db
from app.models import Account, Transaction, User, UserBank, UserStatus
from app.models import UserRole
from app.schemas import TransactionPublic, UserBanksUpdateRequest, UserPublic
from app.security import require_admin

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


class ChaosConfig(BaseModel):
    """Состояние искусственных задержек API. `enabled` — единственное, что меняется
    тумблером; остальные поля read-only, для показа профиля задержек в админ-панели."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "enabled": True,
                "base_min_ms": 120,
                "base_max_ms": 450,
                "heavy_min_ms": 300,
                "heavy_max_ms": 900,
                "tail_probability": 0.12,
                "tail_min_ms": 1500,
                "tail_max_ms": 4000,
            }
        }
    )

    enabled: bool
    base_min_ms: int
    base_max_ms: int
    heavy_min_ms: int
    heavy_max_ms: int
    tail_probability: float
    tail_min_ms: int
    tail_max_ms: int


class ChaosUpdateRequest(BaseModel):
    model_config = ConfigDict(json_schema_extra={"example": {"enabled": True}})

    enabled: bool


def _chaos_config() -> ChaosConfig:
    return ChaosConfig(
        enabled=chaos.state.enabled,
        base_min_ms=settings.chaos_base_min_ms,
        base_max_ms=settings.chaos_base_max_ms,
        heavy_min_ms=settings.chaos_heavy_min_ms,
        heavy_max_ms=settings.chaos_heavy_max_ms,
        tail_probability=settings.chaos_tail_probability,
        tail_min_ms=settings.chaos_tail_min_ms,
        tail_max_ms=settings.chaos_tail_max_ms,
    )


@router.get(
    "/chaos",
    response_model=ChaosConfig,
    summary="Статус искусственных задержек API",
)
def get_chaos(current_user: User = Depends(require_admin)):
    return _chaos_config()


@router.put(
    "/chaos",
    response_model=ChaosConfig,
    summary="Включить/выключить искусственные задержки API",
)
def set_chaos(payload: ChaosUpdateRequest, current_user: User = Depends(require_admin)):
    chaos.state.enabled = payload.enabled
    return _chaos_config()


# ==================== Bugs: тренажёр «найди баг» ====================


class BugsConfig(BaseModel):
    model_config = ConfigDict(json_schema_extra={"example": {"enabled": False, "count": 10}})

    enabled: bool
    count: int


class BugsUpdateRequest(BaseModel):
    model_config = ConfigDict(json_schema_extra={"example": {"enabled": True}})

    enabled: bool


def _bugs_config() -> BugsConfig:
    return BugsConfig(enabled=bugs.state.enabled, count=len(bugs.BUG_CATALOG))


@router.get("/bugs", response_model=BugsConfig, summary="Статус режима багов")
def get_bugs(current_user: User = Depends(require_admin)):
    return _bugs_config()


@router.put("/bugs", response_model=BugsConfig, summary="Включить/выключить режим багов")
def set_bugs(payload: BugsUpdateRequest, current_user: User = Depends(require_admin)):
    bugs.state.enabled = payload.enabled
    return _bugs_config()


def _render_bugs_report_md() -> str:
    """Собирает «ключ ответов» — Markdown с описанием всех внедрённых багов."""
    status = "ВКЛючён" if bugs.state.enabled else "ВЫКЛючен"
    lines = [
        "# ShlapaBank — карта внедрённых багов",
        "",
        "> «Ключ ответов» для тренажёра «найди баг». Когда режим багов **выключен**, "
        "приложение работает корректно; когда **включён** — активны перечисленные ниже дефекты.",
        "",
        f"**Текущий статус режима багов:** {status}  ",
        f"**Всего багов:** {len(bugs.BUG_CATALOG)}",
        "",
        "---",
        "",
    ]
    for b in bugs.BUG_CATALOG:
        lines += [
            f"## {b['id']} — {b['title']}",
            "",
            f"- **Слой:** {b['layer']}",
            f"- **Тип:** {b['kind']}",
            f"- **Где:** {b['where']}",
            f"- **Как проявляется:** {b['symptom']}",
            f"- **Как ловить:** {b['detect']}",
            "",
        ]
    return "\n".join(lines)


@router.get(
    "/bugs/report",
    summary="Скачать описание багов (Markdown)",
    response_class=Response,
)
def download_bugs_report(current_user: User = Depends(require_admin)):
    md = _render_bugs_report_md()
    return Response(
        content=md,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="shlapabank-bugs.md"'},
    )


def _user_is_default_admin(user: User) -> bool:
    return (
        user.login == settings.default_admin_login
        or user.email == settings.default_admin_email
    )


@router.get(
    "/users",
    response_model=list[UserPublic],
    summary="Список пользователей",
)
def list_users(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    users = list(db.scalars(select(User).order_by(User.id)))
    return users


@router.post(
    "/users/{user_id}/block",
    response_model=UserPublic,
    summary="Заблокировать пользователя",
)
def block_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="user_not_found")
    if _user_is_default_admin(user):
        raise HTTPException(status_code=400, detail="cannot_block_admin")
    user.status = UserStatus.BLOCKED
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post(
    "/users/{user_id}/unblock",
    response_model=UserPublic,
    summary="Разблокировать пользователя",
)
def unblock_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="user_not_found")
    user.status = UserStatus.ACTIVE
    user.failed_login_attempts = 0
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.delete(
    "/users/{user_id}",
    status_code=200,
    summary="Удалить пользователя",
)
def delete_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="user_not_found")
    if _user_is_default_admin(user):
        raise HTTPException(status_code=400, detail="cannot_delete_admin")
    db.delete(user)
    db.commit()
    return {"detail": "user_deleted"}


@router.post(
    "/restore-initial-state",
    status_code=200,
    summary="Восстановление БД к исходному состоянию",
    description="Удаляются все пользователи, счета, транзакции; создаётся заново только дефолтный админ (admin/admin). "
    "Не использовать в автотестах — для ручной очистки.",
)
def restore_initial_state(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Восстановление БД к исходному состоянию: транзакции, счета, user_banks, пользователи удаляются; создаётся только дефолтный админ."""
    db.execute(delete(Transaction))
    db.execute(delete(Account))
    db.execute(delete(UserBank))
    db.execute(delete(User))

    admin = User(
        login=settings.default_admin_login,
        email=settings.default_admin_email,
        password_hash=settings.default_admin_password,
        role=UserRole.ADMIN,
    )
    db.add(admin)
    db.commit()
    return {"detail": "database_reset", "message": "БД восстановлена к исходному состоянию. Остался только дефолтный админ (admin/admin)."}


@router.get(
    "/users/{user_id}/banks",
    summary="Получить банки пользователя для перевода по телефону",
)
def get_user_banks(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="user_not_found")
    banks = list(
        db.scalars(
            select(UserBank).where(UserBank.user_id == user_id).order_by(UserBank.id)
        )
    )
    return {"bank_codes": [ub.bank_code for ub in banks]}


@router.put(
    "/users/{user_id}/banks",
    summary="Настроить банки пользователя (0–5 внешних банков)",
)
def update_user_banks(
    user_id: int,
    payload: UserBanksUpdateRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="user_not_found")

    if len(payload.bank_codes) > 5:
        raise HTTPException(status_code=400, detail="bank_limit_exceeded")
    external = set(get_external_bank_codes())
    if OUR_BANK_CODE in payload.bank_codes:
        raise HTTPException(status_code=400, detail="invalid_bank_codes")
    for code in payload.bank_codes:
        if code not in external:
            raise HTTPException(status_code=400, detail="invalid_bank_codes")

    # Удаляем старые, добавляем новые
    existing = list(
        db.scalars(select(UserBank).where(UserBank.user_id == user_id))
    )
    for ub in existing:
        db.delete(ub)
    for code in payload.bank_codes:
        db.add(UserBank(user_id=user_id, bank_code=code))
    db.commit()
    return {"detail": "banks_updated", "bank_codes": payload.bank_codes}


@router.get(
    "/users/{user_id}/transactions",
    response_model=list[TransactionPublic],
    summary="Транзакции пользователя",
)
def get_user_transactions(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="user_not_found")

    owned_account_ids = db.scalars(
        select(Account.id).where(Account.user_id == user_id)
    ).all()
    txs = db.scalars(
        select(Transaction)
        .where(
            or_(
                Transaction.initiated_by == user_id,
                Transaction.from_account_id.in_(owned_account_ids),
                Transaction.to_account_id.in_(owned_account_ids),
            )
        )
        .order_by(Transaction.created_at.desc())
    ).all()
    return list(txs)
