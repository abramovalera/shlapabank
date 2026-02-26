from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.models import User
from app.security import require_active_user

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


class SettingsResponse(BaseModel):
    theme: str
    language: str
    notificationsEnabled: bool


@router.get(
    "",
    response_model=SettingsResponse,
    summary="Получить пользовательские настройки UI",
)
def get_settings(current_user: User = Depends(require_active_user)):
    return SettingsResponse(theme="LIGHT", language="RU", notificationsEnabled=True)
