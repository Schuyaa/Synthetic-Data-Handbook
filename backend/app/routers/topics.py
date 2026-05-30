# app/routers/topics.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List, Dict, Optional

from app.database import get_db
from app.models import Topic, User
from app.schemas import TopicCreate, TopicUpdate, TopicResponse, TopicTreeNode
from app.utils import require_roles

router = APIRouter(prefix="/topics", tags=["topics"])


def _build_tree(rows: List[Topic]) -> List[TopicTreeNode]:
    children_map: Dict[Optional[int], List[Topic]] = {}
    for t in rows:
        children_map.setdefault(t.parent_id, []).append(t)

    for pid in children_map:
        children_map[pid].sort(key=lambda x: (x.order, x.id))

    def make_node(t: Topic) -> TopicTreeNode:
        node = TopicTreeNode(
            id=t.id,
            slug=t.slug,
            title=t.title,
            kind=t.kind,
            parent_id=t.parent_id,
            order=t.order,
            estimated_minutes=t.estimated_minutes,
            is_published=t.is_published,
            check_mode=t.check_mode,
            children=[]
        )
        for ch in children_map.get(t.id, []):
            node.children.append(make_node(ch))
        return node

    roots = children_map.get(None, [])
    return [make_node(r) for r in roots]


# ===== PUBLIC =====

@router.get("/tree", response_model=List[TopicTreeNode])
def get_topics_tree(db: Session = Depends(get_db)):
    rows = (
        db.query(Topic)
        .filter(Topic.is_published == True)
        .order_by(Topic.parent_id.asc().nullsfirst(), Topic.order.asc(), Topic.id.asc())
        .all()
    )
    return _build_tree(rows)


@router.get("/{slug}", response_model=TopicResponse)
def get_topic_by_slug(slug: str, db: Session = Depends(get_db)):
    topic = db.query(Topic).filter(Topic.slug == slug, Topic.is_published == True).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Тема не найдена")
    return topic


# ===== ADMIN/TEACHER =====

@router.get("/admin/all", response_model=List[TopicResponse])
def admin_get_all_topics(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(["admin", "teacher"]))
):
    return (
        db.query(Topic)
        .order_by(Topic.parent_id.asc().nullsfirst(), Topic.order.asc(), Topic.id.asc())
        .all()
    )


@router.post("/", response_model=TopicResponse)
def create_topic(
    topic: TopicCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(["admin", "teacher"]))
):
    if db.query(Topic).filter(Topic.slug == topic.slug).first():
        raise HTTPException(status_code=400, detail="slug уже используется")

    new_topic = Topic(**topic.model_dump())
    db.add(new_topic)
    db.commit()
    db.refresh(new_topic)
    return new_topic


@router.put("/{topic_id}", response_model=TopicResponse)
def update_topic(
    topic_id: int,
    topic_data: TopicUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(["admin", "teacher"]))
):
    topic = db.query(Topic).filter(Topic.id == topic_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Тема не найдена")

    if topic_data.slug and topic_data.slug != topic.slug:
        if db.query(Topic).filter(Topic.slug == topic_data.slug).first():
            raise HTTPException(status_code=400, detail="slug уже используется")

    for key, value in topic_data.model_dump(exclude_unset=True).items():
        setattr(topic, key, value)

    db.commit()
    db.refresh(topic)
    return topic


@router.delete("/{topic_id}")
def delete_topic(
    topic_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(["admin", "teacher"]))
):
    topic = db.query(Topic).filter(Topic.id == topic_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Тема не найдена")

    db.delete(topic)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=(
                "Не удалось удалить: на элемент ссылаются связанные записи "
                "(прогресс, попытки, вопросы). Если ошибка повторяется — "
                "не применена миграция БД (alembic upgrade head)."
            ),
        )
    return {"message": "Тема удалена"}