"""
Unit tests for CRUD helper functions.
Uses the in-memory SQLite DB via the shared `db` fixture.
"""
import pytest
from fastapi import HTTPException

from app import crud, models, schemas
from app.auth import hash_password


# ── Products ──────────────────────────────────────────────────────────────────

class TestProductCRUD:
    def test_create_returns_product_with_id(self, db, test_user):
        p = crud.create_product(
            db,
            schemas.ProductCreate(name="Widget", sku="WGT-1", price=9.99, quantity=10),
            test_user.id,
        )
        assert p.id is not None
        assert p.name == "Widget"
        assert p.owner_id == test_user.id

    def test_create_duplicate_sku_raises_400(self, db, test_user):
        crud.create_product(db, schemas.ProductCreate(name="A", sku="DUPE", price=1.0, quantity=1), test_user.id)
        with pytest.raises(HTTPException) as exc:
            crud.create_product(db, schemas.ProductCreate(name="B", sku="DUPE", price=2.0, quantity=2), test_user.id)
        assert exc.value.status_code == 400
        assert "DUPE" in exc.value.detail

    def test_get_product_returns_correct_item(self, db, test_user, product):
        fetched = crud.get_product(db, product.id, test_user.id)
        assert fetched.id == product.id
        assert fetched.name == product.name

    def test_get_product_wrong_owner_returns_none(self, db, test_user, product):
        other_user = models.User(
            username="other", email="other@x.com",
            hashed_password=hash_password("pass123"), is_active=True,
        )
        db.add(other_user)
        db.commit()
        assert crud.get_product(db, product.id, other_user.id) is None

    def test_pagination_limits_results(self, db, test_user):
        for i in range(7):
            crud.create_product(db, schemas.ProductCreate(name=f"P{i}", sku=f"S{i}", price=1.0, quantity=i), test_user.id)
        result = crud.get_products(db, test_user.id, limit=5)
        assert len(result["items"]) == 5
        assert result["has_more"] is True

    def test_cursor_returns_next_page(self, db, test_user):
        for i in range(7):
            crud.create_product(db, schemas.ProductCreate(name=f"P{i}", sku=f"S{i}", price=1.0, quantity=i), test_user.id)
        first = crud.get_products(db, test_user.id, limit=5)
        second = crud.get_products(db, test_user.id, cursor=first["next_cursor"], limit=5)
        assert len(second["items"]) == 2
        assert second["has_more"] is False

    def test_update_changes_only_specified_fields(self, db, test_user, product):
        original_name = product.name
        updated = crud.update_product(db, product.id, schemas.ProductUpdate(price=199.99), test_user.id)
        assert updated.price == 199.99
        assert updated.name == original_name  # untouched

    def test_update_nonexistent_product_raises_404(self, db, test_user):
        with pytest.raises(HTTPException) as exc:
            crud.update_product(db, 99999, schemas.ProductUpdate(price=1.0), test_user.id)
        assert exc.value.status_code == 404

    def test_delete_removes_product(self, db, test_user, product):
        crud.delete_product(db, product.id, test_user.id)
        assert crud.get_product(db, product.id, test_user.id) is None

    def test_delete_nonexistent_raises_404(self, db, test_user):
        with pytest.raises(HTTPException) as exc:
            crud.delete_product(db, 99999, test_user.id)
        assert exc.value.status_code == 404

    def test_products_scoped_to_owner(self, db, test_user):
        other = models.User(username="other2", email="o2@x.com", hashed_password=hash_password("p"), is_active=True)
        db.add(other)
        db.commit()
        crud.create_product(db, schemas.ProductCreate(name="Mine", sku="MY-1", price=1.0, quantity=1), test_user.id)
        crud.create_product(db, schemas.ProductCreate(name="Theirs", sku="TH-1", price=1.0, quantity=1), other.id)
        result = crud.get_products(db, test_user.id, limit=50)
        assert all(p.owner_id == test_user.id for p in result["items"])
        assert len(result["items"]) == 1


# ── Customers ─────────────────────────────────────────────────────────────────

