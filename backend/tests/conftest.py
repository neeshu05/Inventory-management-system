import os

# Must be set BEFORE any app module is imported.
# load_dotenv() inside app code won't override these because they're already in os.environ.
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_inventory.db")
os.environ.setdefault("SECRET_KEY", "test-secret-key-minimum-32-chars-long-for-pytest")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, get_db
from app.auth import hash_password
from app import models

# In-memory SQLite with a shared connection so all fixtures see the same data.
_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@event.listens_for(_engine, "connect")
def _enable_foreign_keys(dbapi_conn, _):
    """SQLite ignores FK constraints by default — enable them for realistic tests."""
    dbapi_conn.execute("PRAGMA foreign_keys=ON")


_TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


# ── Core fixtures ─────────────────────────────────────────────────────────────

@pytest.fixture(scope="function")
def db():
    """Create all tables before each test, drop them after."""
    Base.metadata.create_all(bind=_engine)
    session = _TestingSession()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=_engine)


@pytest.fixture(scope="function")
def client(db):
    """FastAPI TestClient whose DB calls go to the in-memory SQLite session."""
    def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


# ── User / auth fixtures ──────────────────────────────────────────────────────

@pytest.fixture
def test_user(db):
    """A pre-created active user."""
    user = models.User(
        username="testuser",
        email="test@example.com",
        hashed_password=hash_password("Password123"),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def auth_client(client, test_user):
    """TestClient already logged in as test_user (auth cookies set)."""
    resp = client.post("/auth/login", json={"username": "testuser", "password": "Password123"})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return client


# ── Resource fixtures ─────────────────────────────────────────────────────────

@pytest.fixture
def product(db, test_user):
    """A product owned by test_user with plenty of stock."""
    p = models.Product(
        name="Test Widget",
        sku="TST-001",
        price=99.99,
        quantity=50,
        description="A reliable test product",
        owner_id=test_user.id,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@pytest.fixture
def customer(db, test_user):
    """A customer owned by test_user."""
    c = models.Customer(
        full_name="Jane Doe",
        email="jane@example.com",
        phone="9876543210",
        owner_id=test_user.id,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@pytest.fixture
def order(db, test_user, customer, product):
    """A pending order for 1 unit of product, owned by test_user."""
    o = models.Order(
        customer_id=customer.id,
        owner_id=test_user.id,
        total_amount=product.price * 1,
        status="pending",
    )
    db.add(o)
    db.flush()
    db.add(models.OrderItem(
        order_id=o.id,
        product_id=product.id,
        quantity=1,
        unit_price=product.price,
    ))
    product.quantity -= 1
    db.commit()
    db.refresh(o)
    return o
