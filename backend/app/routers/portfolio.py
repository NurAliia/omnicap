"""
Отдаёт портфель фронтенду уже расшифрованным и с расчётом доходности.

Почему не напрямую через supabase-js + RLS: quantity/avg_purchase_price
хранятся зашифрованными (см. security/crypto.py), а DEK пользователя есть
только у бэкенда. Прямой клиентский select вернул бы bytea-мусор.
"""
from fastapi import APIRouter, Depends, Query

from app.security.crypto import decrypt_field, unwrap_dek
from app.security.deps import CurrentUser, get_current_user
from app.services.fx_rates import FxConversionError, convert, get_rates_snapshot
from app.services.supabase_client import get_service_client

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


def _load_assets(sb, user_id: str) -> list[dict]:
    user_row = sb.table("users").select("encrypted_dek").eq("id", user_id).single().execute()
    dek = unwrap_dek(bytes.fromhex(user_row.data["encrypted_dek"]))

    assets = sb.table("assets").select("*").eq("user_id", user_id).execute()

    tickers = [a["ticker"] for a in assets.data]
    prices: dict[str, dict] = {}
    if tickers:
        price_rows = (
            sb.table("price_cache").select("ticker,price,currency").in_("ticker", tickers).execute()
        )
        prices = {p["ticker"]: p for p in price_rows.data}

    result = []
    for a in assets.data:
        qty = float(decrypt_field(dek, bytes.fromhex(a["quantity_enc"])))
        avg_price = float(decrypt_field(dek, bytes.fromhex(a["avg_purchase_price_enc"])))
        current_price = prices.get(a["ticker"], {}).get("price")

        cost_basis = qty * avg_price
        market_value = qty * current_price if current_price is not None else None
        pnl = (market_value - cost_basis) if market_value is not None else None
        pnl_pct = (pnl / cost_basis * 100) if pnl is not None and cost_basis else None

        result.append({
            "id": a["id"],
            "ticker": a["ticker"],
            "asset_type": a["asset_type"],
            "currency": a["currency"],
            "quantity": qty,
            "avg_purchase_price": avg_price,
            "current_price": current_price,
            "market_value": market_value,
            "cost_basis": cost_basis,
            "unrealized_pnl": pnl,
            "unrealized_pnl_pct": pnl_pct,
        })

    return result


@router.get("/assets")
async def list_assets(user: CurrentUser = Depends(get_current_user)):
    sb = get_service_client()
    return _load_assets(sb, user.id)


@router.get("/summary")
async def portfolio_summary(
    base_currency: str | None = Query(default=None, description="ISO-код валюты, по умолчанию — предпочтение пользователя"),
    user: CurrentUser = Depends(get_current_user),
):
    sb = get_service_client()

    if base_currency is None:
        user_row = sb.table("users").select("base_currency").eq("id", user.id).single().execute()
        base_currency = user_row.data["base_currency"]
    base_currency = base_currency.upper()

    assets = _load_assets(sb, user.id)
    rates, is_stale = get_rates_snapshot()

    total_value = 0.0
    total_cost = 0.0
    skipped_tickers: list[str] = []

    for a in assets:
        if a["market_value"] is None:
            continue
        try:
            total_value += convert(a["market_value"], a["currency"], base_currency, rates)
            total_cost += convert(a["cost_basis"], a["currency"], base_currency, rates)
        except FxConversionError:
            # Нет курса для валюты актива (напр. неизвестная крипта) — не
            # рушим всю сводку, честно исключаем актив и сообщаем об этом.
            skipped_tickers.append(a["ticker"])

    total_pnl = total_value - total_cost
    total_pnl_pct = (total_pnl / total_cost * 100) if total_cost else None

    return {
        "base_currency": base_currency,
        "total_market_value": total_value,
        "total_cost_basis": total_cost,
        "total_unrealized_pnl": total_pnl,
        "total_unrealized_pnl_pct": total_pnl_pct,
        "rates_stale": is_stale,
        "skipped_tickers": skipped_tickers,
    }
