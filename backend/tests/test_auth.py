"""Автотесты: авторизация (регистрация, логин)."""
import pytest
import httpx


def test_register_success(client, unique_login, valid_password):
    r = client.post("/auth/register", json={"login": unique_login, "password": valid_password})
    assert r.status_code == 201
    data = r.json()
    assert "id" in data
    assert data["login"] == unique_login
    assert data["role"] == "CLIENT"
    assert data["status"] == "ACTIVE"
    assert "password" not in data


def test_login_success(client, registered_user):
    login, password, _ = registered_user
    r = client.post("/auth/login", json={"login": login, "password": password})
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert data.get("token_type") == "bearer"


def test_register_login_not_unique(client, registered_user):
    login, password, _ = registered_user
    r = client.post("/auth/register", json={"login": login, "password": "OtherPass123!"})
    assert r.status_code == 409
    assert r.json().get("detail") == "validation_error: login_not_unique"


def test_login_empty_credentials(client):
    """Валидация LoginRequest: пустые логин/пароль — 422."""
    r = client.post("/auth/login", json={"login": "", "password": "x"})
    assert r.status_code == 422
    r = client.post("/auth/login", json={"login": "user", "password": ""})
    assert r.status_code == 422


def test_login_invalid_credentials(client, registered_user):
    login, _, _ = registered_user
    r = client.post("/auth/login", json={"login": login, "password": "WrongPass123!"})
    assert r.status_code == 401
    assert r.json().get("detail") == "invalid_credentials"


def test_register_login_too_short(client):
    r = client.post("/auth/register", json={"login": "abc", "password": "ValidPass123!"})
    assert r.status_code == 422


def test_register_login_too_long(client):
    r = client.post("/auth/register", json={"login": "a" * 21, "password": "ValidPass123!"})
    assert r.status_code == 422


def test_register_login_invalid_chars(client):
    r = client.post("/auth/register", json={"login": "user 123", "password": "ValidPass123!"})
    assert r.status_code == 422
    r = client.post("/auth/register", json={"login": "юзер", "password": "ValidPass123!"})
    assert r.status_code == 422


def test_register_password_equals_login(client, unique_login):
    r = client.post("/auth/register", json={"login": unique_login, "password": unique_login})
    assert r.status_code == 400
    assert r.json().get("detail") == "validation_error: password_equals_login"


def test_register_weak_password(client, unique_login):
    r = client.post("/auth/register", json={"login": unique_login, "password": "nouppercase1!"})
    assert r.status_code == 400
    assert r.json().get("detail") == "validation_error: weak_password"


def test_login_user_blocked(client, registered_user, admin_headers):
    login, password, user = registered_user
    # блокируем через админа
    r = client.post(f"/admin/users/{user['id']}/block", headers=admin_headers)
    assert r.status_code == 200
    r = client.post("/auth/login", json={"login": login, "password": password})
    assert r.status_code == 403
    assert r.json().get("detail") == "user_blocked"
    # разблокируем чтобы не ломать другие тесты
    client.post(f"/admin/users/{user['id']}/unblock", headers=admin_headers)
