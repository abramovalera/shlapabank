"""Автотесты: счета (список, открытие, закрытие, topup)."""
import pytest

from conftest import get_otp, helper_increase


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


def test_accounts_topup_success(client, auth_headers, token, rub_account):
    acc = rub_account
    otp = get_otp(client, token)
    r = client.post(
        f"/accounts/{acc['id']}/topup",
        headers=auth_headers,
        json={"amount": "500.00", "otp_code": otp},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["type"] == "TOPUP"
    assert data["description"] == "self_topup"
    assert data["amount"] == "500.00"


def test_accounts_topup_with_purpose_salary(client, auth_headers, token, rub_account):
    """Пополнение с purpose=salary создаёт транзакцию self_topup:salary (отображается как «Зарплата от банка»)."""
    otp = get_otp(client, token)
    r = client.post(
        f"/accounts/{rub_account['id']}/topup",
        headers=auth_headers,
        json={"amount": "3000.00", "otp_code": otp, "purpose": "salary"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["type"] == "TOPUP"
    assert data["description"] == "self_topup:salary"
    assert data["amount"] == "3000.00"
    # Проверяем, что транзакция есть в истории
    r2 = client.get("/transactions", headers=auth_headers)
    assert r2.status_code == 200
    txs = [t for t in r2.json() if t.get("description") == "self_topup:salary" and t.get("amount") == "3000.00"]
    assert len(txs) >= 1


def test_accounts_topup_invalid_otp(client, auth_headers, token, rub_account):
    r = client.post(
        f"/accounts/{rub_account['id']}/topup",
        headers=auth_headers,
        json={"amount": "100.00", "otp_code": "9999"},
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "invalid_otp_code"


def test_accounts_topup_amount_non_positive(client, auth_headers, token, rub_account):
    otp = get_otp(client, token)
    r = client.post(
        f"/accounts/{rub_account['id']}/topup",
        headers=auth_headers,
        json={"amount": "0", "otp_code": otp},
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "amount_must_be_positive"


def test_accounts_primary_success(client, auth_headers, two_rub_accounts):
    """Установка приоритетных счетов."""
    acc1, acc2 = two_rub_accounts
    r = client.put(
        "/accounts/primary",
        headers=auth_headers,
        json={"account_ids": [acc1["id"]]},
    )
    assert r.status_code == 200
    assert r.json().get("detail") == "primary_accounts_updated"
    r = client.get("/accounts", headers=auth_headers)
    accounts = r.json()
    primary = [a for a in accounts if a.get("is_primary")]
    assert len(primary) == 1
    assert primary[0]["id"] == acc1["id"]


def test_accounts_primary_not_owned(client, auth_headers, two_rub_accounts):
    """Нельзя пометить чужой счёт как приоритетный."""
    r = client.put(
        "/accounts/primary",
        headers=auth_headers,
        json={"account_ids": [999999]},
    )
    assert r.status_code == 404


def test_accounts_topup_account_not_found(client, auth_headers, token):
    otp = get_otp(client, token)
    r = client.post(
        "/accounts/999999/topup",
        headers=auth_headers,
        json={"amount": "100.00", "otp_code": otp},
    )
    assert r.status_code == 404
    assert r.json().get("detail") == "account_not_found"
