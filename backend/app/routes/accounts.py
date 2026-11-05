from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import clock
from app.db import get_db
from app.errors import ApiError
from app.models import Account, Card, User
from app.rules import mask_card, money
from app.schemas import AccountIn, AccountOut, CardIn, CardOut, CardRequisitesOut
from app.security import current_user
from app.seed import new_account, new_card
from app.sms import iso

router = APIRouter(tags=["Счета и карта"])

MAX_ACCOUNTS = 3


def own_open_account(db: Session, user: User, account_id: int, field: str = "account_id", lock: bool = False) -> Account:
    q = select(Account).where(Account.id == account_id, Account.user_id == user.id, Account.is_open.is_(True))
    if lock:
        q = q.with_for_update()
    account = db.scalar(q)
    if not account:
        raise ApiError(404, "account_not_found", field=field)
    return account


def account_out(account: Account, card: Card | None) -> AccountOut:
    return AccountOut(id=account.id, number=account.number, name=account.name, balance=money(account.balance),
                      has_card=bool(card and card.account_id == account.id), created_at=iso(account.created_at))


def card_out(card: Card) -> CardOut:
    return CardOut(id=card.id, number_masked=mask_card(card.number), last4=card.number[-4:], expiry=card.expiry,
                   holder=card.holder, account_id=card.account_id, status=card.status)


def _user_card(db: Session, user: User) -> Card | None:
    return db.scalar(select(Card).where(Card.user_id == user.id))


def _check_name_free(db: Session, user: User, name: str, except_id: int | None = None) -> None:
    q = select(Account.id).where(Account.user_id == user.id, Account.is_open.is_(True),
                                 func.lower(Account.name) == name.lower())
    if except_id:
        q = q.where(Account.id != except_id)
    if db.scalar(q):
        raise ApiError(409, "account_name_taken", field="name")


@router.get("/accounts", response_model=list[AccountOut], summary="Открытые счета")
def list_accounts(user: User = Depends(current_user), db: Session = Depends(get_db)):
    card = _user_card(db, user)
    accounts = db.scalars(select(Account).where(Account.user_id == user.id, Account.is_open.is_(True)).order_by(Account.id))
    return [account_out(a, card) for a in accounts]


@router.post("/accounts", status_code=201, response_model=AccountOut, summary="Открыть счёт")
def open_account(body: AccountIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    count = db.scalar(select(func.count()).where(Account.user_id == user.id, Account.is_open.is_(True)))
    if count >= MAX_ACCOUNTS:
        raise ApiError(409, "accounts_limit")
    _check_name_free(db, user, body.name)
    account = new_account(db, user, body.name)
    db.commit()
    return account_out(account, None)


@router.patch("/accounts/{account_id}", response_model=AccountOut, summary="Переименовать счёт")
def rename_account(account_id: int, body: AccountIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    account = own_open_account(db, user, account_id)
    _check_name_free(db, user, body.name, except_id=account.id)
    account.name = body.name
    db.commit()
    return account_out(account, _user_card(db, user))


@router.delete("/accounts/{account_id}", status_code=204, summary="Закрыть счёт")
def close_account(account_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Закрыть можно счёт с нулевым балансом, без карты и не единственный."""
    account = own_open_account(db, user, account_id)
    if account.balance != 0:
        raise ApiError(409, "account_not_empty")
    card = _user_card(db, user)
    if card and card.account_id == account.id:
        raise ApiError(409, "account_has_card")
    count = db.scalar(select(func.count()).where(Account.user_id == user.id, Account.is_open.is_(True)))
    if count <= 1:
        raise ApiError(409, "last_account")
    account.is_open = False
    account.closed_at = clock.now()
    db.commit()
    return Response(status_code=204)


@router.get("/card", response_model=CardOut, summary="Виртуальная карта")
def get_card(user: User = Depends(current_user), db: Session = Depends(get_db)):
    card = _user_card(db, user)
    if not card:
        raise ApiError(404, "card_not_found")
    return card_out(card)


@router.post("/card", status_code=201, response_model=CardOut, summary="Выпустить виртуальную карту")
def issue_card(body: CardIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if _user_card(db, user):
        raise ApiError(409, "card_already_exists")
    account = own_open_account(db, user, body.account_id)
    card = new_card(db, user, account)
    db.commit()
    return card_out(card)


@router.patch("/card", response_model=CardOut, summary="Привязать карту к другому счёту")
def relink_card(body: CardIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    card = _user_card(db, user)
    if not card:
        raise ApiError(404, "card_not_found")
    account = own_open_account(db, user, body.account_id)
    card.account_id = account.id
    db.commit()
    return card_out(card)


@router.get("/card/requisites", response_model=CardRequisitesOut, summary="Реквизиты карты")
def card_requisites(user: User = Depends(current_user), db: Session = Depends(get_db)):
    card = _user_card(db, user)
    if not card:
        raise ApiError(404, "card_not_found")
    return CardRequisitesOut(number=card.number, expiry=card.expiry, cvv=card.cvv, holder=card.holder)
