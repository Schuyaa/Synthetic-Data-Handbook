# app/limiter.py

"""
Rate limiter (slowapi). Вынесен из main.py, чтобы роутеры импортировали без циркулярки.

Использование:
    @router.post("/login")
    @limiter.limit("5/minute")
    def login(request: Request, ...):  # request обязателен — из него slowapi берёт IP
        ...

За reverse-proxy запускать uvicorn с --proxy-headers, иначе всё IP-склеится.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address


limiter = Limiter(key_func=get_remote_address)
