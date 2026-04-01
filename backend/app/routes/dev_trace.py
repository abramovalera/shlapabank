from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.dev_trace import clear_trace_buffer, get_recent_entries

router = APIRouter(prefix="/api/v1/dev", tags=["dev"])


@router.get("/trace/recent", summary="Последние записи учебной трассировки (HTTP + ORM)")
def trace_recent():
    if not settings.enable_dev_trace:
        raise HTTPException(status_code=404, detail="not_found")
    return {"entries": get_recent_entries()}


@router.post("/trace/clear", summary="Очистить буфер учебной трассировки на сервере")
def trace_clear():
    if not settings.enable_dev_trace:
        raise HTTPException(status_code=404, detail="not_found")
    clear_trace_buffer()
    return {"detail": "trace_buffer_cleared"}
