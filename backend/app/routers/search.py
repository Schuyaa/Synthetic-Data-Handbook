# app/routers/search.py

from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func, literal, or_

from app.database import get_db
from app.limiter import limiter
from app.models import Topic
from app.schemas import SearchResponse, SearchResult

router = APIRouter(prefix="/search", tags=["search"])

# Настройки подсветки сниппетов (ts_headline)
HEADLINE_OPTS = (
    "MaxWords=30, MinWords=12, ShortWord=3, "
    "StartSel=<mark>, StopSel=</mark>, "
    "HighlightAll=false"
)

def _target(topic: Topic):
    # root section = theme, child section = chapter, lesson = lesson
    # subtopic = visual grouping only, excluded from search results
    # lab = labs excluded from search results
    if topic.kind == "subtopic":
        return None
    if topic.kind == "lab":
        return None
    if topic.kind == "lesson":
        return "lesson"
    if topic.parent_id is None:
        return "theme"
    return "chapter"

@router.get("", response_model=SearchResponse)
@limiter.limit("30/minute")
def search(
    request: Request,
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
):

    P = aliased(Topic)
    G = aliased(Topic)

    vector = func.to_tsvector(
        literal("russian"),
        func.coalesce(Topic.title, "") + " " + func.coalesce(Topic.content, "")
    )
    ts_query = func.plainto_tsquery(literal("russian"), q)

    rank = func.ts_rank_cd(vector, ts_query).label("rank")

    snippet = func.ts_headline(literal("russian"), func.coalesce(Topic.content, ""), ts_query, literal(HEADLINE_OPTS)).label("snippet")

    base = (
        db.query(
            Topic,
            P.slug.label("parent_slug"),
            G.slug.label("grand_slug"),
            rank,
            snippet,
        )
        .outerjoin(P, P.id == Topic.parent_id)
        .outerjoin(G, G.id == P.parent_id)
        .filter(Topic.is_published == True)
    )

    # Для очень коротких запросов FTS может быть "строгим".
    q_norm = q.strip()
    q_escaped = q_norm.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    ilike = f"%{q_escaped}%"

    fts_match = vector.op("@@")(ts_query)
    loose_match = or_(Topic.title.ilike(ilike), Topic.content.ilike(ilike))

    if len(q_norm) < 3:
        rows = (
            base.filter(loose_match)
            .order_by(Topic.kind.asc(), Topic.order.asc(), Topic.id.asc())
            .limit(limit)
            .all()
        )
    else:
        rows = (
            base.filter(or_(fts_match, loose_match))
            .order_by(rank.desc(), Topic.kind.asc(), Topic.order.asc(), Topic.id.asc())
            .limit(limit)
            .all()
        )

    results: List[SearchResult] = []
    for topic, parent_slug, grand_slug, r, snip in rows:
        target = _target(topic)
        if target is None:
            continue  

        chapter_slug: Optional[str] = None
        theme_slug: Optional[str] = None

        if target == "theme":
            theme_slug = topic.slug
        elif target == "chapter":
            chapter_slug = topic.slug
            theme_slug = parent_slug  
        else:  
            chapter_slug = parent_slug
            theme_slug = grand_slug

        results.append(
            SearchResult(
                id=topic.id,
                target=target,
                slug=topic.slug,
                title=topic.title,
                chapter_slug=chapter_slug,
                theme_slug=theme_slug,
                snippet=snip,
                rank=float(r or 0.0),
            )
        )

    return SearchResponse(q=q, results=results)