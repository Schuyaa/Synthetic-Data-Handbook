"""
Создать первого admin'а в свежей БД, так как в самом приложении нельзя создать админа, это как бы и безопасность но и чутка неудобство.

Запуск:
    cd backend
    python -m scripts.bootstrap_admin

Или сразу с параметрами в env:
    BOOTSTRAP_USERNAME=admin BOOTSTRAP_EMAIL=admin@example.com \\
    BOOTSTRAP_PASSWORD=ChangeMe123 python -m scripts.bootstrap_admin

Если не передать env — спросит интерактивно через input() и getpass().
Скрипт идемпотентен (умное слово, если проще то ничего не отрыгнёт): если admin с таким username/email уже есть — ничего
не делает (выводит сообщение и выходит с кодом 0).

После запуска — сразу логинимся этим аккаунтом и через UI создаём преподавателей и студентов. Этот скрипт нужен ровно один раз на свежей БД.
"""

import getpass
import os
import sys
from pathlib import Path

# Чтобы скрипт работал и из backend/, и из корня проекта.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402
from app.models import User  # noqa: E402
from app.utils import hash_password, validate_password  # noqa: E402


def _ask(prompt: str, env_key: str, *, secret: bool = False) -> str:
    val = os.getenv(env_key)
    if val:
        return val.strip()
    if secret:
        return getpass.getpass(prompt).strip()
    return input(prompt).strip()


def main() -> int:
    print("═══ Bootstrap admin ═══")
    print("Если в env заданы BOOTSTRAP_USERNAME/EMAIL/PASSWORD — они и пойдут в БД.")
    print()

    username = _ask("Username (по умолчанию admin): ", "BOOTSTRAP_USERNAME") or "admin"
    email = _ask("Email: ", "BOOTSTRAP_EMAIL")
    if not email:
        print("Email обязателен. Прерываю.", file=sys.stderr)
        return 2

    password = _ask("Password: ", "BOOTSTRAP_PASSWORD", secret=True)
    pwd_err = validate_password(password)
    if pwd_err:
        print(f"Пароль не подходит: {pwd_err}", file=sys.stderr)
        return 2

    db = SessionLocal()
    try:
        existing = db.query(User).filter(
            (User.username == username) | (User.email == email)
        ).first()
        if existing:
            print(f"Пользователь '{existing.username}' (роль: {existing.role}) уже есть. Ничего не делаю.")
            return 0

        admin = User(
            username=username,
            email=email,
            password_hash=hash_password(password),
            role="admin",
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
        print(f"✓ Создан admin: id={admin.id}, username={admin.username}, email={admin.email}")
        print("  Залогинься через UI и создавай teacher'ов / студентов.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
