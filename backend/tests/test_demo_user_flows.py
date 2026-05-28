"""
Демо-набор API автотестов (smoke):
1) регистрация пользователя
2) авторизация пользователя
3) пополнение счета

Запуск на вашем стенде:
    set API_BASE_URL=http://155.212.170.64/api/v1
    pytest -q backend/tests/test_demo_user_flows.py
"""

from conftest import get_otp


def test_demo_register_user(client, unique_login, valid_password):
    response = client.post(
        "/auth/register",
        json={"login": unique_login, "password": valid_password},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["login"] == unique_login
    assert body["role"] == "CLIENT"
    assert body["status"] == "ACTIVE"


def test_demo_login_user(client, registered_user):
    login, password, _ = registered_user
    response = client.post(
        "/auth/login",
        json={"login": login, "password": password},
    )
    assert response.status_code == 200
    body = response.json()
    assert body.get("token_type") == "bearer"
    assert body.get("role") == "CLIENT"
    assert body.get("access_token")


def test_demo_topup_account(client, auth_headers, token, rub_account):
    otp = get_otp(client, token)
    response = client.post(
        f"/accounts/{rub_account['id']}/topup",
        headers=auth_headers,
        json={"amount": "1500.00", "otp_code": otp},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["type"] == "TOPUP"
    assert body["money"]["amount"] == "1500.00"
    assert body["status"] == "COMPLETED"
