"""Автотесты: справочники и настройки (GET operators, providers, rates, settings)."""


def test_settings(client, auth_headers):
    r = client.get("/settings", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data.get("theme") == "LIGHT"
    assert data.get("language") == "RU"
    assert data.get("notificationsEnabled") is True
