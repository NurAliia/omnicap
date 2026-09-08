from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.security.crypto import generate_wrapped_dek
from app.security.supabase_jwt import mint_access_token
from app.security.telegram_auth import verify_telegram_init_data
from app.services.supabase_client import get_service_client

router = APIRouter(prefix="/auth", tags=["auth"])


class TelegramLoginRequest(BaseModel):
    init_data: str


class TelegramLoginResponse(BaseModel):
    access_token: str
    user_id: str


@router.post("/telegram", response_model=TelegramLoginResponse)
async def login_with_telegram(body: TelegramLoginRequest):
    tg_user = verify_telegram_init_data(body.init_data)
    sb = get_service_client()

    existing = (
        sb.table("users")
        .select("id")
        .eq("telegram_id", tg_user.id)
        .maybe_single()
        .execute()
    )
    # supabase-py возвращает None (не объект с data=None), когда maybe_single
    # не находит ни одной строки — обнаружено вживую при первом реальном логине.
    if existing and existing.data:
        user_id = existing.data["id"]
        sb.table("users").update({
            "telegram_username": tg_user.username,
            "first_name": tg_user.first_name,
            "last_name": tg_user.last_name,
            "photo_url": tg_user.photo_url,
        }).eq("id", user_id).execute()
    else:
        inserted = (
            sb.table("users")
            .insert({
                "telegram_id": tg_user.id,
                "telegram_username": tg_user.username,
                "first_name": tg_user.first_name,
                "last_name": tg_user.last_name,
                "photo_url": tg_user.photo_url,
                "encrypted_dek": generate_wrapped_dek().hex(),
            })
            .execute()
        )
        user_id = inserted.data[0]["id"]

    token = mint_access_token(user_id=user_id, telegram_id=tg_user.id)
    return TelegramLoginResponse(access_token=token, user_id=user_id)
