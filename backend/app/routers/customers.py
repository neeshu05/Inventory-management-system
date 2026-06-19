from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from .. import crud, schemas, models
from ..database import get_db
from ..auth import get_current_user

router = APIRouter()


@router.get("/search", response_model=List[schemas.CustomerResponse])
def search_customers(
    q: str = "",
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not q or len(q.strip()) < 1:
        return []
    return crud.search_customers(db=db, user_id=current_user.id, q=q.strip(), limit=limit)


@router.get("/", response_model=schemas.PagedCustomers)
def list_customers(
    cursor: Optional[int] = None,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.get_customers(db=db, user_id=current_user.id, cursor=cursor, limit=limit)


@router.post("/bulk", response_model=schemas.BulkResult)
def bulk_create_customers(
    payload: List[schemas.CustomerCreate],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.bulk_create_customers(db=db, items=payload, user_id=current_user.id)


@router.post("/", response_model=schemas.CustomerResponse, status_code=201)
def create_customer(
    customer: schemas.CustomerCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.create_customer(db=db, customer=customer, user_id=current_user.id)


@router.get("/{customer_id}", response_model=schemas.CustomerResponse)
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    customer = crud.get_customer(db=db, customer_id=customer_id, user_id=current_user.id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.delete("/{customer_id}", status_code=204)
def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    crud.delete_customer(db=db, customer_id=customer_id, user_id=current_user.id)
