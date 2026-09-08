"""
Внутренний эндпоинт для periodic-обновления курсов валют.

Не завязан на конкретный планировщик: дёргается внешним cron'ом (Fly.io
Machines cron, Railway cron, GitHub Actions schedule, Supabase pg_cron с
http-расширением — что уже есть в инфраструктуре). Раз в час более чем
достаточно для фиатных курсов.
"""
import hmac

from fastapi import APIRouter, Header, HTTPException, status

from app.core.config import settings
from app.services.fx_rates import refresh_fx_rates

router = APIRouter(prefix="/internal/fx", tags=["internal"])


@router.post("/refresh", status_code=status.HTTP_204_NO_CONTENT)
async def refresh(x_internal_secret: str = Header(default="")):
    if not hmac.compare_digest(x_internal_secret, settings.internal_cron_secret):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED)

    refresh_fx_rates()
