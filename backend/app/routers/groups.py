# app/routers/groups.py

from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Group, User
from app.schemas import (
    GroupCreate, GroupUpdate, GroupResponse,
    GroupProgressResponse,
)
from app.services.groups import compute_group_progress
from app.utils import require_roles

router = APIRouter(prefix="/groups", tags=["groups"])


def _validate_course(course):
    if course is None:
        return None
    if not isinstance(course, int) or course < 1 or course > 4:
        raise HTTPException(400, "course должен быть целым числом от 1 до 4 или null")
    return course


@router.get("", response_model=List[GroupResponse])
def get_all_groups(db: Session = Depends(get_db)):
    """Список всех групп (публичный — нужен при выборе группы в админке)."""
    return db.query(Group).order_by(Group.course.nullslast(), Group.name).all()


@router.post("", response_model=GroupResponse)
def create_group(
    body: GroupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "teacher"])),
):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(400, "Название группы не может быть пустым")
    if db.query(Group).filter(Group.name == name).first():
        raise HTTPException(400, "Группа с таким названием уже существует")
    course = _validate_course(body.course)
    g = Group(name=name, course=course)
    db.add(g)
    db.commit()
    db.refresh(g)
    return g


@router.put("/{group_id}", response_model=GroupResponse)
def update_group(
    group_id: int,
    body: GroupUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "teacher"])),
):
    g = db.query(Group).filter(Group.id == group_id).first()
    if not g:
        raise HTTPException(404, "Группа не найдена")

    if body.name is not None:
        name = (body.name or "").strip()
        if not name:
            raise HTTPException(400, "Название группы не может быть пустым")
        existing = db.query(Group).filter(Group.name == name, Group.id != group_id).first()
        if existing:
            raise HTTPException(400, "Группа с таким названием уже существует")
        g.name = name

    # course: если поле явно прислано (включая null) — обновляем.
    # Pydantic: отличить "не передано" от "передано null" можно через model_fields_set.
    if "course" in body.model_fields_set:
        g.course = _validate_course(body.course)

    db.commit()
    db.refresh(g)
    return g


@router.delete("/{group_id}")
def delete_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"])),
):
    g = db.query(Group).filter(Group.id == group_id).first()
    if not g:
        raise HTTPException(404, "Группа не найдена")
    db.delete(g)
    db.commit()
    return {"ok": True}




@router.get("/{group_id}/progress", response_model=GroupProgressResponse)
def get_group_progress(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "teacher"])),
):
    return compute_group_progress(db, group_id)
