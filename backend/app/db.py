from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import settings


def ensure_database() -> None:
    """Создаёт базу из DATABASE_URL, если её ещё нет (у Postgres-контейнера при старте есть только базовая)."""
    url = make_url(settings.database_url)
    admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT", future=True)
    with admin.connect() as conn:
        exists = conn.scalar(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": url.database})
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{url.database}"'))
    admin.dispose()


engine = create_engine(settings.database_url, future=True, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
