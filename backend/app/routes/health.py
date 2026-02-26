from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health", summary="Проверка доступности сервиса")
def healthcheck():
    return {"status": "ok"}
