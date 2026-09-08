"""
Массовый импорт сделок из брокерских отчетов (CSV/XLSX/XML).

Пайплайн: отчет -> Storage (временно) -> парсинг -> mass-insert assets/transactions -> удаление.
Аналогично screenshots.py, но одна загрузка = много сделок.
"""
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status

from app.core.config import settings
from app.security.crypto import decrypt_field, encrypt_field, from_pg_bytea, to_pg_bytea, unwrap_dek
from app.security.deps import CurrentUser, get_current_user
from app.services.report_parsers import ParsedTrade, get_parser
from app.services.report_parsers.detector import REPORT_TYPE_LABELS, detect_report_type
from app.services.supabase_client import get_service_client

router = APIRouter(prefix="/reports", tags=["reports"])

ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls", ".xml"}
BUCKET = "reports"  # отдельный bucket для отчетов (или переиспользовать screenshots?)


@router.post("/upload", status_code=status.HTTP_202_ACCEPTED)
async def upload_broker_report(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    broker_account_id: str = Form(...),
    user: CurrentUser = Depends(get_current_user),
):
    """
    Загрузка брокерского отчета для массового импорта сделок.
    Тип отчета определяется автоматически по содержимому файла.

    Args:
        file: CSV/XLSX/XML файл отчета
        broker_account_id: ID брокерского счета (обязательно для группировки)
    """
    # Проверяем расширение файла
    filename = file.filename or ""
    file_ext = "." + filename.split(".")[-1].lower() if "." in filename else ""
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file extension: {file_ext}")

    sb = get_service_client()

    # Проверяем владение broker_account
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
    max_size = 50 * 1024 * 1024  # 50MB для отчетов (больше чем скриншоты)
    if len(content) > max_size:
        raise HTTPException(400, f"Report file too large (max {max_size // 1024 // 1024}MB)")

    # 🔍 Автоматическое определение типа отчета
    report_type = detect_report_type(content, filename)
    if not report_type:
        raise HTTPException(
            400,
            "Could not detect report type. Supported brokers: "
            "Interactive Brokers, Bybit, TBC Capital, Galt and Taggart, Freedom Finance"
        )

    # Загружаем в Storage
    storage_path = f"{user.id}/{uuid.uuid4()}{file_ext}"
    sb.storage.from_(BUCKET).upload(storage_path, content)

    # Создаем job
    job = (
        sb.table("report_jobs")
        .insert({
            "user_id": user.id,
            "broker_account_id": broker_account_id,
            "report_type": report_type,
            "status": "pending",
            "storage_path": storage_path,
        })
        .execute()
    )
    job_id = job.data[0]["id"]

    # Запускаем обработку в фоне
    background_tasks.add_task(process_report_job, job_id, user.id, storage_path, report_type, broker_account_id)

    detected_label = REPORT_TYPE_LABELS.get(report_type, report_type)
    return {"job_id": job_id, "status": "pending", "detected_broker": detected_label}


@router.get("/{job_id}")
async def get_report_job(job_id: str, user: CurrentUser = Depends(get_current_user)):
    """Получить статус обработки отчета."""
    sb = get_service_client()
    result = (
        sb.table("report_jobs")
        .select(
            "id,status,report_type,parsed_trades_count,imported_assets_count,"
            "imported_transactions_count,error_message,parsing_warnings,created_at,processed_at"
        )
        .eq("id", job_id)
        .eq("user_id", user.id)
        .maybe_single()
        .execute()
    )

    if not result or not result.data:
        raise HTTPException(404, "Report job not found")

    return result.data


