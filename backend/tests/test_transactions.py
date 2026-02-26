"""Автотесты: история транзакций (GET /transactions)."""
import pytest

from conftest import helper_increase


def test_transactions_list(client, auth_headers):
    r = client.get("/transactions", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)


def test_transactions_after_topup(client, auth_headers, rub_account):
    client.post(
        f"/accounts/{rub_account['id']}/topup",
        headers=auth_headers,
        json={"amount": "100.00", "otp_code": "0000"},
    )
    r = client.get("/transactions", headers=auth_headers)
    assert r.status_code == 200
    txs = [t for t in r.json() if t.get("description") == "self_topup" and t.get("amount") == "100.00"]
    assert len(txs) >= 1


def test_transactions_after_transfer(client, auth_headers, token, two_rub_accounts):
    a1, a2 = two_rub_accounts
    helper_increase(client, token, a1["id"], "5000")
    client.post(
        "/transfers",
        headers=auth_headers,
        json={
            "from_account_id": a1["id"],
            "to_account_id": a2["id"],
            "amount": "200.00",
            "otp_code": "0000",
        },
    )
    r = client.get("/transactions", headers=auth_headers)
    assert r.status_code == 200
    txs = [t for t in r.json() if t.get("description") == "p2p_transfer"]
    assert len(txs) >= 1
    assert any(t["amount"] == "200.00" for t in txs)


def test_transactions_fields(client, auth_headers):
    r = client.get("/transactions", headers=auth_headers)
    assert r.status_code == 200
    for t in r.json()[:3]:
        for key in ("id", "type", "amount", "currency", "status", "initiated_by", "created_at"):
            assert key in t
