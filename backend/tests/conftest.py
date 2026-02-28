"""
Фикстуры для API-автотестов. Тесты запускаются против поднятого сервера (docker compose up).
Подготовка данных — только через API (регистрация, Helper).
"""
import os
import time
import httpx
import pytest

BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8001/api/v1")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL.rstrip("/")


@pytest.fixture(scope="session")
def http_client():
    with httpx.Client(base_url=BASE_URL, timeout=15.0) as client:
        yield client


@pytest.fixture
def client(http_client):
    """Клиент без авторизации (каждый тест может логиниться сам)."""
    return http_client


def _headers(token: str | None = None):
    if not token:
        return {"Content-Type": "application/json"}
    return {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}


@pytest.fixture
def unique_login():
    """Уникальный логин для регистрации (избегаем конфликтов между тестами)."""
    return f"user_{int(time.time() * 1000)}"


@pytest.fixture
def valid_password():
    return "ValidPass123!"


@pytest.fixture
def registered_user(client, unique_login, valid_password):
    """Регистрация пользователя, возвращает (login, password, user_dict)."""
    r = client.post("/auth/register", json={"login": unique_login, "password": valid_password})
    assert r.status_code == 201, (r.status_code, r.json())
    data = r.json()
    return unique_login, valid_password, data


@pytest.fixture
def token(client, registered_user):
    """Токен залогиненного пользователя (только что зарегистрированного)."""
    login, password, _ = registered_user
    r = client.post("/auth/login", json={"login": login, "password": password})
    assert r.status_code == 200, (r.status_code, r.json())
    return r.json()["access_token"]


@pytest.fixture
def auth_headers(token):
    return _headers(token)


def get_otp(client, token: str) -> str:
    """Получить OTP через helper. OTP только динамический — фиксированного кода нет."""
    r = client.get("/helper/otp/preview", headers=_headers(token))
    assert r.status_code == 200, (r.status_code, r.json())
    return r.json()["otp"]


@pytest.fixture
def rub_account(client, auth_headers):
    """Один активный RUB DEBIT счёт пользователя (создаётся при первом запросе)."""
    r = client.get("/accounts", headers=auth_headers)
    assert r.status_code == 200
    accounts = r.json()
    rub = next((a for a in accounts if a["currency"] == "RUB" and a.get("account_type") == "DEBIT"), None)
    if rub:
        return rub
    r = client.post("/accounts", headers=auth_headers, json={"account_type": "DEBIT", "currency": "RUB"})
    assert r.status_code == 201, (r.status_code, r.json())
    return r.json()


@pytest.fixture
def two_rub_accounts(client, auth_headers):
    """Два RUB-счёта (DEBIT) для переводов."""
    accounts = []
    for _ in range(2):
        r = client.post("/accounts", headers=auth_headers, json={"account_type": "DEBIT", "currency": "RUB"})
        assert r.status_code == 201, (r.status_code, r.json())
        accounts.append(r.json())
    return accounts[0], accounts[1]


def helper_increase(client, token: str, account_id: int, amount: str | float):
    r = client.post(
        f"/helper/accounts/{account_id}/increase",
        params={"amount": amount},
        headers=_headers(token),
    )
    assert r.status_code == 200, (r.status_code, r.json())
    return r.json()


def helper_zero(client, token: str, account_id: int):
    r = client.post(f"/helper/accounts/{account_id}/zero", headers=_headers(token))
    assert r.status_code == 200, (r.status_code, r.json())
    return r.json()
