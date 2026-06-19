from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional


from .. import crud, schemas, models
from ..database import get_db
from ..auth import get_current_user

router = APIRouter()


@router.get("/search", response_model=List[schemas.ProductResponse])
def search_products(
    q: str = "",
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not q or len(q.strip()) < 1:
        return []
    return crud.search_products(db=db, user_id=current_user.id, q=q.strip(), limit=limit)


@router.get("/", response_model=schemas.PagedProducts)
def list_products(
    cursor: Optional[int] = None,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.get_products(db=db, user_id=current_user.id, cursor=cursor, limit=limit)


@router.post("/bulk", response_model=schemas.BulkResult)
def bulk_create_products(
    payload: List[schemas.ProductCreate],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.bulk_create_products(db=db, items=payload, user_id=current_user.id)


@router.post("/", response_model=schemas.ProductResponse, status_code=201)
def create_product(
    product: schemas.ProductCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.create_product(db=db, product=product, user_id=current_user.id)


@router.get("/{product_id}", response_model=schemas.ProductResponse)
def get_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    product = crud.get_product(db=db, product_id=product_id, user_id=current_user.id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.put("/{product_id}", response_model=schemas.ProductResponse)
def update_product(
    product_id: int,
    product: schemas.ProductUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.update_product(db=db, product_id=product_id, product_update=product, user_id=current_user.id)


@router.delete("/{product_id}", status_code=204)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    crud.delete_product(db=db, product_id=product_id, user_id=current_user.id)
