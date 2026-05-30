# Synthetic Data Handbook

Учебная web-платформа (электронный учебник) с системой авторизации, ролями,
отслеживанием прогресса по урокам/практикам, интерактивными квизами и
лабораторными заданиями с проверкой ответа (включая привязку к Google Colab
notebook'ам).

Разрабатывается в рамках выпускной работы по теме генерации синтетических
данных (ПГНИУ).

## Стек

- **Backend:** Python / FastAPI / SQLAlchemy / Alembic / PostgreSQL 
- **Frontend:** React / Vite / React Router / react-markdown + KaTeX + highlight.js
- **Реверс-прокси / HTTPS:** Caddy (auto Let's Encrypt при наличии домена)
- **Контейнеризация:** Docker + docker compose

## Возможности

- Иерархия контента: **Тема → Подтема → Глава → Урок / Практ. Лаб. работа**, с возможностью
  привязки квиз-вопросов к главам.
- Markdown-контент с поддержкой LaTeX (`$E=mc^2$`, `$$\int x\,dx$$`),
  syntax highlighting блоков кода, copy-кнопкой.
- Прогресс пользователя по урокам, лабам и вопросам — единое представление.
- Практические задания с привязкой к Google Colab и автопроверкой ответа в
  4 режимах: точный текст, число с допуском, single/multiple choice.
- Роли: `student` / `teacher` / `admin`, RBAC через FastAPI dependencies.
- Админ-панель с deep-link навигацией, мобильным drawer'ом, поиском по
  контенту/пользователям/группам.
- Полнотекстовый поиск (PostgreSQL FTS на русском словаре).
- Rate limiting на чувствительных эндпоинтах (login, проверка ответов, поиск,
  создание пользователей).

## Развёртывание (Docker compose, для деплоя или демо)

```bash
git clone <this-repo> && cd ebook_beta
cp .env.example .env
# отредактируй .env — обязательно SECRET_KEY и POSTGRES_PASSWORD
docker compose up -d --build

# первый раз — создай admin'а:
docker compose exec backend python -m scripts.bootstrap_admin
```

`http://localhost` — админка по `/admin` после логина.

## Локальный dev (без Docker)

Нужен локальный PostgreSQL.

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate            # Windows
# source venv/bin/activate       # Linux/Mac
pip install -r requirements.txt

cp .env.example .env
# заполни DATABASE_URL и SECRET_KEY (см. .env.example для генерации)

alembic upgrade head             # накатить схему
python -m scripts.bootstrap_admin  # один раз — создать admin'а

uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev                      # http://localhost:5173
```

В dev-режиме `frontend/.env.development` уже задаёт `VITE_API_URL=http://localhost:8000`,
ничего настраивать не нужно.

## Структура репозитория

```
backend/           — FastAPI приложение (app/), миграции (alembic/), скрипты, Dockerfile
frontend/          — React приложение, Caddyfile, Dockerfile
docker-compose.yml — единый stack для деплоя
.env.example       — образец секретов/конфига для compose
DEPLOY.md          — пошаговая инструкция по деплою на VPS / для локального демо
```

## Лицензия

Учебный проект, для не-коммерческого использования в рамках курсового / выпускного.

<img width="900" height="220" alt="veryjokerge" src="https://github.com/user-attachments/assets/fdba4952-6755-4fb2-a162-c3f592f2eed5" />