"""Автотесты: Admin API (список пользователей, блокировка, удаление, банки, транзакции)."""
import time

import pytest

from conftest import get_otp, helper_increase


def _admin_token(client):
    """Токен администратора (admin/admin)."""
    r = client.post("/auth/login", json={"login": "admin", "password": "admin"})
    assert r.status_code == 200, (r.status_code, r.json())
    return r.json()["access_token"}


def _headers(token: str):
    return {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}


def test_admin_list_users(client):
    """Админ видит список пользователей."""
    token = _admin_token(client)
    r = client.get("/admin/users", headers=_headers(token))
    assert r.status_code == 200
    users = r.json()
    assert isinstance(users, list)
    assert any(u.get("login") == "admin" for u in users)


def test_admin_user_not_found(client):
    """404 при несуществующем пользователе."""
    token = _admin_token(client)
    r = client.get("/admin/users/999999/transactions", headers=_headers(token))
    assert r.status_code == 404
    assert r.json().get("detail") == "user_not_found"
    r = client.post("/admin/users/999999/block", headers=_headers(token))
    assert r.status_code == 404
    assert r.json().get("detail") == "user_not_found"
    r = client.delete("/admin/users/999999", headers=_headers(token))
    assert r.status_code == 404
    assert r.json().get("detail") == "user_not_found"


def test_admin_block_unblock(client, unique_login, valid_password):
    """Блокировка и разблокировка пользователя."""
    r = client.post("/auth/register", json={"login": unique_login, "password": valid_password})
    assert r.status_code == 201
    user_id = r.json()["id"]

    token = _admin_token(client)
    r = client.post(f"/admin/users/{user_id}/block", headers=_headers(token))
    assert r.status_code == 200
    assert r.json()["status"] == "BLOCKED"

    r = client.post("/auth/login", json={"login": unique_login, "password": valid_password})
    assert r.status_code == 403
    assert r.json().get("detail") == "user_blocked"

    r = client.post(f"/admin/users/{user_id}/unblock", headers=_headers(token))
    assert r.status_code == 200
    assert r.json()["status"] == "ACTIVE"

    r = client.post("/auth/login", json={"login": unique_login, "password": valid_password})
    assert r.status_code == 200


def test_admin_cannot_block_default_admin(client):
    """Нельзя заблокировать администратора по умолчанию."""
    token = _admin_token(client)
    r = client.get("/admin/users", headers=_headers(token))
    assert r.status_code == 200
    admin_user = next(u for u in r.json() if u["login"] == "admin")
    admin_id = admin_user["id"]

    r = client.post(f"/admin/users/{admin_id}/block", headers=_headers(token))
    assert r.status_code == 400
    assert r.json().get("detail") == "cannot_delete_admin"


def test_admin_delete_user(client, unique_login, valid_password):
    """Удаление пользователя."""
    r = client.post("/auth/register", json={"login": unique_login, "password": valid_password})
    assert r.status_code == 201
    user_id = r.json()["id"]

    token = _admin_token(client)
    r = client.delete(f"/admin/users/{user_id}", headers=_headers(token))
    assert r.status_code == 200
    assert r.json().get("detail") == "user_deleted"

    r = client.post("/auth/login", json={"login": unique_login, "password": valid_password})
    assert r.status_code == 401


def test_admin_cannot_delete_default_admin(client):
    """Нельзя удалить администратора по умолчанию."""
    token = _admin_token(client)
    r = client.get("/admin/users", headers=_headers(token))
    admin_user = next(u for u in r.json() if u["login"] == "admin")
    admin_id = admin_user["id"]

    r = client.delete(f"/admin/users/{admin_id}", headers=_headers(token))
    assert r.status_code == 400
    assert r.json().get("detail") == "cannot_delete_admin"


def test_admin_get_user_banks(client, unique_login, valid_password):
    """Получить банки пользователя."""
    r = client.post("/auth/register", json={"login": unique_login, "password": valid_password})
    assert r.status_code == 201
    user_id = r.json()["id"]

    token = _admin_token(client)
    r = client.get(f"/admin/users/{user_id}/banks", headers=_headers(token))
    assert r.status_code == 200
    data = r.json()
    assert "bank_codes" in data
    assert len(data["bank_codes"]) <= 5


