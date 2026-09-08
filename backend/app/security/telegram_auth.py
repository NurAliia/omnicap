"""
Верификация Telegram WebApp initData.

Алгоритм (см. https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
1. secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)
2. data_check_string = все поля initData кроме hash, отсортированные по ключу,
   склеенные "key=value" через "\n"
3. hash сравнивается с HMAC_SHA256(key=secret_key, msg=data_check_string)
"""
import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

from fastapi import HTTPException, status
from pydantic import BaseModel

from app.core.config import settings

INIT_DATA_MAX_AGE_SECONDS = 300  # защита от replay: initData считаем валидным 5 минут


class TelegramUser(BaseModel):
    id: int
    username: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    photo_url: str | None = None


def verify_telegram_init_data(init_data: str) -> TelegramUser:
    try:
        parsed = dict(parse_qsl(init_data, strict_parsing=True))
    except ValueError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Malformed initData")
    received_hash = parsed.pop("hash", None)
    if not received_hash:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing hash in initData")

    auth_date = parsed.get("auth_date")
    if not auth_date or time.time() - int(auth_date) > INIT_DATA_MAX_AGE_SECONDS:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "initData expired")

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))

    secret_key = hmac.new(
        key=b"WebAppData",
        msg=settings.telegram_bot_token.encode(),
        digestmod=hashlib.sha256,
    ).digest()
    computed_hash = hmac.new(
        key=secret_key,
        msg=data_check_string.encode(),
        digestmod=hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid initData signature")

    user_raw = parsed.get("user")
    if not user_raw:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "initData missing user")

    user_json = json.loads(user_raw)
    return TelegramUser(
        id=user_json["id"],
        username=user_json.get("username"),
        first_name=user_json.get("first_name"),
        last_name=user_json.get("last_name"),
        photo_url=user_json.get("photo_url"),
    )
