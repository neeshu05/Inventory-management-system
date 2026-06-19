from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import extract, func, cast, String, or_
from typing import List, Optional
from datetime import datetime
from fastapi import HTTPException

from . import models, schemas


# ── Products ──────────────────────────────────────────────────────────────────

def get_products(db: Session, user_id: int, cursor: Optional[int] = None, limit: int = 10) -> dict:
    q = db.query(models.Product).filter(models.Product.owner_id == user_id)
    if cursor:
        q = q.filter(models.Product.id > cursor)
    rows = q.order_by(models.Product.id).limit(limit + 1).all()
    has_more = len(rows) > limit
    items = rows[:limit]
    return {"items": items, "next_cursor": items[-1].id if has_more else None, "has_more": has_more}


def search_products(db: Session, user_id: int, q: str, limit: int = 20) -> List[models.Product]:
    term = f"%{q.lower()}%"
    return (
        db.query(models.Product)
        .filter(
            models.Product.owner_id == user_id,
            (
                models.Product.name.ilike(term) |
                models.Product.sku.ilike(term)
            ),
        )
        .order_by(models.Product.name)
        .limit(limit)
        .all()
    )


def search_customers(db: Session, user_id: int, q: str, limit: int = 20) -> List[models.Customer]:
    term = f"%{q.lower()}%"
    return (
        db.query(models.Customer)
        .filter(
            models.Customer.owner_id == user_id,
            (
                models.Customer.full_name.ilike(term) |
                models.Customer.email.ilike(term) |
                models.Customer.phone.ilike(term)
            ),
        )
        .order_by(models.Customer.full_name)
        .limit(limit)
        .all()
    )


def search_orders(db: Session, user_id: int, q: str, limit: int = 20) -> List[models.Order]:
    term = f"%{q.lower()}%"
    return (
        db.query(models.Order)
        .join(models.Customer)
        .filter(
            models.Order.owner_id == user_id,
            or_(
                models.Customer.full_name.ilike(term),
                models.Customer.email.ilike(term),
                cast(models.Order.id, String).like(f"{q}%"),
            ),
        )
        .order_by(models.Order.id.desc())
        .limit(limit)
        .all()
    )


def get_product(db: Session, product_id: int, user_id: int) -> Optional[models.Product]:
    return (
        db.query(models.Product)
        .filter(models.Product.id == product_id, models.Product.owner_id == user_id)
        .first()
    )


def create_product(db: Session, product: schemas.ProductCreate, user_id: int) -> models.Product:
    db_product = models.Product(**product.model_dump(), owner_id=user_id)
    try:
        db.add(db_product)
        db.commit()
        db.refresh(db_product)
        return db_product
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"SKU '{product.sku}' already exists in your inventory")


def update_product(
    db: Session, product_id: int, product_update: schemas.ProductUpdate, user_id: int
) -> models.Product:
    db_product = get_product(db, product_id, user_id)
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    for key, value in product_update.model_dump(exclude_unset=True).items():
        setattr(db_product, key, value)
    db.commit()
    db.refresh(db_product)
    return db_product


def delete_product(db: Session, product_id: int, user_id: int) -> None:
    db_product = get_product(db, product_id, user_id)
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    db.delete(db_product)
    db.commit()


# ── Customers ─────────────────────────────────────────────────────────────────

def get_customers(db: Session, user_id: int, cursor: Optional[int] = None, limit: int = 10) -> dict:
    q = db.query(models.Customer).filter(models.Customer.owner_id == user_id)
    if cursor:
        q = q.filter(models.Customer.id > cursor)
    rows = q.order_by(models.Customer.id).limit(limit + 1).all()
    has_more = len(rows) > limit
    items = rows[:limit]
    return {"items": items, "next_cursor": items[-1].id if has_more else None, "has_more": has_more}


def get_customer(db: Session, customer_id: int, user_id: int) -> Optional[models.Customer]:
    return (
        db.query(models.Customer)
        .filter(models.Customer.id == customer_id, models.Customer.owner_id == user_id)
        .first()
    )


