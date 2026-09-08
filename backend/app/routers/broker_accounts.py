"""
Портфели/брокерские счета пользователя (напр. "Interactive Brokers", "Bybit").

Нужны фронтенду, чтобы перед загрузкой скриншота дать выбрать существующий
счёт или завести новый — так группировка активов по брокеру сохраняется в
assets.broker_account_id (см. routers/screenshots.py).
"""
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field

from app.security.deps import CurrentUser, get_current_user
from app.services.supabase_client import get_service_client

router = APIRouter(prefix="/broker-accounts", tags=["broker-accounts"])


class BrokerAccountCreate(BaseModel):
    broker_name: str = Field(min_length=1, max_length=100)


@router.get("")
async def list_broker_accounts(user: CurrentUser = Depends(get_current_user)):
    sb = get_service_client()
    result = (
        sb.table("broker_accounts")
        .select("id,broker_name,base_currency,created_at")
        .eq("user_id", user.id)
        .order("created_at")
        .execute()
    )
    return result.data


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_broker_account(
    payload: BrokerAccountCreate,
    user: CurrentUser = Depends(get_current_user),
):
    sb = get_service_client()
    inserted = (
        sb.table("broker_accounts")
        .insert({"user_id": user.id, "broker_name": payload.broker_name.strip()})
        .execute()
    )
    return inserted.data[0]
