from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health", summary="Проверить доступность")
def healthcheck():
    return {"status": "ok"}
