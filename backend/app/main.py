# app/main.py

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.limiter import limiter
from app.routers import auth, user, topics, admin, search, progress, quiz, groups, labs

app = FastAPI(title="Synthetic Data Handbook API")

# slowapi: state нужен для request.app.state.limiter в декораторах.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS_ORIGINS из env, запятая-разделённый. На проде можно будет забыть забить ну или как там.
_cors_raw = os.getenv("CORS_ORIGINS", "http://localhost:5173")
origins = [o.strip() for o in _cors_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(user.router)
app.include_router(topics.router)
app.include_router(admin.router)
app.include_router(search.router)
app.include_router(progress.router)
app.include_router(quiz.router)
app.include_router(groups.router)
app.include_router(labs.router)
