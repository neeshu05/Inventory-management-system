"""Integration tests for /products endpoints."""
import pytest

_PRODUCT = {"name": "Blue Widget", "sku": "BLU-001", "price": 49.99, "quantity": 100}


class TestListProducts:
    def test_requires_auth(self, client):
        assert client.get("/products/").status_code == 401

    def test_empty_list_initially(self, auth_client):
        resp = auth_client.get("/products/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["has_more"] is False

    def test_returns_created_product(self, auth_client):
        auth_client.post("/products/", json=_PRODUCT)
        resp = auth_client.get("/products/")
        assert len(resp.json()["items"]) == 1

    def test_cursor_pagination(self, auth_client):
        for i in range(12):
            auth_client.post("/products/", json={"name": f"P{i}", "sku": f"S{i}", "price": 1.0, "quantity": i})
        first = auth_client.get("/products/?limit=10").json()
        assert len(first["items"]) == 10
        assert first["has_more"] is True
        second = auth_client.get(f"/products/?limit=10&cursor={first['next_cursor']}").json()
        assert len(second["items"]) == 2
        assert second["has_more"] is False


class TestCreateProduct:
    def test_success_returns_201(self, auth_client):
        resp = auth_client.post("/products/", json=_PRODUCT)
        assert resp.status_code == 201
        assert resp.json()["name"] == "Blue Widget"
        assert resp.json()["price"] == 49.99

    def test_duplicate_sku_returns_400(self, auth_client):
        auth_client.post("/products/", json=_PRODUCT)
        resp = auth_client.post("/products/", json={**_PRODUCT, "name": "Duplicate"})
        assert resp.status_code == 400

    def test_negative_price_returns_422(self, auth_client):
        resp = auth_client.post("/products/", json={**_PRODUCT, "price": -5.0})
        assert resp.status_code == 422

    def test_negative_quantity_returns_422(self, auth_client):
        resp = auth_client.post("/products/", json={**_PRODUCT, "quantity": -1})
        assert resp.status_code == 422

    def test_requires_auth(self, client):
        assert client.post("/products/", json=_PRODUCT).status_code == 401


class TestGetProduct:
    def test_get_existing_product(self, auth_client, product):
        resp = auth_client.get(f"/products/{product.id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == product.id

    def test_get_nonexistent_returns_404(self, auth_client):
        assert auth_client.get("/products/99999").status_code == 404

    def test_cannot_access_another_users_product(self, client, db, product):
        resp = client.post("/auth/register", json={"username": "user2", "email": "u2@t.com", "password": "Pass123"})
        token = resp.json()["access_token"]
        client.headers.update({"Authorization": f"Bearer {token}"})
        assert client.get(f"/products/{product.id}").status_code == 404


class TestUpdateProduct:
    def test_update_price(self, auth_client, product):
        resp = auth_client.put(f"/products/{product.id}", json={"price": 199.99})
        assert resp.status_code == 200
        assert resp.json()["price"] == 199.99

    def test_update_quantity(self, auth_client, product):
        resp = auth_client.put(f"/products/{product.id}", json={"quantity": 200})
        assert resp.status_code == 200
        assert resp.json()["quantity"] == 200

    def test_partial_update_leaves_other_fields_unchanged(self, auth_client, product):
        resp = auth_client.put(f"/products/{product.id}", json={"price": 1.0})
        assert resp.json()["name"] == product.name
        assert resp.json()["sku"] == product.sku

    def test_update_nonexistent_returns_404(self, auth_client):
        assert auth_client.put("/products/99999", json={"price": 1.0}).status_code == 404

    def test_update_negative_price_returns_422(self, auth_client, product):
        assert auth_client.put(f"/products/{product.id}", json={"price": -1.0}).status_code == 422


class TestDeleteProduct:
    def test_delete_returns_204(self, auth_client, product):
        assert auth_client.delete(f"/products/{product.id}").status_code == 204

    def test_deleted_product_not_found(self, auth_client, product):
        auth_client.delete(f"/products/{product.id}")
        assert auth_client.get(f"/products/{product.id}").status_code == 404

    def test_delete_nonexistent_returns_404(self, auth_client):
        assert auth_client.delete("/products/99999").status_code == 404


class TestSearchProducts:
    def test_search_by_name(self, auth_client):
        auth_client.post("/products/", json={"name": "Blue Chair", "sku": "CHR-1", "price": 50.0, "quantity": 5})
        auth_client.post("/products/", json={"name": "Red Table", "sku": "TBL-1", "price": 80.0, "quantity": 3})
        results = auth_client.get("/products/search?q=chair").json()
        assert len(results) == 1
        assert results[0]["name"] == "Blue Chair"

    def test_search_by_sku(self, auth_client):
        auth_client.post("/products/", json={"name": "X", "sku": "UNQ-999", "price": 1.0, "quantity": 1})
        results = auth_client.get("/products/search?q=UNQ-999").json()
        assert len(results) == 1

    def test_search_no_results(self, auth_client):
        results = auth_client.get("/products/search?q=nonexistent_xyz").json()
        assert results == []

    def test_empty_query_returns_empty(self, auth_client):
        auth_client.post("/products/", json=_PRODUCT)
        results = auth_client.get("/products/search?q=").json()
        assert results == []

    def test_search_requires_auth(self, client):
        assert client.get("/products/search?q=test").status_code == 401


class TestFilterProductsByStatus:
    def _create(self, client, name, sku, quantity):
        return client.post("/products/", json={"name": name, "sku": sku, "price": 1.0, "quantity": quantity})

    def test_in_stock_excludes_low_and_out(self, auth_client):
        self._create(auth_client, "Full",  "F-1", 50)
        self._create(auth_client, "Low",   "L-1", 5)
        self._create(auth_client, "Empty", "E-1", 0)
        items = auth_client.get("/products/?status=in_stock").json()["items"]
        assert len(items) == 1
        assert items[0]["name"] == "Full"

    def test_low_stock_excludes_in_and_out(self, auth_client):
        self._create(auth_client, "Full",  "F-1", 50)
        self._create(auth_client, "Low",   "L-1", 5)
        self._create(auth_client, "Empty", "E-1", 0)
        items = auth_client.get("/products/?status=low_stock").json()["items"]
        assert len(items) == 1
        assert items[0]["name"] == "Low"

    def test_out_of_stock_only(self, auth_client):
        self._create(auth_client, "Full",  "F-1", 50)
        self._create(auth_client, "Empty", "E-1", 0)
        items = auth_client.get("/products/?status=out_of_stock").json()["items"]
        assert len(items) == 1
        assert items[0]["name"] == "Empty"

    def test_no_status_returns_all(self, auth_client):
        self._create(auth_client, "A", "A-1", 100)
        self._create(auth_client, "B", "B-1", 5)
        self._create(auth_client, "C", "C-1", 0)
        assert len(auth_client.get("/products/").json()["items"]) == 3

    def test_boundary_quantity_10_is_low_stock(self, auth_client):
        self._create(auth_client, "Ten",    "T-10", 10)
        self._create(auth_client, "Eleven", "E-11", 11)
        low  = auth_client.get("/products/?status=low_stock").json()["items"]
        full = auth_client.get("/products/?status=in_stock").json()["items"]
        assert len(low)  == 1 and low[0]["name"]  == "Ten"
        assert len(full) == 1 and full[0]["name"] == "Eleven"

    def test_filter_with_cursor_pagination(self, auth_client):
        for i in range(15):
            self._create(auth_client, f"Out{i}", f"O{i}", 0)
        first = auth_client.get("/products/?status=out_of_stock&limit=10").json()
        assert len(first["items"]) == 10
        assert first["has_more"] is True
        second = auth_client.get(
            f"/products/?status=out_of_stock&limit=10&cursor={first['next_cursor']}"
        ).json()
        assert len(second["items"]) == 5
        assert second["has_more"] is False
