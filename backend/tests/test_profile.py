"""Автотесты: профиль (GET/PUT, валидация, смена пароля)."""
import pytest


def test_profile_get_success(client, auth_headers):
    r = client.get("/profile", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    for key in ("login", "email", "status", "first_name", "last_name", "phone"):
        assert key in data


def test_profile_get_without_token(client):
    r = client.get("/profile")
    assert r.status_code == 401
    assert r.json().get("detail") == "invalid_token"


def test_profile_put_update_name_phone_email(client, auth_headers, unique_login):
    r = client.put(
        "/profile",
        headers=auth_headers,
        json={
            "first_name": "Ivan",
            "last_name": "Petrov",
            "phone": "+79991234567",
            "email": f"{unique_login}@test.com",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data.get("first_name") == "Ivan"
    assert data.get("last_name") == "Petrov"
    assert data.get("phone") == "+79991234567"
    assert data.get("email") == f"{unique_login}@test.com"


def test_profile_put_phone_invalid_format(client, auth_headers):
    """Номер, который нельзя привести к +7XXXXXXXXXX, даёт ошибку валидации."""
    r = client.put("/profile", headers=auth_headers, json={"phone": "123"})
    assert r.status_code == 422


def test_profile_put_invalid_email_format(client, auth_headers):
    """Невалидный формат email — 422."""
    r = client.put("/profile", headers=auth_headers, json={"email": "not-an-email"})
    assert r.status_code == 422


def test_profile_put_name_invalid_chars(client, auth_headers):
    """Имя с недопустимыми символами — 422."""
    r = client.put("/profile", headers=auth_headers, json={"first_name": "Ivan123"})
    assert r.status_code == 422


def test_profile_put_password_requires_both(client, auth_headers, valid_password):
    r = client.put(
        "/profile",
        headers=auth_headers,
        json={"current_password": valid_password},
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "validation_error: password_change_requires_both_fields"


def test_profile_put_password_requires_both_new_only(client, auth_headers):
    """Только new_password без current_password — 400."""
    r = client.put(
        "/profile",
        headers=auth_headers,
        json={"new_password": "NewValidPass123!"},
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "validation_error: password_change_requires_both_fields"


def test_profile_put_invalid_current_password(client, auth_headers):
    r = client.put(
        "/profile",
        headers=auth_headers,
        json={
            "current_password": "WrongPass123!",
            "new_password": "NewValidPass123!",
        },
    )
    assert r.status_code == 401
    assert r.json().get("detail") == "invalid_current_password"


def test_profile_put_password_reuse(client, auth_headers, valid_password):
    r = client.put(
        "/profile",
        headers=auth_headers,
        json={
            "current_password": valid_password,
            "new_password": valid_password,
        },
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "validation_error: password_reuse_not_allowed"


def test_profile_put_email_not_unique(client, registered_user, auth_headers, unique_login):
    """Второй пользователь не может взять email первого."""
    email = f"{unique_login}@test.com"
    client.put("/profile", headers=auth_headers, json={"email": email})

    login2 = f"{unique_login}x"
    if len(login2) > 20:
        login2 = unique_login[:19] + "x"
    password2 = "ValidPass123!"
    client.post("/auth/register", json={"login": login2, "password": password2})
    r2 = client.post("/auth/login", json={"login": login2, "password": password2})
    assert r2.status_code == 200, (r2.status_code, r2.json())
    token2 = r2.json()["access_token"]
    r = client.put(
        "/profile",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token2}"},
        json={"email": email},
    )
    assert r.status_code == 409
    assert r.json().get("detail") == "validation_error: email_not_unique"


def test_profile_put_phone_not_unique(client, registered_user, auth_headers, unique_login):
    """Второй пользователь не может взять телефон первого."""
    phone = "+79998887766"
    client.put("/profile", headers=auth_headers, json={"phone": phone})

    login2 = f"{unique_login}y"
    if len(login2) > 20:
        login2 = unique_login[:19] + "y"
    password2 = "ValidPass123!"
    client.post("/auth/register", json={"login": login2, "password": password2})
    r2 = client.post("/auth/login", json={"login": login2, "password": password2})
    assert r2.status_code == 200
    token2 = r2.json()["access_token"]
    r = client.put(
        "/profile",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token2}"},
        json={"phone": phone},
    )
    assert r.status_code == 409
    assert r.json().get("detail") == "validation_error: phone_not_unique"


def test_profile_put_password_success(client, registered_user, valid_password):
    login, password, _ = registered_user
    r = client.post("/auth/login", json={"login": login, "password": password})
    assert r.status_code == 200
    token = r.json()["access_token"]
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
    r = client.put(
        "/profile",
        headers=headers,
        json={
            "current_password": password,
            "new_password": "NewValidPass123!",
        },
    )
    assert r.status_code == 200
    r = client.post("/auth/login", json={"login": login, "password": "NewValidPass123!"})
    assert r.status_code == 200
