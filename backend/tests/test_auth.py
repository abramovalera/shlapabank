"""Автотесты: авторизация (регистрация, логин)."""
import pytest


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
    assert data.get("role") == "CLIENT"


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


def test_register_login_boundary_valid(client):
    """Логин ровно 6 символов (мин) и 20 символов (макс) — допустимы."""
    r = client.post("/auth/register", json={"login": "abcdef", "password": "ValidPass123!"})
    assert r.status_code == 201
    r = client.post("/auth/register", json={"login": "a" * 20, "password": "ValidPass123!"})
    assert r.status_code == 201


def test_register_login_invalid_chars(client):
    r = client.post("/auth/register", json={"login": "user 123", "password": "ValidPass123!"})
    assert r.status_code == 422
    r = client.post("/auth/register", json={"login": "юзер12", "password": "ValidPass123!"})
    assert r.status_code == 422


def test_register_password_equals_login(client, unique_login):
    r = client.post("/auth/register", json={"login": unique_login, "password": unique_login})
    assert r.status_code == 400
    assert r.json().get("detail") == "validation_error: password_equals_login"


def test_register_weak_password(client, unique_login):
    r = client.post("/auth/register", json={"login": unique_login, "password": "nouppercase1!"})
    assert r.status_code == 400
    assert r.json().get("detail") == "validation_error: weak_password"


def test_register_password_no_digit(client, unique_login):
    r = client.post("/auth/register", json={"login": unique_login, "password": "NoDigitHere!"})
    assert r.status_code == 400
    assert r.json().get("detail") == "validation_error: weak_password"


def test_register_password_no_special(client, unique_login):
    r = client.post("/auth/register", json={"login": unique_login, "password": "NoSpecial123"})
    assert r.status_code == 400
    assert r.json().get("detail") == "validation_error: weak_password"


def test_register_password_contains_space(client, unique_login):
    r = client.post("/auth/register", json={"login": unique_login, "password": "Valid Pass123!"})
    assert r.status_code == 400
    assert r.json().get("detail") == "validation_error: password_contains_space"


def test_login_nonexistent_user(client):
    """Вход с несуществующим логином — 401."""
    r = client.post("/auth/login", json={"login": "nonexistent999", "password": "SomePass123!"})
    assert r.status_code == 401
    assert r.json().get("detail") == "invalid_credentials"
