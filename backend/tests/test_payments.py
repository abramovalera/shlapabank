"""Автотесты: платежи (mobile, vendor, коды ошибок)."""
import pytest

from conftest import get_otp, helper_increase


def test_payments_mobile_operators(client, auth_headers):
    r = client.get("/payments/mobile/operators", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "operators" in data
    assert "amountRangeRub" in data
    assert data["amountRangeRub"]["min"] == 100
    assert data["amountRangeRub"]["max"] == 12000


def test_payments_mobile_success(client, auth_headers, token, rub_account):
    helper_increase(client, token, rub_account["id"], "5000")
    otp = get_otp(client, token)
    r = client.post(
        "/payments/mobile",
        headers=auth_headers,
        json={
            "account_id": rub_account["id"],
            "operator": "MTSha",
            "phone": "+79991234567",
            "amount": "300.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["type"] == "PAYMENT"
    assert data["description"].startswith("mobile:MTSha:")


def test_payments_mobile_operator_not_supported(client, auth_headers, token, rub_account):
    otp = get_otp(client, token)
    r = client.post(
        "/payments/mobile",
        headers=auth_headers,
        json={
            "account_id": rub_account["id"],
            "operator": "UnknownOperator",
            "phone": "+79991234567",
            "amount": "300.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "payment_operator_not_supported"


def test_payments_mobile_amount_out_of_range(client, auth_headers, token, rub_account):
    otp = get_otp(client, token)
    r = client.post(
        "/payments/mobile",
        headers=auth_headers,
        json={
            "account_id": rub_account["id"],
            "operator": "MTSha",
            "phone": "+79991234567",
            "amount": "50.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "payment_amount_out_of_range"


def test_payments_vendor_providers(client, auth_headers):
    r = client.get("/payments/vendor/providers", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "providers" in data
    assert any(p["name"] == "CityWater" for p in data["providers"])


def test_payments_vendor_success(client, auth_headers, token, rub_account):
    helper_increase(client, token, rub_account["id"], "10000")
    otp = get_otp(client, token)
    r = client.post(
        "/payments/vendor",
        headers=auth_headers,
        json={
            "account_id": rub_account["id"],
            "provider": "CityWater",
            "account_number": "123456789012345678",
            "amount": "1500.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["type"] == "PAYMENT"
    assert "vendor:CityWater:" in data["description"]


def test_payments_vendor_provider_not_supported(client, auth_headers, token, rub_account):
    otp = get_otp(client, token)
    r = client.post(
        "/payments/vendor",
        headers=auth_headers,
        json={
            "account_id": rub_account["id"],
            "provider": "UnknownProvider",
            "account_number": "1234567890123456",
            "amount": "500.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "payment_provider_not_supported"


def test_payments_vendor_account_number_invalid_length(client, auth_headers, token, rub_account):
    otp = get_otp(client, token)
    r = client.post(
        "/payments/vendor",
        headers=auth_headers,
        json={
            "account_id": rub_account["id"],
            "provider": "CityWater",
            "account_number": "12345",
            "amount": "500.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "payment_account_number_invalid_length"


def test_payments_insufficient_funds(client, auth_headers, token, rub_account):
    otp = get_otp(client, token)
    r = client.post(
        "/payments/mobile",
        headers=auth_headers,
        json={
            "account_id": rub_account["id"],
            "operator": "MTSha",
            "phone": "+79991234567",
            "amount": "50000.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "insufficient_funds"


def _admin_token(client):
    r = client.post("/auth/login", json={"login": "admin", "password": "admin"})
    assert r.status_code == 200, (r.status_code, r.json())
    return r.json()["access_token"]


def _headers(token: str):
    return {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}


def test_blocked_client_cannot_make_payment(client, unique_login, valid_password):
    """Blocked user gets 403 on payment API (cannot pay through API)."""
    r = client.post("/auth/register", json={"login": unique_login, "password": valid_password})
    assert r.status_code == 201
    user_id = r.json()["id"]

    r = client.post("/auth/login", json={"login": unique_login, "password": valid_password})
    assert r.status_code == 200
    user_token = r.json()["access_token"]
    user_headers = _headers(user_token)

    admin_tok = _admin_token(client)
    r = client.post(f"/admin/users/{user_id}/block", headers=_headers(admin_tok))
    assert r.status_code == 200
    assert r.json()["status"] == "BLOCKED"

    r = client.get("/payments/mobile/operators", headers=user_headers)
    assert r.status_code == 403, "blocked user must not access payment endpoints"
    assert r.json().get("detail") == "user_blocked"

    r = client.post(
        "/payments/mobile",
        headers=user_headers,
        json={
            "account_id": 1,
            "operator": "MTSha",
            "phone": "+79991234567",
            "amount": "300.00",
            "otp_code": "0000",
        },
    )
    assert r.status_code == 403, "blocked user must not perform payment"
    assert r.json().get("detail") == "user_blocked"
