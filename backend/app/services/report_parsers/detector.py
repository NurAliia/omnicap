"""Автоматическое определение типа брокерского отчета по содержимому файла."""
import io
from typing import Literal

import openpyxl

ReportType = Literal[
    "ib_activity_csv",
    "ib_activity_xml",
    "bybit_csv",
    "tbc_capital_xlsx",
    "galt_taggart_xlsx",
    "freedom_finance_xlsx",
]


def detect_report_type(file_bytes: bytes, filename: str = "") -> ReportType | None:
    """
    Определяет тип отчета по содержимому и расширению файла.

    Args:
        file_bytes: содержимое файла
        filename: имя файла (опционально, для подсказки по расширению)

    Returns:
        Тип отчета или None если не удалось определить
    """
    file_ext = filename.split(".")[-1].lower() if "." in filename else ""

    # XML - проверяем сначала, т.к. это текст
    if file_ext == "xml" or file_bytes.startswith(b"<?xml"):
        return _detect_xml(file_bytes)

    # CSV - пробуем декодировать как текст
    if file_ext in ("csv", "txt", "") or _looks_like_text(file_bytes):
        detected = _detect_csv(file_bytes)
        if detected:
            return detected

    # Excel - бинарный формат
    if file_ext in ("xlsx", "xls"):
        return _detect_excel(file_bytes)

    return None


def _looks_like_text(file_bytes: bytes) -> bool:
    """Проверяет, является ли файл текстовым (CSV/TXT)."""
    try:
        # Пробуем декодировать первые 1KB
        file_bytes[:1024].decode("utf-8")
        return True
    except UnicodeDecodeError:
        try:
            file_bytes[:1024].decode("windows-1251")
            return True
        except UnicodeDecodeError:
            return False


def _detect_csv(file_bytes: bytes) -> ReportType | None:
    """Определяет тип CSV отчета по заголовкам."""
    try:
        # Пробуем UTF-8, потом Windows-1251 (для российских брокеров)
        try:
            content = file_bytes.decode("utf-8-sig")  # -sig убирает BOM
        except UnicodeDecodeError:
            content = file_bytes.decode("windows-1251")

        # Берем первые 5 строк для анализа
        lines = content.split("\n")[:5]
        header = "\n".join(lines).lower()

        # Interactive Brokers: уникальная структура с "Trades,Header,DataDiscriminator"
        if "trades,header,datadiscriminator" in header or "trades,data," in header:
            return "ib_activity_csv"

        # Bybit: заголовки "Time,Symbol,Side,Price,Quantity,Fee"
        if "time,symbol,side,price,quantity" in header.replace(" ", ""):
            return "bybit_csv"

        # TBC Capital: нужны примеры для сигнатуры
        # Возможные варианты: "TBC Capital", "თიბისი კაპიტალი"
        if "tbc capital" in header or "თიბისი" in header:
            return "tbc_capital_xlsx"  # возможно CSV тоже

        # Freedom Finance: обычно "Номер счета", "Дата сделки", "Тикер"
        if "freedom" in header or ("дата сделки" in header and "тикер" in header):
            return "freedom_finance_xlsx"

    except Exception:
        pass

    return None


def _detect_excel(file_bytes: bytes) -> ReportType | None:
    """Определяет тип Excel отчета по структуре листов и содержимому."""
    try:
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True)
        sheet = wb.active

        # Читаем первые 10 строк первого листа
        rows = list(sheet.iter_rows(min_row=1, max_row=10, values_only=True))
        if not rows:
            return None

        # Объединяем в текст для поиска сигнатур
        text = "\n".join(
            " ".join(str(cell or "") for cell in row) for row in rows
        ).lower()

        # TBC Capital: поиск специфичных меток
        if "tbc" in text or "თიბისი" in text or "capital" in text:
            return "tbc_capital_xlsx"

        # Galt and Taggart: поиск названия компании
        if "galt" in text or "taggart" in text or "გალტი" in text:
            return "galt_taggart_xlsx"

        # Freedom Finance: поиск названий колонок
        if "freedom" in text or "номер счета" in text:
            return "freedom_finance_xlsx"

        # Interactive Brokers тоже может быть в Excel (редко)
        if "interactive brokers" in text or "ibkr" in text:
            return "ib_activity_csv"  # парсер может поддерживать и Excel

    except Exception:
        pass

    return None


def _detect_xml(file_bytes: bytes) -> ReportType | None:
    """Определяет тип XML отчета."""
    try:
        content = file_bytes.decode("utf-8").lower()

        # Interactive Brokers FlexQuery XML
        if "flexquerysresponse" in content or "flexstatement" in content:
            return "ib_activity_xml"

    except Exception:
        pass

    return None


# Человекочитаемые названия для UI feedback
REPORT_TYPE_LABELS = {
    "ib_activity_csv": "Interactive Brokers (CSV)",
    "ib_activity_xml": "Interactive Brokers (XML)",
    "bybit_csv": "Bybit",
    "tbc_capital_xlsx": "TBC Capital",
    "galt_taggart_xlsx": "Galt and Taggart",
    "freedom_finance_xlsx": "Freedom Finance",
}
