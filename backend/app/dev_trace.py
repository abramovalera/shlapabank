"""Учебная трассировка: HTTP-запросы и краткая сводка изменений ORM (только при enable_dev_trace)."""

from __future__ import annotations

import logging
import threading
import uuid
from collections import Counter, deque
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import event
from sqlalchemy.orm import Session as OrmSession

from app.core.config import settings

logger = logging.getLogger("shlapabank.dev_trace")

MAX_ENTRIES = 200
_buffer: deque[dict[str, Any]] = deque(maxlen=MAX_ENTRIES)
_lock = threading.Lock()

trace_id_var: ContextVar[str | None] = ContextVar("trace_id", default=None)
_db_notes_var: ContextVar[list[str] | None] = ContextVar("db_notes", default=None)

_db_hooks_installed = False


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def reset_request_context() -> None:
    trace_id_var.set(uuid.uuid4().hex[:10])
    _db_notes_var.set([])


def clear_request_context() -> None:
    trace_id_var.set(None)
    _db_notes_var.set(None)


def _append_note(text: str) -> None:
    notes = _db_notes_var.get()
    if notes is not None:
        notes.append(text)


def _entity_summary(rows: Any) -> str:
    c = Counter(type(o).__name__ for o in rows)
    return ",".join(f"{name}×{n}" for name, n in sorted(c.items()))


def install_db_hooks() -> None:
    global _db_hooks_installed
    if _db_hooks_installed or not settings.enable_dev_trace:
        return

    @event.listens_for(OrmSession, "after_flush")
    def _after_flush(session: OrmSession, flush_context) -> None:  # noqa: ARG001
        if trace_id_var.get() is None:
            return
        parts: list[str] = []
        if session.new:
            parts.append(f"INSERT {_entity_summary(session.new)}")
        if session.dirty:
            parts.append(f"UPDATE {_entity_summary(session.dirty)}")
        if session.deleted:
            parts.append(f"DELETE {_entity_summary(session.deleted)}")
        if parts:
            _append_note("flush: " + "; ".join(parts))

    @event.listens_for(OrmSession, "after_commit")
    def _after_commit(session: OrmSession) -> None:  # noqa: ARG001
        if trace_id_var.get() is None:
            return
        _append_note("COMMIT")

    @event.listens_for(OrmSession, "after_rollback")
    def _after_rollback(session: OrmSession) -> None:  # noqa: ARG001
        if trace_id_var.get() is None:
            return
        _append_note("ROLLBACK")

    _db_hooks_installed = True


def record_http_event(
    *,
    method: str,
    path: str,
    query: str,
    status_code: int,
    duration_ms: float,
) -> None:
    tid = trace_id_var.get() or "-"
    notes = _db_notes_var.get()
    db_summary = " → ".join(notes) if notes else None

    warns: list[str] = []
    if duration_ms >= 1500:
        warns.append("slow_request")
    if status_code >= 500:
        warns.append("server_error")
    elif status_code >= 400:
        warns.append("client_error")

    entry: dict[str, Any] = {
        "ts": _utc_iso(),
        "source": "server",
        "trace_id": tid,
        "method": method,
        "path": path,
        "query": query or None,
        "status": status_code,
        "duration_ms": round(duration_ms, 2),
        "db": db_summary,
        "warn": "; ".join(warns) if warns else None,
    }
    with _lock:
        _buffer.append(entry)

    q = f"?{query}" if query else ""
    extra = f" | {db_summary}" if db_summary else ""
    logger.info("%s %s%s -> %s (%.1f ms)%s", method, path, q, status_code, duration_ms, extra)


def get_recent_entries() -> list[dict[str, Any]]:
    with _lock:
        return list(_buffer)
