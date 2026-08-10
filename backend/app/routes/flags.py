"""Публичные фиче-флаги для фронтенда.

Фронту нужно знать, включён ли режим багов (некоторые дефекты — на клиенте) и
режим задержек. Значения только на чтение; менять — через admin-эндпоинты.
Без авторизации: это два безобидных булевых флага стенда.
"""
from fastapi import APIRouter
from pydantic import BaseModel

from app import bugs, chaos
from app.core.config import settings

router = APIRouter(prefix="/api/v1/flags", tags=["helper"])


class FeatureFlags(BaseModel):
    bugs_enabled: bool
    chaos_enabled: bool
    dev_trace_enabled: bool


@router.get("", response_model=FeatureFlags, summary="Флаги стенда (баги/задержки/трейсинг)")
def get_flags():
    return FeatureFlags(
        bugs_enabled=bugs.state.enabled,
        chaos_enabled=chaos.state.enabled,
        dev_trace_enabled=settings.enable_dev_trace,
    )
