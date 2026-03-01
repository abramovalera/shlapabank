"""Автотесты: история транзакций (GET /transactions)."""
import pytest

from conftest import get_otp, helper_increase


def test_transactions_list(client, auth_headers):
    r = client.get("/transactions", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)


def test_transactions_after_topup(client, auth_headers, token, rub_account):
    otp = get_otp(client, token)
    client.post(
        f"/accounts/{rub_account['id']}/topup",
        headers=auth_headers,
        json={"amount": "100.00", "otp_code": otp},
    )
    r = client.get("/transactions", headers=auth_headers)
    assert r.status_code == 200
    txs = [t for t in r.json() if t.get("description") == "self_topup" and t.get("money", {}).get("amount") == "100.00"]
    assert len(txs) >= 1


def test_transactions_after_transfer(client, auth_headers, token, two_rub_accounts):
    a1, a2 = two_rub_accounts
    helper_increase(client, token, a1["id"], "5000")
    otp = get_otp(client, token)
    client.post(
        "/transfers",
        headers=auth_headers,
        json={
            "from_account_id": a1["id"],
            "to_account_id": a2["id"],
            "amount": "200.00",
            "otp_code": otp,
        },
    )
    r = client.get("/transactions", headers=auth_headers)
    assert r.status_code == 200
    txs = [t for t in r.json() if t.get("description") == "p2p_transfer"]
    assert len(txs) >= 1
    assert any(t["money"]["amount"] == "200.00" for t in txs)


def test_transactions_fields(client, auth_headers):
    r = client.get("/transactions", headers=auth_headers)
    assert r.status_code == 200
    for t in r.json()[:3]:
        for key in ("id", "type", "money", "status", "created_at", "description", "from_account_id", "to_account_id"):
            assert key in t
        assert "amount" in t["money"] and "fee" in t["money"] and "total" in t["money"] and "currency" in t["money"]


def test_receipt_download(client, auth_headers, token, rub_account):
    """GET /transactions/{id}/receipt возвращает HTML-чек по своей операции."""
    otp = get_otp(client, token)
    client.post(
        f"/accounts/{rub_account['id']}/topup",
        headers=auth_headers,
        json={"amount": "50.00", "otp_code": otp},
    )
    r = client.get("/transactions", headers=auth_headers)
    assert r.status_code == 200
    txs = r.json()
    assert len(txs) >= 1
    tx_id = txs[0]["id"]
    rec = client.get(f"/transactions/{tx_id}/receipt", headers=auth_headers)
    assert rec.status_code == 200
    assert "text/html" in rec.headers.get("content-type", "")
    html = rec.text
    assert "ShlapaBank" in html
    assert "Чек операции" in html
    assert str(tx_id) in html
    assert "50.00" in html
