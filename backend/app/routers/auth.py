from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from .. import models, schemas
from ..auth import (
    hash_password, verify_password,
    create_access_token, create_refresh_token,
    verify_refresh_token, get_current_user,
    ACCESS_TOKEN_EXPIRE_MINUTES, REFRESH_TOKEN_EXPIRE_DAYS,
)
from ..database import get_db

router = APIRouter()

# SameSite=none + Secure=True required for cross-origin cookies (Vercel → Render)
_COOKIE = dict(httponly=True, samesite="none", secure=True, path="/")


def _set_auth_cookies(response: Response, username: str) -> None:
    response.set_cookie(
        key="access_token",
        value=create_access_token(username),
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        **_COOKIE,
    )
    response.set_cookie(
        key="refresh_token",
        value=create_refresh_token(username),
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        **_COOKIE,
    )


@router.post("/register", response_model=schemas.AuthResponse, status_code=201)
def register(payload: schemas.UserRegister, response: Response, db: Session = Depends(get_db)):
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

    _set_auth_cookies(response, user.username)
    return {"user": user}


@router.post("/login", response_model=schemas.AuthResponse)
def login(payload: schemas.UserLogin, response: Response, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    _set_auth_cookies(response, user.username)
    return {"user": user}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out"}


@router.post("/refresh", response_model=schemas.AuthResponse)
def refresh_tokens(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    username = verify_refresh_token(token)
    if not username:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")

    _set_auth_cookies(response, user.username)
    return {"user": user}


@router.get("/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user
