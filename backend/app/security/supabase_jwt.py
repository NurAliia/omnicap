"""
Минтинг Supabase-совместимого JWT для пользователя, авторизованного через Telegram.

Supabase Auth не знает про Telegram, поэтому мы сами подписываем токен
SUPABASE_JWT_SECRET с claim'ами, которые ожидает PostgREST/RLS:
- `sub`  -> users.id (используется в auth.uid() внутри RLS policies)
- `role` -> 'authenticated' (роль, для которой в БД созданы policies)

Фронтенд передаёт этот токен в supabase-js как access_token и может делать
прямые SELECT-запросы к своим данным в обход бэкенда — RLS их ограничит.
Запись чувствительных данных (assets/transactions) всё равно идёт через
бэкенд, потому что там же происходит app-level шифрование полей.
"""
import time

import jwt

from app.core.config import settings


def mint_access_token(user_id: str, telegram_id: int) -> str:
    now = int(time.time())
    payload = {
        "sub": user_id,
        "role": "authenticated",
        "telegram_id": telegram_id,
        "iat": now,
        "exp": now + settings.access_token_ttl_seconds,
        "aud": "authenticated",
    }
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")
