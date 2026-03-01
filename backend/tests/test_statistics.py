"""
Автотесты: блок Статистика в UI.

Проверяет, что все типы операций корректно учитываются в статистике:
- Доход: TOPUP (self_topup, self_topup:salary, self_topup:gift), входящие переводы
- Общий расход: платежи, переводы, обмен валют
- Переводы: исходящие переводы (p2p_transfer_by_account, p2p_transfer_by_phone)
- Платежи: mobile, vendor

Логика computeStats() из dashboard.js воспроизведена здесь для верификации.
"""
import os
import time
import httpx
import pytest

BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8001/api/v1")


def _headers(token: str | None = None):
    if not token:
        return {"Content-Type": "application/json"}
    return {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}


def get_otp(client, token: str) -> str:
    r = client.get(f"{BASE_URL}/helper/otp/preview", headers=_headers(token))
    assert r.status_code == 200, (r.status_code, r.json())
    return r.json()["otp"]


def helper_increase(client, token: str, account_id: int, amount: str | float):
    r = client.post(
        f"{BASE_URL}/helper/accounts/{account_id}/increase",
        params={"amount": amount},
        headers=_headers(token),
    )
    assert r.status_code == 200, (r.status_code, r.json())
    return r.json()


def get_transaction_meta(tx, owned_ids: list[int]) -> str:
    """Воспроизведение getTransactionMeta из dashboard.js."""
    desc = tx.get("description") or ""
    tx_type = tx.get("type", "")
    from_id = tx.get("from_account_id")
    to_id = tx.get("to_account_id")
    owns_from = from_id and from_id in owned_ids
    owns_to = to_id and to_id in owned_ids

    if tx_type == "TOPUP":
        return "topup"
    if tx_type == "PAYMENT":
        return "payment"
    if tx_type == "TRANSFER":
        if desc.startswith("fx_exchange"):
            return "fx"
        if desc == "p2p_transfer":
            return "transfer-own"
        if (
            desc.startswith("p2p_transfer_by_account")
            or desc.startswith("p2p_transfer_by_phone")
            or desc.startswith("p2p_by_phone_external")
        ):
            return "transfer-out"
        return "transfer-own"
    return "other"


def compute_stats(transactions: list, owned_ids: list[int]) -> dict:
    """Воспроизведение computeStats из dashboard.js."""
    income_by_currency = {}
    expense_by_currency = {}

    for tx in transactions:
        meta = get_transaction_meta(tx, owned_ids)
        money = tx.get("money") or {}
        amount = float(money.get("amount") or tx.get("amount") or 0)
        currency = money.get("currency") or tx.get("currency") or "RUB"
        owns_from = tx.get("from_account_id") and tx["from_account_id"] in owned_ids
        owns_to = tx.get("to_account_id") and tx["to_account_id"] in owned_ids
        desc = tx.get("description") or ""

        if meta == "topup":
            if currency not in income_by_currency:
                income_by_currency[currency] = {"salary": 0, "gift": 0, "transfer": 0, "topup": 0}
            if desc.startswith("self_topup:salary") or desc == "admin_credit":
                income_by_currency[currency]["salary"] += amount
            elif desc.startswith("self_topup:gift") or desc == "helper_topup:gift":
                income_by_currency[currency]["gift"] += amount
            elif desc.startswith("self_topup:") or desc.startswith("helper_topup:"):
                income_by_currency[currency]["transfer"] += amount
            elif desc == "helper_topup":
                income_by_currency[currency]["topup"] += amount
            else:
                income_by_currency[currency]["topup"] += amount
        elif meta == "transfer-out" and not owns_from and owns_to:
            if currency not in income_by_currency:
                income_by_currency[currency] = {"salary": 0, "gift": 0, "transfer": 0, "topup": 0}
            income_by_currency[currency]["transfer"] += amount
        elif meta == "payment" or (meta == "transfer-out" and owns_from and not owns_to):
            if currency not in expense_by_currency:
                expense_by_currency[currency] = {"payment": 0, "transfer": 0, "fx": 0}
            if meta == "payment":
                expense_by_currency[currency]["payment"] += amount
            else:
                expense_by_currency[currency]["transfer"] += amount
        elif meta == "fx":
            if currency not in expense_by_currency:
                expense_by_currency[currency] = {"payment": 0, "transfer": 0, "fx": 0}
            expense_by_currency[currency]["fx"] += amount

    return {"incomeByCurrency": income_by_currency, "expenseByCurrency": expense_by_currency}


