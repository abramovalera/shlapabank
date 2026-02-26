"""Автотесты: счета (список, открытие, закрытие, topup)."""
import pytest

from conftest import helper_increase


def test_accounts_list_empty_or_returns_own(client, auth_headers):
    r = client.get("/accounts", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_accounts_create_rub_debit(client, auth_headers):
    r = client.post("/accounts", headers=auth_headers, json={"account_type": "DEBIT", "currency": "RUB"})
    assert r.status_code == 201
    data = r.json()
    assert data["currency"] == "RUB"
    assert data["account_type"] == "DEBIT"
    assert data["balance"] == "0.00"
    assert "account_number" in data


def test_accounts_create_currencies(client, auth_headers):
    for currency in ("USD", "EUR", "CNY"):
        r = client.post("/accounts", headers=auth_headers, json={"account_type": "DEBIT", "currency": currency})
        assert r.status_code == 201
        assert r.json()["currency"] == currency


def test_accounts_create_savings(client, auth_headers):
    r = client.post("/accounts", headers=auth_headers, json={"account_type": "SAVINGS", "currency": "RUB"})
    assert r.status_code == 201
    assert r.json()["account_type"] == "SAVINGS"


def test_accounts_limit_rub(client, auth_headers):
    r = client.get("/accounts", headers=auth_headers)
    rub_count = sum(1 for a in r.json() if a["currency"] == "RUB")
    for _ in range(3 - rub_count):
        client.post("/accounts", headers=auth_headers, json={"account_type": "DEBIT", "currency": "RUB"})
    r = client.post("/accounts", headers=auth_headers, json={"account_type": "DEBIT", "currency": "RUB"})
    assert r.status_code == 400
    assert r.json().get("detail") == "account_limit_exceeded"


def test_accounts_close_zero_balance(client, auth_headers):
    r = client.post("/accounts", headers=auth_headers, json={"account_type": "DEBIT", "currency": "RUB"})
    assert r.status_code == 201
    acc = r.json()
    r = client.delete(f"/accounts/{acc['id']}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json().get("detail") == "account_closed"


def test_accounts_close_non_zero_balance(client, auth_headers, token, rub_account):
    acc = rub_account
    helper_increase(client, token, acc["id"], "100")
    r = client.delete(f"/accounts/{acc['id']}", headers=auth_headers)
    assert r.status_code == 400
    assert r.json().get("detail") == "account_close_requires_zero_balance"


def test_accounts_close_not_found(client, auth_headers):
    r = client.delete("/accounts/999999", headers=auth_headers)
    assert r.status_code == 404
    assert r.json().get("detail") == "not_found"


def test_accounts_close_already_closed(client, auth_headers):
    r = client.post("/accounts", headers=auth_headers, json={"account_type": "DEBIT", "currency": "RUB"})
    acc = r.json()
    client.delete(f"/accounts/{acc['id']}", headers=auth_headers)
    r = client.delete(f"/accounts/{acc['id']}", headers=auth_headers)
    assert r.status_code == 400
    assert r.json().get("detail") == "account_already_closed"


def test_accounts_topup_success(client, auth_headers, rub_account):
    acc = rub_account
    r = client.post(
        f"/accounts/{acc['id']}/topup",
        headers=auth_headers,
        json={"amount": "500.00", "otp_code": "0000"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["type"] == "TOPUP"
    assert data["description"] == "self_topup"
    assert data["amount"] == "500.00"


def test_accounts_topup_invalid_otp(client, auth_headers, rub_account):
    r = client.post(
        f"/accounts/{rub_account['id']}/topup",
        headers=auth_headers,
        json={"amount": "100.00", "otp_code": "9999"},
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "invalid_otp_code"


def test_accounts_topup_amount_non_positive(client, auth_headers, rub_account):
    r = client.post(
        f"/accounts/{rub_account['id']}/topup",
        headers=auth_headers,
        json={"amount": "0", "otp_code": "0000"},
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "amount_must_be_positive"


def test_accounts_topup_account_not_found(client, auth_headers):
    r = client.post(
        "/accounts/999999/topup",
        headers=auth_headers,
        json={"amount": "100.00", "otp_code": "0000"},
    )
    assert r.status_code == 404
    assert r.json().get("detail") == "account_not_found"
