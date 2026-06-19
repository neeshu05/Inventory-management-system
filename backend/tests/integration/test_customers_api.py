"""Integration tests for /customers endpoints."""

_CUSTOMER = {"full_name": "Alice Smith", "email": "alice@example.com", "phone": "9876543210"}


class TestListCustomers:
    def test_requires_auth(self, client):
        assert client.get("/customers/").status_code == 401

    def test_empty_initially(self, auth_client):
        resp = auth_client.get("/customers/")
        assert resp.status_code == 200
        assert resp.json()["items"] == []

    def test_returns_created_customer(self, auth_client):
        auth_client.post("/customers/", json=_CUSTOMER)
        resp = auth_client.get("/customers/")
        assert len(resp.json()["items"]) == 1

    def test_pagination(self, auth_client):
        for i in range(12):
            auth_client.post("/customers/", json={"full_name": f"Person{i}", "email": f"p{i}@t.com"})
        first = auth_client.get("/customers/?limit=10").json()
        assert len(first["items"]) == 10
        assert first["has_more"] is True


class TestCreateCustomer:
    def test_success_returns_201(self, auth_client):
        resp = auth_client.post("/customers/", json=_CUSTOMER)
        assert resp.status_code == 201
        assert resp.json()["email"] == "alice@example.com"

    def test_duplicate_email_returns_400(self, auth_client):
        auth_client.post("/customers/", json=_CUSTOMER)
        resp = auth_client.post("/customers/", json={**_CUSTOMER, "full_name": "Alice Two"})
        assert resp.status_code == 400

    def test_missing_email_returns_422(self, auth_client):
        resp = auth_client.post("/customers/", json={"full_name": "No Email"})
        assert resp.status_code == 422

    def test_requires_auth(self, client):
        assert client.post("/customers/", json=_CUSTOMER).status_code == 401


class TestGetCustomer:
    def test_get_existing(self, auth_client, customer):
        resp = auth_client.get(f"/customers/{customer.id}")
        assert resp.status_code == 200
        assert resp.json()["full_name"] == customer.full_name

    def test_not_found_returns_404(self, auth_client):
        assert auth_client.get("/customers/99999").status_code == 404

    def test_cannot_access_other_users_customer(self, client, customer):
        # Unauthenticated client cannot access any customer
        resp = client.get(f"/customers/{customer.id}")
        assert resp.status_code in (401, 404)


class TestDeleteCustomer:
    def test_delete_returns_204(self, auth_client, customer):
        assert auth_client.delete(f"/customers/{customer.id}").status_code == 204

    def test_deleted_customer_not_found(self, auth_client, customer):
        auth_client.delete(f"/customers/{customer.id}")
        assert auth_client.get(f"/customers/{customer.id}").status_code == 404

    def test_delete_nonexistent_returns_404(self, auth_client):
        assert auth_client.delete("/customers/99999").status_code == 404


class TestSearchCustomers:
    def test_search_by_name(self, auth_client):
        auth_client.post("/customers/", json={"full_name": "Bob Builder", "email": "bob@t.com"})
        auth_client.post("/customers/", json={"full_name": "Carol White", "email": "carol@t.com"})
        results = auth_client.get("/customers/search?q=bob").json()
        assert len(results) == 1
        assert results[0]["full_name"] == "Bob Builder"

    def test_search_by_email(self, auth_client):
        auth_client.post("/customers/", json={"full_name": "Dave", "email": "dave@uniquedomain.com"})
        results = auth_client.get("/customers/search?q=uniquedomain").json()
        assert len(results) == 1

    def test_search_by_phone(self, auth_client):
        auth_client.post("/customers/", json={"full_name": "Eve", "email": "eve@t.com", "phone": "5551234567"})
        results = auth_client.get("/customers/search?q=5551234567").json()
        assert len(results) == 1

    def test_empty_query_returns_empty(self, auth_client):
        auth_client.post("/customers/", json=_CUSTOMER)
        assert auth_client.get("/customers/search?q=").json() == []

    def test_requires_auth(self, client):
        assert client.get("/customers/search?q=alice").status_code == 401