def create_customer(db: Session, customer: schemas.CustomerCreate, user_id: int) -> models.Customer:
    db_customer = models.Customer(**customer.model_dump(), owner_id=user_id)
    try:
        db.add(db_customer)
        db.commit()
        db.refresh(db_customer)
        return db_customer
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Email '{customer.email}' already registered")


def delete_customer(db: Session, customer_id: int, user_id: int) -> None:
    db_customer = get_customer(db, customer_id, user_id)
    if not db_customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    db.delete(db_customer)
    db.commit()


# ── Orders ────────────────────────────────────────────────────────────────────

def get_orders(db: Session, user_id: int, cursor: Optional[int] = None, limit: int = 10) -> dict:
    q = db.query(models.Order).filter(models.Order.owner_id == user_id)
    if cursor:
        q = q.filter(models.Order.id > cursor)
    rows = q.order_by(models.Order.id).limit(limit + 1).all()
    has_more = len(rows) > limit
    items = rows[:limit]
    return {"items": items, "next_cursor": items[-1].id if has_more else None, "has_more": has_more}


def get_order(db: Session, order_id: int, user_id: int) -> Optional[models.Order]:
    return (
        db.query(models.Order)
        .filter(models.Order.id == order_id, models.Order.owner_id == user_id)
        .first()
    )


def create_order(db: Session, order: schemas.OrderCreate, user_id: int) -> models.Order:
    # Customer must belong to this user
    customer = get_customer(db, order.customer_id, user_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    total_amount = 0.0
    resolved: List[tuple[models.Product, int]] = []

    for item in order.items:
        # Product must belong to this user
        product = get_product(db, item.product_id, user_id)
        if not product:
            raise HTTPException(status_code=404, detail=f"Product with id {item.product_id} not found")
        if product.quantity < item.quantity:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Insufficient stock for '{product.name}'. "
                    f"Available: {product.quantity}, Requested: {item.quantity}"
                ),
            )
        total_amount += product.price * item.quantity
        resolved.append((product, item.quantity))

    db_order = models.Order(
        customer_id=order.customer_id,
        owner_id=user_id,
        total_amount=round(total_amount, 2),
    )
    db.add(db_order)
    db.flush()

    for product, qty in resolved:
        db.add(models.OrderItem(
            order_id=db_order.id,
            product_id=product.id,
            quantity=qty,
            unit_price=product.price,
        ))
        product.quantity -= qty

    db.commit()
    db.refresh(db_order)
    return db_order


def delete_order(db: Session, order_id: int, user_id: int) -> None:
    db_order = get_order(db, order_id, user_id)
    if not db_order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Restore inventory
    for item in db_order.items:
        if item.product:
            item.product.quantity += item.quantity

    db.delete(db_order)
    db.commit()


# ── Dashboard ─────────────────────────────────────────────────────────────────

def get_order_trends(db: Session, user_id: int, week_offset: int = 0) -> dict:
    from datetime import timedelta
    today = datetime.now().date()
    this_monday = today - timedelta(days=today.weekday())
    week_monday = this_monday + timedelta(weeks=week_offset)
    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    labels, counts, revenue = [], [], []
    for i in range(7):
        day = week_monday + timedelta(days=i)
        day_start = datetime(day.year, day.month, day.day, 0, 0, 0)
        day_end = day_start + timedelta(days=1)
        row = (
            db.query(
                func.count(models.Order.id),
                func.coalesce(func.sum(models.Order.total_amount), 0.0),
            )
            .filter(
                models.Order.owner_id == user_id,
                models.Order.created_at >= day_start,
                models.Order.created_at < day_end,
            )
            .first()
        )
        labels.append(day_names[i])
        counts.append(row[0] if row else 0)
        revenue.append(round(float(row[1]) if row else 0.0, 2))
    # today_idx only meaningful when viewing the current week
    today_idx = today.weekday() if week_offset == 0 else -1
    week_start_str = week_monday.strftime("%d %b")
    week_end_str = (week_monday + timedelta(days=6)).strftime("%d %b")
    return {
        "labels": labels,
        "order_counts": counts,
        "revenue": revenue,
        "today_idx": today_idx,
        "week_label": f"{week_start_str} – {week_end_str}",
        "week_offset": week_offset,
    }


