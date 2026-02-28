"""Скрипт проверки наличия клиента с номером +7(000)000-00-00"""
import sys
sys.path.insert(0, ".")

from app.db import SessionLocal
from app.models import User
from sqlalchemy import select

db = SessionLocal()
try:
    target = "+70000000000"  # +7(000)000-00-00 в нормализованном виде
    users = list(db.scalars(select(User).where(User.phone == target)))
    all_with_phone = list(db.scalars(select(User).where(User.phone.isnot(None))))
    print("Клиенты с номером +7(000)000-00-00 (+70000000000):")
    for u in users:
        print(f"  id={u.id}, login={u.login}, phone={u.phone}")
    if not users:
        print("  Не найдено")
    print("\nВсе пользователи с указанным телефоном:")
    for u in all_with_phone:
        print(f"  id={u.id}, login={u.login}, phone={u.phone}")
finally:
    db.close()
