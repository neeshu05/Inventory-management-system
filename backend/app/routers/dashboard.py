from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import crud, schemas, models
from ..database import get_db
from ..auth import get_current_user

router = APIRouter()


@router.get("/", response_model=schemas.DashboardStats)
def get_dashboard(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.get_dashboard_stats(db=db, user_id=current_user.id)


@router.get("/low-stock", response_model=schemas.LowStockPage)
def get_low_stock(
    skip: int = 0,
    limit: int = 5,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.get_low_stock_products(db=db, user_id=current_user.id, skip=skip, limit=limit)


@router.get("/trends")
def get_trends(
    week_offset: int = 0,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.get_order_trends(db=db, user_id=current_user.id, week_offset=week_offset)
