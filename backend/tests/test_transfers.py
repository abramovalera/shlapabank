"""Автотесты: переводы (POST /transfers, by-account, exchange, лимиты, коды ошибок)."""
import pytest

from conftest import get_otp, helper_increase


def test_transfers_success(client, auth_headers, token, two_rub_accounts):
    a1, a2 = two_rub_accounts
    helper_increase(client, token, a1["id"], "5000")
    otp = get_otp(client, token)
    r = client.post(
        "/transfers",
        headers=auth_headers,
        json={
            "from_account_id": a1["id"],
            "to_account_id": a2["id"],
            "amount": "100.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["type"] == "TRANSFER"
    assert data["description"] == "p2p_transfer"
    assert data["amount"] == "100.00"


def test_transfers_same_account(client, auth_headers, token, two_rub_accounts):
    a1, _ = two_rub_accounts
    helper_increase(client, token, a1["id"], "5000")
    otp = get_otp(client, token)
    r = client.post(
        "/transfers",
        headers=auth_headers,
        json={
            "from_account_id": a1["id"],
            "to_account_id": a1["id"],
            "amount": "50.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "transfer_same_account"


def test_transfers_amount_too_small(client, auth_headers, token, two_rub_accounts):
    a1, a2 = two_rub_accounts
    helper_increase(client, token, a1["id"], "5000")
    otp = get_otp(client, token)
    r = client.post(
        "/transfers",
        headers=auth_headers,
        json={
            "from_account_id": a1["id"],
            "to_account_id": a2["id"],
            "amount": "5.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "transfer_amount_too_small"


def test_transfers_insufficient_funds(client, auth_headers, token, two_rub_accounts):
    a1, a2 = two_rub_accounts
    otp = get_otp(client, token)
    r = client.post(
        "/transfers",
        headers=auth_headers,
        json={
            "from_account_id": a1["id"],
            "to_account_id": a2["id"],
            "amount": "100.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "insufficient_funds"


def test_transfers_currency_mismatch(client, auth_headers, token):
    r1 = client.post("/accounts", headers=auth_headers, json={"account_type": "DEBIT", "currency": "RUB"})
    r2 = client.post("/accounts", headers=auth_headers, json={"account_type": "DEBIT", "currency": "USD"})
    a1, a2 = r1.json(), r2.json()
    helper_increase(client, token, a1["id"], "5000")
    otp = get_otp(client, token)
    r = client.post(
        "/transfers",
        headers=auth_headers,
        json={
            "from_account_id": a1["id"],
            "to_account_id": a2["id"],
            "amount": "100.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "currency_mismatch"


def test_transfers_from_savings_rejected(client, auth_headers, token):
    r1 = client.post("/accounts", headers=auth_headers, json={"account_type": "SAVINGS", "currency": "RUB"})
    r2 = client.post("/accounts", headers=auth_headers, json={"account_type": "DEBIT", "currency": "RUB"})
    a1, a2 = r1.json(), r2.json()
    helper_increase(client, token, a1["id"], "5000")
    otp = get_otp(client, token)
    r = client.post(
        "/transfers",
        headers=auth_headers,
        json={
            "from_account_id": a1["id"],
            "to_account_id": a2["id"],
            "amount": "50.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "transfer_not_allowed_from_savings"


def test_transfers_invalid_otp(client, auth_headers, token, two_rub_accounts):
    a1, a2 = two_rub_accounts
    helper_increase(client, token, a1["id"], "5000")
    r = client.post(
        "/transfers",
        headers=auth_headers,
        json={
            "from_account_id": a1["id"],
            "to_account_id": a2["id"],
            "amount": "100.00",
            "otp_code": "1234",
        },
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "invalid_otp_code"


def test_transfers_exceeds_single_limit(client, auth_headers, token, two_rub_accounts):
    a1, a2 = two_rub_accounts
    helper_increase(client, token, a1["id"], "500000")
    otp = get_otp(client, token)
    r = client.post(
        "/transfers",
        headers=auth_headers,
        json={
            "from_account_id": a1["id"],
            "to_account_id": a2["id"],
            "amount": "350000.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "transfer_amount_exceeds_single_limit"


def test_transfers_by_account_success(client, auth_headers, token):
    """Два счёта у одного пользователя: перевод по номеру счёта (внутри одного юзера)."""
    r1 = client.post("/accounts", headers=auth_headers, json={"account_type": "DEBIT", "currency": "RUB"})
    r2 = client.post("/accounts", headers=auth_headers, json={"account_type": "DEBIT", "currency": "RUB"})
    a1, a2 = r1.json(), r2.json()
    helper_increase(client, token, a1["id"], "5000")
    otp = get_otp(client, token)
    r = client.post(
        "/transfers/by-account",
        headers=auth_headers,
        json={
            "from_account_id": a1["id"],
            "target_account_number": a2["account_number"],
            "amount": "200.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 201
    desc = r.json()["description"]
    assert desc.startswith("p2p_transfer_by_account:")
    assert a2["account_number"][-4:] in desc


def test_transfers_by_account_not_found(client, auth_headers, token, rub_account):
    helper_increase(client, token, rub_account["id"], "5000")
    otp = get_otp(client, token)
    r = client.post(
        "/transfers/by-account",
        headers=auth_headers,
        json={
            "from_account_id": rub_account["id"],
            "target_account_number": "22020000000000009999",
            "amount": "100.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 404
    assert r.json().get("detail") == "account_not_found"


def test_transfers_rates(client, auth_headers):
    r = client.get("/transfers/rates", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "toRub" in data
    for c in ("RUB", "USD", "EUR", "CNY"):
        assert c in data["toRub"]


def test_transfers_daily_usage(client, auth_headers):
    r = client.get("/transfers/daily-usage", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "limits" in data
    assert "perCurrency" in data["limits"]
    for item in data["limits"]["perCurrency"]:
        assert "currency" in item
        assert "dailyLimit" in item
        assert "usedToday" in item
        assert "remaining" in item


def test_transfers_exceeds_daily_limit(client, auth_headers, token, two_rub_accounts):
    """Суточный лимит по RUB — 1 000 000. Два перевода по 600k превышают лимит."""
    a1, a2 = two_rub_accounts
    helper_increase(client, token, a1["id"], "1500000")
    otp1 = get_otp(client, token)
    r1 = client.post(
        "/transfers",
        headers=auth_headers,
        json={
            "from_account_id": a1["id"],
            "to_account_id": a2["id"],
            "amount": "600000.00",
            "otp_code": otp1,
        },
    )
    assert r1.status_code == 201
    otp2 = get_otp(client, token)
    r2 = client.post(
        "/transfers",
        headers=auth_headers,
        json={
            "from_account_id": a1["id"],
            "to_account_id": a2["id"],
            "amount": "500000.00",
            "otp_code": otp2,
        },
    )
    assert r2.status_code == 400
    assert r2.json().get("detail") == "transfer_amount_exceeds_daily_limit"


def test_transfers_exchange_success(client, auth_headers, token):
    r1 = client.post("/accounts", headers=auth_headers, json={"account_type": "DEBIT", "currency": "RUB"})
    r2 = client.post("/accounts", headers=auth_headers, json={"account_type": "DEBIT", "currency": "USD"})
    a_rub, a_usd = r1.json(), r2.json()
    helper_increase(client, token, a_rub["id"], "10000")
    otp = get_otp(client, token)
    r = client.post(
        "/transfers/exchange",
        headers=auth_headers,
        json={
            "from_account_id": a_rub["id"],
            "to_account_id": a_usd["id"],
            "amount": "950.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert "fx_exchange" in data["description"]
    assert "RUB" in data["description"] and "USD" in data["description"]


def test_transfers_exchange_currency_mismatch(client, auth_headers, token, two_rub_accounts):
    a1, a2 = two_rub_accounts
    helper_increase(client, token, a1["id"], "5000")
    otp = get_otp(client, token)
    r = client.post(
        "/transfers/exchange",
        headers=auth_headers,
        json={
            "from_account_id": a1["id"],
            "to_account_id": a2["id"],
            "amount": "100.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "currency_mismatch"


def test_transfers_exchange_insufficient_funds(client, auth_headers, token):
    r1 = client.post("/accounts", headers=auth_headers, json={"account_type": "DEBIT", "currency": "RUB"})
    r2 = client.post("/accounts", headers=auth_headers, json={"account_type": "DEBIT", "currency": "USD"})
    a_rub, a_usd = r1.json(), r2.json()
    otp = get_otp(client, token)
    r = client.post(
        "/transfers/exchange",
        headers=auth_headers,
        json={
            "from_account_id": a_rub["id"],
            "to_account_id": a_usd["id"],
            "amount": "100.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "insufficient_funds"