@pytest.fixture(scope="module")
def http_client():
    with httpx.Client(base_url=BASE_URL, timeout=20.0) as client:
        yield client


@pytest.fixture(scope="module")
def stats_test_user(http_client):
    """Пользователь с полным набором операций для теста статистики."""
    login = f"stats{int(time.time() * 1000)}"
    password = "ValidPass123!"
    r = http_client.post("/auth/register", json={"login": login, "password": password})
    assert r.status_code == 201, (r.status_code, r.json())
    r = http_client.post("/auth/login", json={"login": login, "password": password})
    assert r.status_code == 200, (r.status_code, r.json())
    token = r.json()["access_token"]
    return {"client": http_client, "token": token, "login": login, "password": password}


@pytest.fixture(scope="module")
def stats_accounts(stats_test_user):
    """Счета в разных валютах (RUB, USD, EUR, CNY) + второй RUB для transfer-own."""
    client = stats_test_user["client"]
    token = stats_test_user["token"]
    h = _headers(token)
    accounts = {}
    for currency in ["RUB", "USD", "EUR", "CNY"]:
        r = client.post("/accounts", headers=h, json={"account_type": "DEBIT", "currency": currency})
        assert r.status_code == 201, (r.status_code, r.json())
        accounts[currency] = r.json()
    r = client.post("/accounts", headers=h, json={"account_type": "DEBIT", "currency": "RUB"})
    if r.status_code == 201:
        accounts["RUB2"] = r.json()
    return accounts


def test_statistics_income_topup_rub(stats_test_user, stats_accounts):
    """Доход: пополнение RUB через API — должен отображаться в статистике."""
    client = stats_test_user["client"]
    token = stats_test_user["token"]
    h = _headers(token)
    acc = stats_accounts["RUB"]
    otp = get_otp(client, token)
    r = client.post(
        f"/accounts/{acc['id']}/topup",
        headers=h,
        json={"amount": "1500.00", "otp_code": otp},
    )
    assert r.status_code == 201
    r = client.get("/transactions", headers=h)
    assert r.status_code == 200
    txs = r.json()
    owned = [a["id"] for a in stats_accounts.values()]
    stats = compute_stats(txs, owned)
    assert "RUB" in stats["incomeByCurrency"]
    total = sum(stats["incomeByCurrency"]["RUB"].values())
    assert total >= 1500.0, f"Ожидался доход 1500 RUB, получено {total}"


def test_statistics_income_topup_usd(stats_test_user, stats_accounts):
    """Доход: пополнение USD — должен отображаться в полоске Доход по валюте USD."""
    client = stats_test_user["client"]
    token = stats_test_user["token"]
    h = _headers(token)
    acc = stats_accounts["USD"]
    otp = get_otp(client, token)
    r = client.post(
        f"/accounts/{acc['id']}/topup",
        headers=h,
        json={"amount": "200.00", "otp_code": otp},
    )
    assert r.status_code == 201
    r = client.get("/transactions", headers=h)
    assert r.status_code == 200
    txs = r.json()
    owned = [a["id"] for a in stats_accounts.values()]
    stats = compute_stats(txs, owned)
    assert "USD" in stats["incomeByCurrency"], "USD доход должен быть в статистике"
    total = sum(stats["incomeByCurrency"]["USD"].values())
    assert total >= 200.0, f"Ожидался доход 200 USD, получено {total}"


def test_statistics_income_topup_salary(stats_test_user, stats_accounts):
    """Доход: пополнение с purpose=salary — учитывается как зарплата."""
    client = stats_test_user["client"]
    token = stats_test_user["token"]
    h = _headers(token)
    acc = stats_accounts["RUB"]
    otp = get_otp(client, token)
    r = client.post(
        f"/accounts/{acc['id']}/topup",
        headers=h,
        json={"amount": "5000.00", "otp_code": otp, "purpose": "salary"},
    )
    assert r.status_code == 201
    r = client.get("/transactions", headers=h)
    txs = [
        t
        for t in r.json()
        if t.get("description") == "self_topup:salary"
        and str((t.get("money") or {}).get("amount", t.get("amount"))) == "5000.00"
    ]
    assert len(txs) >= 1
    owned = [a["id"] for a in stats_accounts.values()]
    stats = compute_stats(r.json(), owned)
    assert stats["incomeByCurrency"].get("RUB", {}).get("salary", 0) >= 5000.0


