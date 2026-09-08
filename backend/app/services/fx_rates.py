"""
Курсы валют для агрегации мультивалютного портфеля в одну сумму.

Источник — frankfurter.app (ЕЦБ, без ключа API, только фиатные валюты).
Курсы кэшируются в public.fx_rates и обновляются периодической задачей
(refresh_fx_rates, см. routers/fx.py) — конвертация всегда читает из кэша,
а не бьёт во внешний API на каждый запрос портфеля.

Крипто-активы (currency='USDT' и т.п.) не покрываются ЕЦБ: приравниваем
стейблкоины к USD напрямую, остальное крипто — заглушка на будущее
(понадобится отдельный источник вроде CoinGecko).
"""
import httpx

from app.services.supabase_client import get_service_client

FX_API_URL = "https://api.frankfurter.app/latest?from=USD"
STABLECOIN_TO_USD = {"USDT", "USDC", "DAI"}
STALE_AFTER_HOURS = 24


class FxConversionError(Exception):
    pass


def refresh_fx_rates() -> None:
    """Тянет свежие курсы и перезаписывает public.fx_rates. Вызывается periodic job'ом."""
    response = httpx.get(FX_API_URL, timeout=10)
    response.raise_for_status()
    rates = response.json()["rates"]  # {"EUR": 0.92, "RUB": 91.3, ...}

    sb = get_service_client()
    rows = [{"currency": "USD", "rate_to_usd": 1}] + [
        {"currency": code, "rate_to_usd": rate} for code, rate in rates.items()
    ]
    sb.table("fx_rates").upsert(rows, on_conflict="currency").execute()


def get_rates_snapshot() -> tuple[dict[str, float], bool]:
    """Возвращает {currency: rate_to_usd} и флаг staleness (курсы старше STALE_AFTER_HOURS)."""
    sb = get_service_client()
    rows = sb.table("fx_rates").select("currency,rate_to_usd,updated_at").execute().data

    rates = {r["currency"]: float(r["rate_to_usd"]) for r in rows}
    for stablecoin in STABLECOIN_TO_USD:
        rates.setdefault(stablecoin, 1.0)

    oldest_update = min((r["updated_at"] for r in rows), default=None)
    is_stale = oldest_update is None or _hours_since(oldest_update) > STALE_AFTER_HOURS
    return rates, is_stale


def convert(amount: float, from_currency: str, to_currency: str, rates: dict[str, float]) -> float:
    if from_currency == to_currency:
        return amount

    from_rate = rates.get(from_currency)
    to_rate = rates.get(to_currency)
    if from_rate is None or to_rate is None:
        raise FxConversionError(f"Нет курса для {from_currency} -> {to_currency}")

    usd_amount = amount / from_rate
    return usd_amount * to_rate


def _hours_since(iso_timestamp: str) -> float:
    from datetime import datetime, timezone

    updated_at = datetime.fromisoformat(iso_timestamp.replace("Z", "+00:00"))
    return (datetime.now(timezone.utc) - updated_at).total_seconds() / 3600
