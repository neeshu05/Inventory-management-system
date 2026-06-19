from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from .. import crud, schemas, models
from ..database import get_db
from ..auth import get_current_user

router = APIRouter()


@router.get("/search", response_model=List[schemas.OrderResponse])
def search_orders(
    q: str = "",
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not q or len(q.strip()) < 1:
        return []
    return crud.search_orders(db=db, user_id=current_user.id, q=q.strip(), limit=limit)


@router.get("/", response_model=schemas.PagedOrders)
def list_orders(
    cursor: Optional[int] = None,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.get_orders(db=db, user_id=current_user.id, cursor=cursor, limit=limit)


@router.post("/bulk", response_model=schemas.BulkResult)
def bulk_create_orders(
    payload: List[schemas.OrderBulkCreate],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.bulk_create_orders(db=db, items=payload, user_id=current_user.id)


@router.post("/", response_model=schemas.OrderResponse, status_code=201)
def create_order(
    order: schemas.OrderCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.create_order(db=db, order=order, user_id=current_user.id)


@router.get("/{order_id}", response_model=schemas.OrderResponse)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    order = crud.get_order(db=db, order_id=order_id, user_id=current_user.id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.patch("/{order_id}/complete", response_model=schemas.OrderResponse)
def complete_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    order = crud.get_order(db=db, order_id=order_id, user_id=current_user.id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status != "pending":
        raise HTTPException(status_code=400, detail=f"Order is already {order.status}")
    order.status = "completed"
    db.commit()
    db.refresh(order)
    return order


@router.delete("/{order_id}", status_code=204)
def delete_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    crud.delete_order(db=db, order_id=order_id, user_id=current_user.id)
