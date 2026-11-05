from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import rules
from app.db import get_db
from app.models import MobileOperator, Provider, Tariff, User
from app.schemas import LimitsOut, LimitUsage, OperatorOut, ProviderOut, TariffOut
from app.security import current_user

router = APIRouter(tags=["Тарифы, лимиты, справочники"])


@router.get("/tariffs", response_model=list[TariffOut], summary="Тарифы: комиссии и суммы")
def tariffs(_: User = Depends(current_user), db: Session = Depends(get_db)):
    return [
        TariffOut(operation_type=t.operation_type, title=t.title, fee_percent=str(t.fee_percent.normalize()),
                  fee_min=rules.money(t.fee_min), amount_min=rules.money(t.amount_min),
                  amount_max=rules.money(t.amount_max), needs_code=t.needs_code)
        for t in db.scalars(select(Tariff).order_by(Tariff.sort))
    ]


@router.get("/limits", response_model=LimitsOut, summary="Лимиты и сколько осталось")
def limits(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """В лимиты входят переводы другим людям и платежи вместе с комиссией."""
    s = rules.limits_state(db, user.id)

    def usage(d: dict) -> LimitUsage:
        return LimitUsage(limit=rules.money(d["limit"]), used=rules.money(d["used"]), left=rules.money(d["left"]))

    return LimitsOut(per_operation=rules.money(s["per_operation"]), daily=usage(s["daily"]), monthly=usage(s["monthly"]))


@router.get("/dictionary/providers", response_model=list[ProviderOut], summary="Поставщики ЖКХ и услуг")
def providers(_: User = Depends(current_user), db: Session = Depends(get_db)):
    return [ProviderOut(code=p.code, name=p.name, category=p.category, payer_account_length=p.payer_account_length)
            for p in db.scalars(select(Provider).order_by(Provider.sort))]


@router.get("/dictionary/mobile-operators", response_model=list[OperatorOut], summary="Операторы связи")
def operators(_: User = Depends(current_user), db: Session = Depends(get_db)):
    by_name: dict[str, list[str]] = defaultdict(list)
    for op in db.scalars(select(MobileOperator).order_by(MobileOperator.prefix)):
        by_name[op.name].append(op.prefix)
    return [OperatorOut(name=name, prefixes=prefixes) for name, prefixes in by_name.items()]