def process_report_job(
    job_id: str,
    user_id: str,
    storage_path: str,
    report_type: str,
    broker_account_id: str,
) -> None:
    """
    Фоновая обработка отчета: парсинг + массовый импорт в assets/transactions.
    Гарантирует удаление файла из Storage в finally.
    """
    sb = get_service_client()
    sb.table("report_jobs").update({"status": "processing"}).eq("id", job_id).execute()

    try:
        # Скачиваем и парсим отчет
        file_bytes = sb.storage.from_(BUCKET).download(storage_path)
        parser = get_parser(report_type)
        trades, warnings = parser.parse(file_bytes)

        # Массово сохраняем сделки
        imported_assets, imported_txs = _import_trades_bulk(
            sb, user_id, broker_account_id, trades, job_id
        )

        # Успешная обработка
        sb.table("report_jobs").update({
            "status": "done",
            "parsed_trades_count": len(trades),
            "imported_assets_count": imported_assets,
            "imported_transactions_count": imported_txs,
            "parsing_warnings": [w.model_dump() for w in warnings],
            "storage_path": None,
            "processed_at": "now()",
        }).eq("id", job_id).execute()

    except Exception as exc:
        sb.table("report_jobs").update({
            "status": "failed",
            "error_message": str(exc),
            "storage_path": None,
            "processed_at": "now()",
        }).eq("id", job_id).execute()

    finally:
        # Удаляем файл отчета из Storage (privacy)
        sb.storage.from_(BUCKET).remove([storage_path])


def _import_trades_bulk(
    sb, user_id: str, broker_account_id: str, trades: list[ParsedTrade], job_id: str
) -> tuple[int, int]:
    """
    Массовый импорт сделок из отчета.

    Returns:
        (imported_assets_count, imported_transactions_count)
    """
    if not trades:
        return 0, 0

    # Получаем DEK для шифрования
    user_row = sb.table("users").select("encrypted_dek").eq("id", user_id).single().execute()
    dek = unwrap_dek(from_pg_bytea(user_row.data["encrypted_dek"]))

    # Группируем сделки по тикеру (для оптимизации создания assets)
    from collections import defaultdict
    trades_by_ticker: dict[str, list[ParsedTrade]] = defaultdict(list)
    for trade in trades:
        trades_by_ticker[trade.ticker].append(trade)

    imported_assets = 0
    imported_txs = 0

    for ticker, ticker_trades in trades_by_ticker.items():
        # Находим или создаем asset
        existing = (
            sb.table("assets")
            .select("id")
            .eq("user_id", user_id)
            .eq("broker_account_id", broker_account_id)
            .eq("ticker", ticker)
            .maybe_single()
            .execute()
        )

        if existing and existing.data:
            asset_id = existing.data["id"]
        else:
            # Создаем новый asset (берем тип из первой сделки)
            first_trade = ticker_trades[0]
            inserted = sb.table("assets").insert({
                "user_id": user_id,
                "broker_account_id": broker_account_id,
                "ticker": ticker,
                "asset_type": first_trade.asset_type,
                "currency": first_trade.currency,
                "quantity_enc": to_pg_bytea(encrypt_field(dek, "0")),
                "avg_purchase_price_enc": to_pg_bytea(encrypt_field(dek, "0")),
            }).execute()
            asset_id = inserted.data[0]["id"]
            imported_assets += 1

        # Вставляем все transactions для этого тикера
        tx_rows = []
        for trade in ticker_trades:
            tx_rows.append({
                "user_id": user_id,
                "asset_id": asset_id,
                "tx_type": trade.tx_type,
                "quantity_enc": to_pg_bytea(encrypt_field(dek, str(trade.quantity))),
                "price_enc": to_pg_bytea(encrypt_field(dek, str(trade.price))),
                "tx_date": trade.tx_date.isoformat(),
                "source": "broker_report",
                "report_job_id": job_id,
            })

        sb.table("transactions").insert(tx_rows).execute()
        imported_txs += len(tx_rows)

        # Пересчитываем позицию по asset
        _recompute_asset_position(sb, dek, user_id, asset_id)

    return imported_assets, imported_txs


def _recompute_asset_position(sb, dek: bytes, user_id: str, asset_id: str) -> None:
    """Пересчитывает quantity/avg_price по всей истории transactions для asset_id."""
    txs = (
        sb.table("transactions")
        .select("tx_type,quantity_enc,price_enc")
        .eq("asset_id", asset_id)
        .order("tx_date")
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
            if total_qty > 0:
                total_cost -= qty * (total_cost / total_qty)
            total_qty -= qty

    avg_price = (total_cost / total_qty) if total_qty > 0 else 0.0

    sb.table("assets").update({
        "quantity_enc": to_pg_bytea(encrypt_field(dek, str(total_qty))),
        "avg_purchase_price_enc": to_pg_bytea(encrypt_field(dek, str(avg_price))),
    }).eq("id", asset_id).execute()