def test_admin_update_user_banks(client, unique_login, valid_password):
    """Настроить банки пользователя (0–5 внешних)."""
    r = client.post("/auth/register", json={"login": unique_login, "password": valid_password})
    assert r.status_code == 201
    user_id = r.json()["id"]

    token = _admin_token(client)
    r = client.put(
        f"/admin/users/{user_id}/banks",
        headers=_headers(token),
        json={"bank_codes": ["tinkoff", "sber"]},
    )
    assert r.status_code == 200
    assert r.json().get("detail") == "banks_updated"

    r = client.get(f"/admin/users/{user_id}/banks", headers=_headers(token))
    assert r.status_code == 200
    assert set(r.json()["bank_codes"]) == {"tinkoff", "sber"}


def test_admin_update_banks_reject_our_bank(client, unique_login, valid_password):
    """Нельзя указать наш банк в списке."""
    r = client.post("/auth/register", json={"login": unique_login, "password": valid_password})
    assert r.status_code == 201
    user_id = r.json()["id"]

    token = _admin_token(client)
    r = client.put(
        f"/admin/users/{user_id}/banks",
        headers=_headers(token),
        json={"bank_codes": ["shlapabank", "tinkoff"]},
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "invalid_bank_codes"


def test_admin_update_banks_reject_unknown(client, unique_login, valid_password):
    """Нельзя указать несуществующий банк."""
    r = client.post("/auth/register", json={"login": unique_login, "password": valid_password})
    assert r.status_code == 201
    user_id = r.json()["id"]

    token = _admin_token(client)
    r = client.put(
        f"/admin/users/{user_id}/banks",
        headers=_headers(token),
        json={"bank_codes": ["unknown_bank"]},
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "invalid_bank_codes"


def test_admin_update_banks_more_than_five(client, unique_login, valid_password):
    """Нельзя указать больше 5 банков."""
    r = client.post("/auth/register", json={"login": unique_login, "password": valid_password})
    assert r.status_code == 201
    user_id = r.json()["id"]

    token = _admin_token(client)
    r = client.put(
        f"/admin/users/{user_id}/banks",
        headers=_headers(token),
        json={
            "bank_codes": ["alpha", "tinkoff", "sber", "vtb", "gazprombank", "raiffeisen"],
        },
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "bank_limit_exceeded"


def test_admin_get_user_transactions(client, auth_headers, token, rub_account):
    """Админ видит транзакции пользователя."""
    helper_increase(client, token, rub_account["id"], "100")
    r = client.get("/profile", headers=auth_headers)
    assert r.status_code == 200
    user_id = r.json()["id"]

    admin_token = _admin_token(client)
    r = client.get(f"/admin/users/{user_id}/transactions", headers=_headers(admin_token))
    assert r.status_code == 200
    txs = r.json()
    assert isinstance(txs, list)
    assert len(txs) >= 1


def test_client_cannot_access_admin(client, auth_headers):
    """Обычный клиент не может вызывать Admin API."""
    r = client.get("/admin/users", headers=auth_headers)
    assert r.status_code == 403


def test_admin_restore_initial_state(client, unique_login, valid_password):
    """POST /admin/restore-initial-state возвращает БД к исходному состоянию (только дефолтный админ).
    Ручка не предназначена для использования в автотестах — тест проверяет лишь её работоспособность."""
    r = client.post("/auth/register", json={"login": unique_login, "password": valid_password})
    assert r.status_code == 201

    token = _admin_token(client)
    r = client.post("/admin/restore-initial-state", headers=_headers(token))
    assert r.status_code == 200
    data = r.json()
    assert data.get("detail") == "database_reset"

    # После сброса старый токен невалиден (пользователь удалён). Вход заново как admin.
    r = client.post("/auth/login", json={"login": "admin", "password": "admin"})
    assert r.status_code == 200
    token = r.json()["access_token"]

    r = client.get("/admin/users", headers=_headers(token))
    assert r.status_code == 200
    users = r.json()
    assert len(users) == 1
    assert users[0]["login"] == "admin"

    r = client.post("/auth/login", json={"login": unique_login, "password": valid_password})
    assert r.status_code == 401