def test_statistics_expense_payment(stats_test_user, stats_accounts):
    """Расход: платёж мобильной связи — должен быть в Платежи и Общий расход."""
    client = stats_test_user["client"]
    token = stats_test_user["token"]
    h = _headers(token)
    helper_increase(client, token, stats_accounts["RUB"]["id"], "10000")
    r = client.get("/payments/mobile/operators", headers=h)
    assert r.status_code == 200
    ops = r.json().get("operators", [])
    assert ops, "Нужен справочник операторов"
    otp = get_otp(client, token)
    r = client.post(
        "/payments/mobile",
        headers=h,
        json={
            "account_id": stats_accounts["RUB"]["id"],
            "operator": ops[0],
            "phone": "+79991234567",
            "amount": "500.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 201
    r = client.get("/transactions", headers=h)
    owned = [a["id"] for a in stats_accounts.values()]
    stats = compute_stats(r.json(), owned)
    assert "RUB" in stats["expenseByCurrency"]
    assert stats["expenseByCurrency"]["RUB"]["payment"] >= 500.0


def test_statistics_expense_transfer(stats_test_user, stats_accounts):
    """Расход: перевод по номеру счёта другому пользователю — должен быть в Переводы."""
    client = stats_test_user["client"]
    token = stats_test_user["token"]
    h = _headers(token)
    login2 = f"stats2{int(time.time() * 1000)}"
    r = client.post("/auth/register", json={"login": login2, "password": "ValidPass123!"})
    if r.status_code != 201:
        pytest.skip("Не удалось создать второго пользователя")
    r = client.post("/auth/login", json={"login": login2, "password": "ValidPass123!"})
    token2 = r.json()["access_token"]
    r = client.post("/accounts", headers=_headers(token2), json={"account_type": "DEBIT", "currency": "RUB"})
    if r.status_code != 201:
        pytest.skip("Не удалось создать счёт получателя")
    target_acc = r.json()
    helper_increase(client, token, stats_accounts["RUB"]["id"], "5000")
    otp = get_otp(client, token)
    r = client.post(
        "/transfers/by-account",
        headers=h,
        json={
            "from_account_id": stats_accounts["RUB"]["id"],
            "target_account_number": target_acc["account_number"],
            "amount": "300.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 201
    r = client.get("/transactions", headers=h)
    owned = [a["id"] for a in stats_accounts.values()]
    stats = compute_stats(r.json(), owned)
    assert "RUB" in stats["expenseByCurrency"]
    assert stats["expenseByCurrency"]["RUB"]["transfer"] >= 300.0


def test_statistics_expense_fx(stats_test_user, stats_accounts):
    """Расход: обмен валют — должен быть в Общий расход (fx)."""
    client = stats_test_user["client"]
    token = stats_test_user["token"]
    h = _headers(token)
    helper_increase(client, token, stats_accounts["RUB"]["id"], "10000")
    helper_increase(client, token, stats_accounts["USD"]["id"], "100")
    otp = get_otp(client, token)
    r = client.post(
        "/transfers/exchange",
        headers=h,
        json={
            "from_account_id": stats_accounts["RUB"]["id"],
            "to_account_id": stats_accounts["USD"]["id"],
            "amount": "950.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 201
    r = client.get("/transactions", headers=h)
    txs = [t for t in r.json() if "fx_exchange" in (t.get("description") or "")]
    assert len(txs) >= 1
    owned = [a["id"] for a in stats_accounts.values()]
    stats = compute_stats(r.json(), owned)
    assert "RUB" in stats["expenseByCurrency"]
    assert stats["expenseByCurrency"]["RUB"]["fx"] >= 950.0


def test_statistics_transfer_own_not_counted(stats_test_user, stats_accounts):
    """Перевод между своими счетами (p2p_transfer) — НЕ учитывается в доходах и расходах."""
    if "RUB2" not in stats_accounts:
        pytest.skip("Нужен второй RUB счёт для transfer-own")
    client = stats_test_user["client"]
    token = stats_test_user["token"]
    h = _headers(token)
    helper_increase(client, token, stats_accounts["RUB"]["id"], "5000")
    otp = get_otp(client, token)
    r = client.post(
        "/transfers",
        headers=h,
        json={
            "from_account_id": stats_accounts["RUB"]["id"],
            "to_account_id": stats_accounts["RUB2"]["id"],
            "amount": "100.00",
            "otp_code": otp,
        },
    )
    assert r.status_code == 201
    r = client.get("/transactions", headers=h)
    owned = [a["id"] for a in stats_accounts.values()]
    stats = compute_stats(r.json(), owned)
    transfer_expense = sum(c.get("transfer", 0) for c in stats["expenseByCurrency"].values())
    assert transfer_expense == 0, "p2p_transfer между своими счетами не должен учитываться в расходах"
