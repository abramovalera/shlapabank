"""Автотесты: Admin API (users, block/unblock, credit, transactions)."""
import pytest


def test_admin_users_list(client, admin_headers):
    r = client.get("/admin/users", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert any(u.get("role") == "ADMIN" for u in data)


def test_admin_block_unblock(client, registered_user, admin_headers, auth_headers):
    _, _, user = registered_user
    r = client.post(f"/admin/users/{user['id']}/block", headers=admin_headers)
    assert r.status_code == 200
    assert r.json().get("status") == "BLOCKED"
    r = client.get("/profile", headers=auth_headers)
    assert r.status_code == 403
    assert r.json().get("detail") == "user_blocked"
    r = client.post(f"/admin/users/{user['id']}/unblock", headers=admin_headers)
    assert r.status_code == 200
    assert r.json().get("status") == "ACTIVE"
    r = client.get("/profile", headers=auth_headers)
    assert r.status_code == 200


def test_admin_credit_success(client, admin_headers, registered_user, auth_headers, rub_account):
    r = client.post(
        f"/admin/accounts/{rub_account['id']}/credit",
        headers=admin_headers,
        json={"amount": "3000.00", "otp_code": "0000"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["type"] == "TOPUP"
    assert data["description"] == "admin_credit"
    assert data["amount"] == "3000.00"


def test_admin_credit_invalid_otp(client, admin_headers, rub_account):
    r = client.post(
        f"/admin/accounts/{rub_account['id']}/credit",
        headers=admin_headers,
        json={"amount": "100.00", "otp_code": "1234"},
    )
    assert r.status_code == 400
    assert r.json().get("detail") == "invalid_otp_code"


def test_admin_credit_account_not_found(client, admin_headers):
    r = client.post(
        "/admin/accounts/999999/credit",
        headers=admin_headers,
        json={"amount": "100.00", "otp_code": "0000"},
    )
    assert r.status_code == 404
    assert r.json().get("detail") == "account_not_found"


def test_admin_transactions(client, admin_headers):
    r = client.get("/admin/transactions", headers=admin_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_admin_forbidden_for_client(client, auth_headers):
    r = client.get("/admin/users", headers=auth_headers)
    assert r.status_code == 403
    assert r.json().get("detail") == "forbidden"
