"""Автотесты: Helper API (OTP preview, increase/decrease/zero)."""
import pytest

from conftest import helper_increase, helper_zero


def test_helper_otp_preview(client, auth_headers):
    r = client.get("/helper/otp/preview", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "userId" in data
    assert "otp" in data
    assert "ttlSeconds" in data
    assert "message" in data
    assert len(data["otp"]) == 4


def test_helper_increase(client, auth_headers, token, rub_account):
    r = client.post(
        f"/helper/accounts/{rub_account['id']}/increase",
        params={"amount": "100.50"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert float(data["balance"]) == 100.50


def test_helper_increase_creates_transaction(client, auth_headers, token, rub_account):
    """Пополнение через Helper создаёт транзакцию для статистики."""
    client.post(
        f"/helper/accounts/{rub_account['id']}/increase",
        params={"amount": "250.00"},
        headers=auth_headers,
    )
    r = client.get("/transactions", headers=auth_headers)
    assert r.status_code == 200
    txs = [
        t
        for t in r.json()
        if t.get("description") == "helper_topup"
        and str((t.get("money") or {}).get("amount", t.get("amount"))) == "250.00"
    ]
    assert len(txs) >= 1


def test_helper_decrease(client, auth_headers, token, rub_account):
    helper_increase(client, token, rub_account["id"], "200")
    r = client.post(
        f"/helper/accounts/{rub_account['id']}/decrease",
        params={"amount": "50.25"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert float(data["balance"]) == pytest.approx(149.75, abs=0.01)


def test_helper_decrease_insufficient_funds(client, auth_headers, rub_account):
    r = client.post(
        f"/helper/accounts/{rub_account['id']}/decrease",
        params={"amount": "100"},
        headers=auth_headers,
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "insufficient_funds"


def test_helper_zero(client, auth_headers, token, rub_account):
    helper_increase(client, token, rub_account["id"], "999")
    r = client.post(f"/helper/accounts/{rub_account['id']}/zero", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["balance"] == "0.00"


def test_helper_account_not_found(client, auth_headers):
    r = client.post(
        "/helper/accounts/999999/increase",
        params={"amount": "1"},
        headers=auth_headers,
    )
    assert r.status_code == 404
    assert r.json().get("detail") == "account_not_found"


def test_helper_account_inactive(client, auth_headers, token):
    r1 = client.post("/accounts", headers=auth_headers, json={"account_type": "DEBIT", "currency": "RUB"})
    acc = r1.json()
    client.delete(f"/accounts/{acc['id']}", headers=auth_headers)
    r = client.post(
        f"/helper/accounts/{acc['id']}/increase",
        params={"amount": "1"},
        headers=auth_headers,
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "account_inactive"
