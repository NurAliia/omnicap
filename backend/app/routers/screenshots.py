"""
Пайплайн: скриншот -> Storage (временно) -> Claude Vision -> asset/transaction -> удаление файла.

Важно для privacy: storage-объект удаляется сразу после обработки, независимо
от результата (успех/фейл). screenshot_jobs.storage_path обнуляется в том же
запросе, чтобы в БД не оставалось ссылки на несуществующий файл. Дополнительно
есть страховочная periodic-задача (cleanup_stale_jobs), которая чистит job'ы
старше `purge_after` на случай падения воркера между шагами.
"""
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, UploadFile, status

from app.core.config import settings
from app.security.crypto import decrypt_field, encrypt_field, from_pg_bytea, to_pg_bytea, unwrap_dek
from app.security.deps import CurrentUser, get_current_user
from app.services.claude_vision import ExtractionError, extract_trade_from_screenshot
from app.services.supabase_client import get_service_client

router = APIRouter(prefix="/screenshots", tags=["screenshots"])

ALLOWED_MEDIA_TYPES = {"image/png", "image/jpeg", "image/webp"}
BUCKET = "screenshots"


@router.post("/upload", status_code=status.HTTP_202_ACCEPTED)
async def upload_screenshot(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    broker_account_id: str | None = Form(default=None),
    user: CurrentUser = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_MEDIA_TYPES:
        raise HTTPException(400, f"Unsupported media type: {file.content_type}")

    sb = get_service_client()

    if broker_account_id is not None:
        owned = (
            sb.table("broker_accounts")
            .select("id")
            .eq("id", broker_account_id)
            .eq("user_id", user.id)
            .maybe_single()
            .execute()
        )
        if not owned or not owned.data:
            raise HTTPException(404, "Broker account not found")

    content = await file.read()
    if len(content) > settings.max_screenshot_size_mb * 1024 * 1024:
        raise HTTPException(400, "Screenshot too large")

    storage_path = f"{user.id}/{uuid.uuid4()}"
    sb.storage.from_(BUCKET).upload(
        storage_path, content, {"content-type": file.content_type}
    )

    job = (
        sb.table("screenshot_jobs")
        .insert({
            "user_id": user.id,
            "status": "pending",
            "storage_path": storage_path,
            "broker_account_id": broker_account_id,
        })
        .execute()
    )
    job_id = job.data[0]["id"]

    background_tasks.add_task(
        process_screenshot_job, job_id, user.id, storage_path, file.content_type, broker_account_id
    )
    return {"job_id": job_id, "status": "pending"}


@router.get("/{job_id}")
async def get_screenshot_job(job_id: str, user: CurrentUser = Depends(get_current_user)):
    sb = get_service_client()
    result = (
        sb.table("screenshot_jobs")
        .select("id,status,extracted_json,error_message,created_at,processed_at")
        .eq("id", job_id)
        .eq("user_id", user.id)
        .maybe_single()
        .execute()
    )
    # maybe_single() возвращает None (не объект с data=None), если строка не найдена
    if not result or not result.data:
        raise HTTPException(404, "Job not found")
    return result.data


def process_screenshot_job(
    job_id: str,
    user_id: str,
    storage_path: str,
    media_type: str,
    broker_account_id: str | None = None,
) -> None:
    """
    Выполняется в BackgroundTasks (для прод-нагрузки — вынести в Celery/RQ worker,
    сигнатура не меняется). Гарантирует удаление файла из Storage в finally.
    """
    sb = get_service_client()
    sb.table("screenshot_jobs").update({"status": "processing"}).eq("id", job_id).execute()

    try:
        image_bytes = sb.storage.from_(BUCKET).download(storage_path)
        trade = extract_trade_from_screenshot(image_bytes, media_type)
        _save_trade_as_asset(sb, user_id, job_id, trade, broker_account_id, source="ai_screenshot")

        sb.table("screenshot_jobs").update({
            "status": "done",
            "extracted_json": trade.model_dump(),
            "storage_path": None,
            "processed_at": "now()",
        }).eq("id", job_id).execute()

    except ExtractionError as exc:
        sb.table("screenshot_jobs").update({
            "status": "failed",
            "error_message": str(exc),
            "storage_path": None,
            "processed_at": "now()",
        }).eq("id", job_id).execute()

    finally:
        # Файл удаляется в любом случае — даже если extraction упал на этапе
        # уже после успешного download, картинка не должна пережить обработку.
        sb.storage.from_(BUCKET).remove([storage_path])


def _save_trade_as_asset(
    sb, user_id: str, job_id: str | None, trade, broker_account_id: str | None, source: str
) -> None:
    user_row = sb.table("users").select("encrypted_dek").eq("id", user_id).single().execute()
    dek = unwrap_dek(from_pg_bytea(user_row.data["encrypted_dek"]))

    existing_query = (
        sb.table("assets")
        .select("id")
        .eq("user_id", user_id)
        .eq("ticker", trade.ticker)
    )
    if broker_account_id is None:
        existing_query = existing_query.is_("broker_account_id", "null")
    else:
        existing_query = existing_query.eq("broker_account_id", broker_account_id)
    existing = existing_query.maybe_single().execute()

    if existing and existing.data:
        asset_id = existing.data["id"]
    else:
        inserted = sb.table("assets").insert({
            "user_id": user_id,
            "broker_account_id": broker_account_id,
            "ticker": trade.ticker,
            "asset_type": trade.asset_type,
            "currency": trade.currency,
            "quantity_enc": to_pg_bytea(encrypt_field(dek, "0")),
            "avg_purchase_price_enc": to_pg_bytea(encrypt_field(dek, "0")),
        }).execute()
        asset_id = inserted.data[0]["id"]

    sb.table("transactions").insert({
        "user_id": user_id,
        "asset_id": asset_id,
        "tx_type": "buy",
        "quantity_enc": to_pg_bytea(encrypt_field(dek, str(trade.quantity))),
        "price_enc": to_pg_bytea(encrypt_field(dek, str(trade.price))),
        "tx_date": trade.date or "now()",
        "source": source,
        "screenshot_job_id": job_id,
    }).execute()

    _recompute_asset_position(sb, dek, user_id, asset_id)


def _recompute_asset_position(sb, dek: bytes, user_id: str, asset_id: str) -> None:
    """Пересчитывает quantity/avg_price по всей истории transactions для asset_id."""
    txs = (
        sb.table("transactions")
        .select("tx_type,quantity_enc,price_enc")
        .eq("asset_id", asset_id)
        .execute()
    )

    total_qty, total_cost = 0.0, 0.0
    for tx in txs.data:
        qty = float(decrypt_field(dek, from_pg_bytea(tx["quantity_enc"])))
        price = float(decrypt_field(dek, from_pg_bytea(tx["price_enc"])))
        if tx["tx_type"] == "buy":
            total_cost += qty * price
            total_qty += qty
        elif tx["tx_type"] == "sell":
            total_cost -= qty * (total_cost / total_qty if total_qty else 0)
            total_qty -= qty

    avg_price = (total_cost / total_qty) if total_qty > 0 else 0.0

    sb.table("assets").update({
        "quantity_enc": to_pg_bytea(encrypt_field(dek, str(total_qty))),
        "avg_purchase_price_enc": to_pg_bytea(encrypt_field(dek, str(avg_price))),
    }).eq("id", asset_id).execute()
