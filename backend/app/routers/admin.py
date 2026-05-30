# app/routers/admin.py

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.limiter import limiter
from app.models import User, UserProgress, Group, QuestionAnswer
from app.schemas import (
    UserResponse, RoleUpdate, UserGroupUpdate, ProgressItem,
    AdminUserCreate, AdminUserUpdate, FullProgressResponse,
)
from app.services.progress import build_full_progress
from app.utils import require_roles, hash_password, validate_password

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=List[UserResponse])
def get_all_users(
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(["admin", "teacher"]))
):
    return db.query(User).all()


@router.post("/users", response_model=UserResponse)
@limiter.limit("20/minute")
def create_user(
    request: Request,
    payload: AdminUserCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(["admin", "teacher"])),
):
    if current.role == "teacher" and payload.role != "student":
        raise HTTPException(status_code=403, detail="Преподаватель может создавать только студентов")

    pwd_err = validate_password(payload.password)
    if pwd_err:
        raise HTTPException(status_code=400, detail=pwd_err)

    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email уже используется")

    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=400, detail="Username уже используется")

    if payload.group_id is not None:
        if not db.query(Group).filter(Group.id == payload.group_id).first():
            raise HTTPException(status_code=400, detail="Группа не найдена")

    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        first_name=payload.first_name,
        last_name=payload.last_name,
        group_id=payload.group_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=UserResponse)
def update_user_fields(
    user_id: int,
    payload: AdminUserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(["admin", "teacher"])),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.username is not None and payload.username != user.username:
        new_username = payload.username.strip()
        if not new_username:
            raise HTTPException(status_code=400, detail="Имя пользователя не может быть пустым")
        if db.query(User).filter(User.username == new_username, User.id != user_id).first():
            raise HTTPException(status_code=400, detail="Username уже используется")
        user.username = new_username

    if payload.email is not None and payload.email != user.email:
        if db.query(User).filter(User.email == payload.email, User.id != user_id).first():
            raise HTTPException(status_code=400, detail="Email уже используется")
        user.email = payload.email

    if payload.first_name is not None:
        user.first_name = payload.first_name or None
    if payload.last_name is not None:
        user.last_name = payload.last_name or None

    # Password: None или пустая строка не менять; непустая валидация + хеш
    if payload.password is not None and payload.password != "":
        pwd_err = validate_password(payload.password)
        if pwd_err:
            raise HTTPException(status_code=400, detail=pwd_err)
        user.password_hash = hash_password(payload.password)

    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}/role")
def change_user_role(
    user_id: int,
    payload: RoleUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(["admin"]))
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.role = payload.role
    db.commit()

    return {"message": "Role updated"}


@router.put("/users/{user_id}/group")
def change_user_group(
    user_id: int,
    payload: UserGroupUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(["admin", "teacher"])),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.group_id is not None:
        if not db.query(Group).filter(Group.id == payload.group_id).first():
            raise HTTPException(status_code=400, detail="Группа не найдена")
    user.group_id = payload.group_id
    db.commit()
    return {"message": "Group updated"}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(["admin"]))
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Удалить связанные записи (FK без CASCADE)
    db.query(UserProgress).filter(UserProgress.user_id == user_id).delete()
    db.query(QuestionAnswer).filter(QuestionAnswer.user_id == user_id).delete()

    db.delete(user)
    db.commit()

    return {"message": "User deleted successfully"}


@router.get("/users/{user_id}/progress", response_model=List[ProgressItem])
def get_user_progress(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(["admin", "teacher"]))
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return db.query(UserProgress).filter(UserProgress.user_id == user_id).all()


@router.get("/users/{user_id}/progress/full", response_model=FullProgressResponse)
def get_user_progress_full(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(["admin", "teacher"]))
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return build_full_progress(db, user_id)