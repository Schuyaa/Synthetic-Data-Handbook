# app/utils.py

import os
from datetime import datetime, timedelta, timezone
from typing import List

from typing import Optional

from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from passlib.context import CryptContext

from app.database import get_db
from app.models import User


# ─── Config ────────────────────────────────────────────

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM", "HS256")

if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY не установлен. Задай в backend/.env: "
        "SECRET_KEY=<длинная случайная строка>"
    )
if not ALGORITHM:
    raise RuntimeError("ALGORITHM не установлен. По умолчанию ожидается HS256.")

try:
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
except ValueError:
    ACCESS_TOKEN_EXPIRE_MINUTES = 60


# ─── Password hashing ─────────────────────────────────

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    """Bcrypt-хеш пароля."""
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Сверить пароль с хешем."""
    return pwd_context.verify(plain, hashed)


# Password policy: 8+ символов, обязательна и буква, и цифра. Хотя для учебного проекта это перебор, ну и ладно
# Спецсимволы уж требовать не будем

PASSWORD_MIN_LEN = 8


def validate_password(plain: str) -> str | None:
    if not plain or len(plain) < PASSWORD_MIN_LEN:
        return f"Пароль минимум {PASSWORD_MIN_LEN} символов"
    has_letter = any(c.isalpha() for c in plain)
    has_digit = any(c.isdigit() for c in plain)
    if not has_letter:
        return "Пароль должен содержать хотя бы одну букву"
    if not has_digit:
        return "Пароль должен содержать хотя бы одну цифру"
    return None


# ─── JWT ──────────────────────────────────────────────

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials",
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception

    return user


def get_optional_user(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[User]:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer "):].strip()
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            return None
    except JWTError:
        return None
    return db.query(User).filter(User.username == username).first()


def require_roles(allowed_roles: List[str]):
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied",
            )
        return current_user
    return role_checker
