"""Автотесты: переводы (POST /transfers, by-account, by-phone, exchange, лимиты, коды ошибок)."""
import time

import pytest

from conftest import get_otp, helper_increase


# ── Между своими счетами ──

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
    assert data["money"]["amount"] == "100.00"


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


def test_transfers_account_not_found(client, auth_headers, token, rub_account):
    helper_increase(client, token, rub_account["id"], "5000")
    otp = get_otp(client, token)
    r = client.post(
        "/transfers",
        headers=auth_headers,
        json={
            "from_account_id": rub_account["id"],
            "to_account_id": 999999,
            "amount": "100.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 404
    assert r.json().get("detail") == "account_not_found"


# ── По номеру счёта ──

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
            "target_account_number": "2202000000009999",
            "amount": "100.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 404
    assert r.json().get("detail") == "account_not_found"


def test_transfers_by_account_check_found(client, auth_headers, rub_account):
    """Проверка счёта: счёт из нашего банка — found=true."""
    r = client.get(
        "/transfers/by-account/check",
        headers=auth_headers,
        params={"target_account_number": rub_account["account_number"]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["found"] is True
    assert "masked" in data
    assert data["masked"].endswith(rub_account["account_number"][-4:])


def test_transfers_by_account_check_not_found(client, auth_headers):
    """Проверка счёта: счёт не в нашем банке — found=false."""
    r = client.get(
        "/transfers/by-account/check",
        headers=auth_headers,
        params={"target_account_number": "2202000000009999"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["found"] is False
    assert data.get("masked", "").endswith("9999")


def test_transfers_by_account_check_invalid_number(client, auth_headers):
    """Проверка счёта: некорректный номер — 400."""
    r = client.get(
        "/transfers/by-account/check",
        headers=auth_headers,
        params={"target_account_number": "abc"},
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "invalid_account_number"


# ── Внешний перевод по номеру счёта ──

def test_transfers_external_by_account_success(client, auth_headers, token, rub_account):
    """Перевод в другой банк: списание сумма + 5% комиссия, to_account_id=None."""
    helper_increase(client, token, rub_account["id"], "10000")
    otp = get_otp(client, token)
    r = client.post(
        "/transfers/external-by-account",
        headers=auth_headers,
        json={
            "from_account_id": rub_account["id"],
            "target_account_number": "2202000000009999",
            "amount": "1000.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["type"] == "TRANSFER"
    assert data["money"]["amount"] == "1000.00"
    assert data["to_account_id"] is None
    assert "external_transfer" in (data.get("description") or "")
    r2 = client.get("/accounts", headers=auth_headers)
    acc = next((a for a in r2.json() if a["id"] == rub_account["id"]), None)
    assert acc is not None
    assert float(acc["balance"]) == 8950.00


def test_transfers_external_by_account_reject_if_in_bank(client, auth_headers, token, two_rub_accounts):
    """Если счёт найден в нашем банке — external-by-account возвращает 400."""
    a1, a2 = two_rub_accounts
    helper_increase(client, token, a1["id"], "5000")
    otp = get_otp(client, token)
    r = client.post(
        "/transfers/external-by-account",
        headers=auth_headers,
        json={
            "from_account_id": a1["id"],
            "target_account_number": a2["account_number"],
            "amount": "100.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "account_found_in_bank"


# ── По телефону ──

def _headers(token: str):
    return {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}


def test_transfers_by_phone_check_in_our_bank(client, auth_headers, registered_user, unique_login):
    """Если получатель с телефоном в нашем банке — inOurBank=true."""
    login, password, _ = registered_user
    r = client.post("/auth/login", json={"login": login, "password": password})
    tok = r.json()["access_token"]
    phone = f"+7999{int(time.time()) % 10000000:07d}"
    client.put(
        "/profile",
        headers=_headers(tok),
        json={"phone": phone},
    )
    r = client.get(
        "/transfers/by-phone/check",
        headers=auth_headers,
        params={"phone": phone},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["inOurBank"] is True
    assert isinstance(data["availableBanks"], list)
    assert any(b["id"] == "shlapabank" for b in data["availableBanks"])


def test_transfers_by_phone_check_not_in_our_bank(client, auth_headers):
    """Телефон не зарегистрирован — inOurBank=false, все внешние банки."""
    r = client.get(
        "/transfers/by-phone/check",
        headers=auth_headers,
        params={"phone": "+70000000000"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["inOurBank"] is False
    assert isinstance(data["availableBanks"], list)
    assert len(data["availableBanks"]) > 0


def test_transfers_by_phone_to_our_bank(client, token, auth_headers, rub_account):
    """Перевод по телефону в наш банк (без комиссии)."""
    login2 = f"phone{int(time.time() * 1000)}"
    password2 = "ValidPass123!"
    r = client.post("/auth/register", json={"login": login2, "password": password2})
    assert r.status_code == 201
    r = client.post("/auth/login", json={"login": login2, "password": password2})
    assert r.status_code == 200
    token2 = r.json()["access_token"]
    phone2 = f"+7888{int(time.time()) % 10000000:07d}"
    client.put("/profile", headers=_headers(token2), json={"phone": phone2})
    r = client.post("/accounts", headers=_headers(token2), json={"account_type": "DEBIT", "currency": "RUB"})
    assert r.status_code == 201

    helper_increase(client, token, rub_account["id"], "5000")
    otp = get_otp(client, token)
    r = client.post(
        "/transfers/by-phone",
        headers=auth_headers,
        json={
            "from_account_id": rub_account["id"],
            "phone": phone2,
            "amount": "100.00",
            "recipient_bank_id": "shlapabank",
            "otp_code": otp,
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["type"] == "TRANSFER"
    assert "p2p_transfer_by_phone" in data["description"]
    assert data["money"]["fee"] == "0.00"


def test_transfers_by_phone_external(client, token, auth_headers, rub_account):
    """Перевод по телефону в другой банк (с комиссией 2%)."""
    helper_increase(client, token, rub_account["id"], "5000")
    otp = get_otp(client, token)
    r = client.post(
        "/transfers/by-phone",
        headers=auth_headers,
        json={
            "from_account_id": rub_account["id"],
            "phone": "+70000000001",
            "amount": "1000.00",
            "recipient_bank_id": "tinkoff",
            "otp_code": otp,
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["type"] == "TRANSFER"
    assert "p2p_by_phone_external" in data["description"]
    assert float(data["money"]["fee"]) == 20.00


# ── Курсы и лимиты ──

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
    """Переводы между своими счетами не учитываются в суточном лимите (лимит только на вывод вовне).
    Проверяем, что несколько внутренних переводов по 300k проходят (лимит одной операции 300k)."""
    a1, a2 = two_rub_accounts
    helper_increase(client, token, a1["id"], "1500000")
    for _ in range(4):
        otp = get_otp(client, token)
        r = client.post(
            "/transfers",
            headers=auth_headers,
            json={
                "from_account_id": a1["id"],
                "to_account_id": a2["id"],
                "amount": "300000.00",
                "otp_code": otp,
            },
        )
        assert r.status_code == 201, (r.status_code, r.json())


# ── Обмен валют ──

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
    """Обмен между одинаковыми валютами — ошибка."""
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


def test_transfers_exchange_invalid_otp(client, auth_headers, token):
    """Обмен с невалидным OTP — 400."""
    r1 = client.post("/accounts", headers=auth_headers, json={"account_type": "DEBIT", "currency": "RUB"})
    r2 = client.post("/accounts", headers=auth_headers, json={"account_type": "DEBIT", "currency": "EUR"})
    a_rub, a_eur = r1.json(), r2.json()
    helper_increase(client, token, a_rub["id"], "5000")
    r = client.post(
        "/transfers/exchange",
        headers=auth_headers,
        json={
            "from_account_id": a_rub["id"],
            "to_account_id": a_eur["id"],
            "amount": "100.00",
            "otp_code": "0000",
        },
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "invalid_otp_code"
