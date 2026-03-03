"""Автотесты: справочники и служебные эндпоинты (health, operators, providers, rates, banks, clear-browser)."""
import pytest

from conftest import get_otp


def test_health(client):
    """GET /health — проверка здоровья сервера."""
    base = client._base_url
    health_url = str(base).split("/api/v1")[0] + "/health"
    r = client.get(health_url)
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


def test_mobile_operators_list(client, auth_headers):
    """Справочник мобильных операторов содержит ожидаемые имена."""
    r = client.get("/payments/mobile/operators", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    expected = {"Babline", "MTSha", "MegaFun", "TelePanda", "YotaLike"}
    assert set(data["operators"]) == expected
    assert data["amountRangeRub"]["min"] == 100
    assert data["amountRangeRub"]["max"] == 12000


def test_vendor_providers_list(client, auth_headers):
    """Справочник вендоров содержит все ожидаемые провайдеры с accountLength."""
    r = client.get("/payments/vendor/providers", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    providers = {p["name"]: p["accountLength"] for p in data["providers"]}
    assert providers["CityWater"] == 18
    assert providers["RostelCom+"] == 15
    assert providers["GoodHands"] == 10
    assert data["amountRangeRub"]["min"] == 100
    assert data["amountRangeRub"]["max"] == 500000


def test_exchange_rates(client, auth_headers):
    """Курсы валют содержат RUB, USD, EUR, CNY."""
    r = client.get("/transfers/rates", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "toRub" in data
    assert data["base"] == "RUB"
    for c in ("RUB", "USD", "EUR", "CNY"):
        assert c in data["toRub"]
    assert data["toRub"]["RUB"] == "1"
    assert float(data["toRub"]["USD"]) == 95
    assert float(data["toRub"]["EUR"]) == 105
    assert float(data["toRub"]["CNY"]) == 13.5


def test_daily_usage_structure(client, auth_headers):
    """Суточные лимиты имеют правильную структуру."""
    r = client.get("/transfers/daily-usage", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "limits" in data
    assert "perCurrency" in data["limits"]
    currencies_seen = set()
    for item in data["limits"]["perCurrency"]:
        assert "currency" in item
        assert "dailyLimit" in item
        assert "usedToday" in item
        assert "remaining" in item
        currencies_seen.add(item["currency"])
    for c in ("RUB", "USD", "EUR", "CNY"):
        assert c in currencies_seen


def test_helper_clear_browser(client, auth_headers):
    """POST /helper/clear-browser возвращает redirect."""
    r = client.post("/helper/clear-browser", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data.get("detail") == "clear_browser"
    assert "redirect" in data


def test_helper_accounts_list(client, auth_headers):
    """GET /helper/accounts — список счетов через helper."""
    r = client.get("/helper/accounts", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
