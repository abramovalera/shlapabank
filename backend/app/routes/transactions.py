from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Account, Transaction, User
from app.schemas import TransactionPublic
from app.security import require_active_user

router = APIRouter(prefix="/api/v1/transactions", tags=["transactions"])


@router.get(
    "",
    response_model=list[TransactionPublic],
    summary="История всех операций пользователя",
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