# ── Bulk imports ──────────────────────────────────────────────────────────────

def bulk_create_products(db: Session, items: List[schemas.ProductCreate], user_id: int) -> dict:
    created, errors = 0, []
    for i, item in enumerate(items):
        try:
            create_product(db, item, user_id)
            created += 1
        except HTTPException as e:
            errors.append({"row": i + 1, "error": e.detail})
        except Exception as e:
            errors.append({"row": i + 1, "error": str(e)})
    return {"created": created, "failed": len(errors), "errors": errors}


def bulk_create_customers(db: Session, items: List[schemas.CustomerCreate], user_id: int) -> dict:
    created, errors = 0, []
    for i, item in enumerate(items):
        try:
            create_customer(db, item, user_id)
            created += 1
        except HTTPException as e:
            errors.append({"row": i + 1, "error": e.detail})
        except Exception as e:
            errors.append({"row": i + 1, "error": str(e)})
    return {"created": created, "failed": len(errors), "errors": errors}


def bulk_create_orders(db: Session, items: List[schemas.OrderBulkCreate], user_id: int) -> dict:
    created, errors = 0, []
    for i, item in enumerate(items):
        try:
            customer = (
                db.query(models.Customer)
                .filter(
                    models.Customer.email == item.customer_email.lower(),
                    models.Customer.owner_id == user_id,
                )
                .first()
            )
            if not customer:
                errors.append({"row": i + 1, "error": f"Customer '{item.customer_email}' not found"})
                continue

            order_items: List[schemas.OrderItemCreate] = []
            sku_failed = False
            for oi in item.items:
                product = (
                    db.query(models.Product)
                    .filter(
                        models.Product.sku == oi.product_sku.upper(),
                        models.Product.owner_id == user_id,
                    )
                    .first()
                )
                if not product:
                    errors.append({"row": i + 1, "error": f"SKU '{oi.product_sku}' not found"})
                    sku_failed = True
                    break
                order_items.append(schemas.OrderItemCreate(product_id=product.id, quantity=oi.quantity))

            if sku_failed:
                continue

            create_order(db, schemas.OrderCreate(customer_id=customer.id, items=order_items), user_id)
            created += 1
        except HTTPException as e:
            errors.append({"row": i + 1, "error": e.detail})
        except Exception as e:
            errors.append({"row": i + 1, "error": str(e)})
    return {"created": created, "failed": len(errors), "errors": errors}


def get_dashboard_stats(db: Session, user_id: int) -> dict:
    return {
        "total_products": db.query(models.Product).filter(models.Product.owner_id == user_id).count(),
        "total_customers": db.query(models.Customer).filter(models.Customer.owner_id == user_id).count(),
        "total_orders": db.query(models.Order).filter(models.Order.owner_id == user_id).count(),
        "low_stock_count": db.query(models.Product).filter(
            models.Product.owner_id == user_id,
            models.Product.quantity > 0,
            models.Product.quantity <= 10,
        ).count(),
        "out_of_stock_count": db.query(models.Product).filter(
            models.Product.owner_id == user_id,
            models.Product.quantity == 0,
        ).count(),
    }


def get_low_stock_products(db: Session, user_id: int, skip: int = 0, limit: int = 5) -> dict:
    q = (
        db.query(models.Product)
        .filter(models.Product.owner_id == user_id, models.Product.quantity <= 10)
        .order_by(models.Product.quantity, models.Product.id)
    )
    total = q.count()
    items = q.offset(skip).limit(limit).all()
    return {"items": items, "total": total}
