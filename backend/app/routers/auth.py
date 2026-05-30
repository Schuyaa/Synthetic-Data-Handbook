# app/routers/auth.py

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app.limiter import limiter
from app.models import User
from app import schemas
from app.utils import create_access_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=schemas.TokenResponse)
@limiter.limit("5/minute")
def login(request: Request, payload: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(
        or_(
            User.username == payload.login,
            User.email == payload.login,
        )
    ).first()

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Неверный логин или пароль")

    access_token = create_access_token(data={"sub": user.username})

    return {
        "access_token": access_token,
        "username": user.username,
        "role": user.role,
    }
