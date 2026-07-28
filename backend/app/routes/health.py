from fastapi import APIRouter

# Технический эндпоинт для healthcheck докера — не показываем в Swagger,
# чтобы не захламлять документацию.
router = APIRouter(include_in_schema=False)


@router.get("/health")
def healthcheck():
    return {"status": "ok"}
