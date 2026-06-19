"""Integration tests for /dashboard endpoints."""


class TestDashboardStats:
    def test_requires_auth(self, client):
        assert client.get("/dashboard/").status_code == 401

    def test_initial_state_all_zeros(self, auth_client):
        data = auth_client.get("/dashboard/").json()
        assert data["total_products"] == 0
        assert data["total_customers"] == 0
        assert data["total_orders"] == 0
        assert data["low_stock_count"] == 0
        assert data["out_of_stock_count"] == 0

    def test_counts_products(self, auth_client):
        auth_client.post("/products/", json={"name": "P", "sku": "P-1", "price": 1.0, "quantity": 50})
        data = auth_client.get("/dashboard/").json()
        assert data["total_products"] == 1

    def test_counts_customers(self, auth_client):
        auth_client.post("/customers/", json={"full_name": "Bob", "email": "bob@t.com"})
        data = auth_client.get("/dashboard/").json()
        assert data["total_customers"] == 1

    def test_low_stock_count(self, auth_client):
        # low stock = quantity > 0 and <= 10
        auth_client.post("/products/", json={"name": "Low", "sku": "L-1", "price": 1.0, "quantity": 5})
        data = auth_client.get("/dashboard/").json()
        assert data["low_stock_count"] == 1
        assert data["out_of_stock_count"] == 0

    def test_out_of_stock_count(self, auth_client):
        auth_client.post("/products/", json={"name": "Out", "sku": "O-1", "price": 1.0, "quantity": 0})
        data = auth_client.get("/dashboard/").json()
        assert data["out_of_stock_count"] == 1
        assert data["low_stock_count"] == 0

    def test_in_stock_not_counted_as_low(self, auth_client):
        # quantity > 10 should not appear in low_stock_count
        auth_client.post("/products/", json={"name": "Full", "sku": "F-1", "price": 1.0, "quantity": 100})
        data = auth_client.get("/dashboard/").json()
        assert data["low_stock_count"] == 0
        assert data["out_of_stock_count"] == 0

    def test_counts_orders(self, auth_client, order):
        data = auth_client.get("/dashboard/").json()
        assert data["total_orders"] == 1


class TestLowStockPaginated:
    def test_requires_auth(self, client):
        assert client.get("/dashboard/low-stock").status_code == 401

    def test_empty_when_no_low_stock(self, auth_client):
        # A well-stocked product should not appear
        auth_client.post("/products/", json={"name": "Full", "sku": "F-1", "price": 1.0, "quantity": 100})
        data = auth_client.get("/dashboard/low-stock").json()
        assert data["items"] == []
        assert data["total"] == 0

    def test_includes_low_and_out_of_stock(self, auth_client):
        auth_client.post("/products/", json={"name": "Low", "sku": "L-1", "price": 1.0, "quantity": 5})
        auth_client.post("/products/", json={"name": "Out", "sku": "O-1", "price": 1.0, "quantity": 0})
        data = auth_client.get("/dashboard/low-stock").json()
        assert data["total"] == 2

    def test_pagination_limit(self, auth_client):
        for i in range(8):
            auth_client.post("/products/", json={"name": f"L{i}", "sku": f"LS{i}", "price": 1.0, "quantity": i + 1})
        data = auth_client.get("/dashboard/low-stock?skip=0&limit=5").json()
        assert len(data["items"]) == 5
        assert data["total"] == 8

    def test_pagination_second_page(self, auth_client):
        for i in range(8):
            auth_client.post("/products/", json={"name": f"L{i}", "sku": f"LS{i}", "price": 1.0, "quantity": i + 1})
        data = auth_client.get("/dashboard/low-stock?skip=5&limit=5").json()
        assert len(data["items"]) == 3

    def test_ordered_by_quantity_ascending(self, auth_client):
        auth_client.post("/products/", json={"name": "High", "sku": "H-1", "price": 1.0, "quantity": 9})
        auth_client.post("/products/", json={"name": "Zero", "sku": "Z-1", "price": 1.0, "quantity": 0})
        auth_client.post("/products/", json={"name": "Mid", "sku": "M-1", "price": 1.0, "quantity": 5})
        items = auth_client.get("/dashboard/low-stock").json()["items"]
        quantities = [p["quantity"] for p in items]
        assert quantities == sorted(quantities)


class TestTrends:
    def test_requires_auth(self, client):
        assert client.get("/dashboard/trends").status_code == 401

    def test_returns_seven_day_labels(self, auth_client):
        data = auth_client.get("/dashboard/trends").json()
        assert len(data["labels"]) == 7

    def test_returns_seven_day_counts(self, auth_client):
        data = auth_client.get("/dashboard/trends").json()
        assert len(data["order_counts"]) == 7
        assert len(data["revenue"]) == 7

    def test_week_offset_param(self, auth_client):
        current = auth_client.get("/dashboard/trends?week_offset=0").json()
        previous = auth_client.get("/dashboard/trends?week_offset=-1").json()
        assert current["week_label"] != previous["week_label"]

    def test_today_idx_is_valid_for_current_week(self, auth_client):
        data = auth_client.get("/dashboard/trends?week_offset=0").json()
        assert 0 <= data["today_idx"] <= 6

    def test_today_idx_is_minus_one_for_past_week(self, auth_client):
        data = auth_client.get("/dashboard/trends?week_offset=-1").json()
        assert data["today_idx"] == -1
