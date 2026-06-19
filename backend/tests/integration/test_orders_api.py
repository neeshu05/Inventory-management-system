"""Integration tests for /orders endpoints."""
import pytest


class TestListOrders:
    def test_requires_auth(self, client):
        assert client.get("/orders/").status_code == 401

    def test_empty_initially(self, auth_client):
        resp = auth_client.get("/orders/")
        assert resp.status_code == 200
        assert resp.json()["items"] == []

    def test_returns_created_order(self, auth_client, order):
        resp = auth_client.get("/orders/")
        assert len(resp.json()["items"]) == 1


class TestCreateOrder:
    def test_success_returns_201(self, auth_client, customer, product):
        resp = auth_client.post("/orders/", json={
            "customer_id": customer.id,
            "items": [{"product_id": product.id, "quantity": 2}],
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "pending"
        assert data["total_amount"] == pytest.approx(product.price * 2, rel=1e-4)

    def test_deducts_stock(self, auth_client, db, customer, product):
        initial_qty = product.quantity
        auth_client.post("/orders/", json={
            "customer_id": customer.id,
            "items": [{"product_id": product.id, "quantity": 3}],
        })
        db.refresh(product)
        assert product.quantity == initial_qty - 3

    def test_insufficient_stock_returns_400(self, auth_client, customer, product):
        resp = auth_client.post("/orders/", json={
            "customer_id": customer.id,
            "items": [{"product_id": product.id, "quantity": 99999}],
        })
        assert resp.status_code == 400

    def test_unknown_customer_returns_404(self, auth_client, product):
        resp = auth_client.post("/orders/", json={
            "customer_id": 99999,
            "items": [{"product_id": product.id, "quantity": 1}],
        })
        assert resp.status_code == 404

    def test_unknown_product_returns_404(self, auth_client, customer):
        resp = auth_client.post("/orders/", json={
            "customer_id": customer.id,
            "items": [{"product_id": 99999, "quantity": 1}],
        })
        assert resp.status_code == 404

    def test_zero_quantity_returns_422(self, auth_client, customer, product):
        resp = auth_client.post("/orders/", json={
            "customer_id": customer.id,
            "items": [{"product_id": product.id, "quantity": 0}],
        })
        assert resp.status_code == 422

    def test_empty_items_returns_422(self, auth_client, customer):
        resp = auth_client.post("/orders/", json={"customer_id": customer.id, "items": []})
        assert resp.status_code == 422

    def test_requires_auth(self, client, customer, product):
        resp = client.post("/orders/", json={
            "customer_id": customer.id,
            "items": [{"product_id": product.id, "quantity": 1}],
        })
        assert resp.status_code == 401


class TestGetOrder:
    def test_get_existing(self, auth_client, order):
        resp = auth_client.get(f"/orders/{order.id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == order.id
        assert len(resp.json()["items"]) == 1

    def test_not_found_returns_404(self, auth_client):
        assert auth_client.get("/orders/99999").status_code == 404


class TestCompleteOrder:
    def test_complete_pending_order(self, auth_client, order):
        resp = auth_client.patch(f"/orders/{order.id}/complete")
        assert resp.status_code == 200
        assert resp.json()["status"] == "completed"

    def test_complete_already_completed_returns_400(self, auth_client, order):
        auth_client.patch(f"/orders/{order.id}/complete")
        resp = auth_client.patch(f"/orders/{order.id}/complete")
        assert resp.status_code == 400
        assert "already" in resp.json()["detail"].lower()

    def test_complete_nonexistent_returns_404(self, auth_client):
        assert auth_client.patch("/orders/99999/complete").status_code == 404

    def test_requires_auth(self, client, order):
        assert client.patch(f"/orders/{order.id}/complete").status_code == 401


class TestCancelOrder:
    def test_cancel_returns_204(self, auth_client, order):
        assert auth_client.delete(f"/orders/{order.id}").status_code == 204

    def test_cancel_restores_stock(self, auth_client, db, order, product):
        qty_before = product.quantity
        auth_client.delete(f"/orders/{order.id}")
        db.refresh(product)
        assert product.quantity == qty_before + 1  # fixture ordered 1 unit

    def test_cancel_nonexistent_returns_404(self, auth_client):
        assert auth_client.delete("/orders/99999").status_code == 404

    def test_cancelled_order_not_found(self, auth_client, order):
        auth_client.delete(f"/orders/{order.id}")
        assert auth_client.get(f"/orders/{order.id}").status_code == 404


class TestSearchOrders:
    def test_search_by_customer_name(self, auth_client, order, customer):
        results = auth_client.get(f"/orders/search?q={customer.full_name[:4]}").json()
        assert len(results) >= 1

    def test_search_no_results(self, auth_client):
        assert auth_client.get("/orders/search?q=zzznomatch999").json() == []

    def test_empty_query_returns_empty(self, auth_client):
        assert auth_client.get("/orders/search?q=").json() == []

    def test_requires_auth(self, client):
        assert client.get("/orders/search?q=test").status_code == 401
