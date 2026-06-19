from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from .. import models, schemas
from ..auth import (
    hash_password, verify_password,
    create_access_token, create_refresh_token,
    verify_refresh_token, get_current_user,
)
from ..database import get_db

router = APIRouter()


def _make_auth_response(user: models.User) -> dict:
    return {
        "user": user,
        "access_token": create_access_token(user.username),
        "refresh_token": create_refresh_token(user.username),
    }


@router.post("/register", response_model=schemas.AuthResponse, status_code=201)
def register(payload: schemas.UserRegister, db: Session = Depends(get_db)):
    hashed = hash_password(payload.password)
    user = models.User(
        username=payload.username.strip(),
        email=payload.email.strip().lower(),
        hashed_password=hashed,
    )
    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Username or email already taken")

    return _make_auth_response(user)


@router.post("/login", response_model=schemas.AuthResponse)
def login(payload: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    return _make_auth_response(user)


@router.post("/refresh", response_model=schemas.RefreshResponse)
def refresh_tokens(payload: schemas.RefreshRequest, db: Session = Depends(get_db)):
    username = verify_refresh_token(payload.refresh_token)
    if not username:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")

    return {
        "access_token": create_access_token(user.username),
        "refresh_token": create_refresh_token(user.username),
    }


@router.post("/logout")
def logout():
    return {"message": "Logged out"}


@router.get("/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user