class TestCustomerCRUD:
    def test_create_customer(self, db, test_user):
        c = crud.create_customer(
            db,
            schemas.CustomerCreate(full_name="Alice Smith", email="alice@ex.com", phone="1234567890"),
            test_user.id,
        )
        assert c.id is not None
        assert c.email == "alice@ex.com"

    def test_duplicate_email_same_owner_raises_400(self, db, test_user):
        crud.create_customer(db, schemas.CustomerCreate(full_name="A", email="dupe@ex.com"), test_user.id)
        with pytest.raises(HTTPException) as exc:
            crud.create_customer(db, schemas.CustomerCreate(full_name="B", email="dupe@ex.com"), test_user.id)
        assert exc.value.status_code == 400

    def test_same_email_different_owner_is_allowed(self, db, test_user):
        other = models.User(username="other3", email="o3@x.com", hashed_password=hash_password("p"), is_active=True)
        db.add(other)
        db.commit()
        crud.create_customer(db, schemas.CustomerCreate(full_name="A", email="shared@ex.com"), test_user.id)
        c2 = crud.create_customer(db, schemas.CustomerCreate(full_name="B", email="shared@ex.com"), other.id)
        assert c2.id is not None

    def test_delete_customer(self, db, test_user, customer):
        crud.delete_customer(db, customer.id, test_user.id)
        assert crud.get_customer(db, customer.id, test_user.id) is None


# ── Orders ────────────────────────────────────────────────────────────────────

class TestOrderCRUD:
    def test_create_order_deducts_stock(self, db, test_user, customer, product):
        initial_qty = product.quantity
        crud.create_order(
            db,
            schemas.OrderCreate(customer_id=customer.id, items=[schemas.OrderItemCreate(product_id=product.id, quantity=5)]),
            test_user.id,
        )
        db.refresh(product)
        assert product.quantity == initial_qty - 5

    def test_create_order_calculates_total(self, db, test_user, customer, product):
        o = crud.create_order(
            db,
            schemas.OrderCreate(customer_id=customer.id, items=[schemas.OrderItemCreate(product_id=product.id, quantity=3)]),
            test_user.id,
        )
        assert o.total_amount == pytest.approx(product.price * 3, rel=1e-4)

    def test_create_order_insufficient_stock_raises_400(self, db, test_user, customer, product):
        with pytest.raises(HTTPException) as exc:
            crud.create_order(
                db,
                schemas.OrderCreate(customer_id=customer.id, items=[schemas.OrderItemCreate(product_id=product.id, quantity=9999)]),
                test_user.id,
            )
        assert exc.value.status_code == 400
        assert "Insufficient" in exc.value.detail

    def test_create_order_unknown_customer_raises_404(self, db, test_user, product):
        with pytest.raises(HTTPException) as exc:
            crud.create_order(
                db,
                schemas.OrderCreate(customer_id=99999, items=[schemas.OrderItemCreate(product_id=product.id, quantity=1)]),
                test_user.id,
            )
        assert exc.value.status_code == 404

    def test_delete_order_restores_stock(self, db, test_user, customer, product, order):
        qty_before_cancel = product.quantity
        crud.delete_order(db, order.id, test_user.id)
        db.refresh(product)
        # The fixture order consumed 1 unit; cancelling returns it
        assert product.quantity == qty_before_cancel + 1

    def test_delete_nonexistent_order_raises_404(self, db, test_user):
        with pytest.raises(HTTPException) as exc:
            crud.delete_order(db, 99999, test_user.id)
        assert exc.value.status_code == 404


# ── Dashboard ─────────────────────────────────────────────────────────────────

class TestDashboardCRUD:
    def test_stats_empty_db(self, db, test_user):
        stats = crud.get_dashboard_stats(db, test_user.id)
        assert stats["total_products"] == 0
        assert stats["total_customers"] == 0
        assert stats["total_orders"] == 0
        assert stats["low_stock_count"] == 0
        assert stats["out_of_stock_count"] == 0

    def test_stats_counts_correctly(self, db, test_user):
        crud.create_product(db, schemas.ProductCreate(name="Low", sku="L-1", price=1.0, quantity=5), test_user.id)
        crud.create_product(db, schemas.ProductCreate(name="Out", sku="O-1", price=1.0, quantity=0), test_user.id)
        crud.create_product(db, schemas.ProductCreate(name="Full", sku="F-1", price=1.0, quantity=100), test_user.id)
        stats = crud.get_dashboard_stats(db, test_user.id)
        assert stats["total_products"] == 3
        assert stats["low_stock_count"] == 1   # qty 5
        assert stats["out_of_stock_count"] == 1  # qty 0

    def test_low_stock_pagination(self, db, test_user):
        for i in range(8):
            crud.create_product(db, schemas.ProductCreate(name=f"L{i}", sku=f"LS{i}", price=1.0, quantity=i + 1), test_user.id)
        page1 = crud.get_low_stock_products(db, test_user.id, skip=0, limit=5)
        assert len(page1["items"]) == 5
        assert page1["total"] == 8
        page2 = crud.get_low_stock_products(db, test_user.id, skip=5, limit=5)
        assert len(page2["items"]) == 3
