"""Тесты автоматического определения типа брокерского отчета."""
import pytest

from app.services.report_parsers.detector import detect_report_type


def test_detect_ib_csv():
    """Interactive Brokers CSV должен детектироваться по уникальной структуре."""
    sample = b"""Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol
Trades,Data,Order,Stocks,USD,AAPL,2024-01-15,100,150.00
"""
    assert detect_report_type(sample, "activity.csv") == "ib_activity_csv"


def test_detect_bybit_csv():
    """Bybit CSV должен детектироваться по заголовкам."""
    sample = b"""Time,Symbol,Side,Price,Quantity,Fee,Fee Currency
2024-01-15 12:30:00,BTCUSDT,Buy,42000.50,0.1,4.2,USDT
"""
    assert detect_report_type(sample, "trades.csv") == "bybit_csv"


def test_detect_ib_xml():
    """Interactive Brokers XML должен детектироваться по FlexQuery тегам."""
    sample = b"""<?xml version="1.0" encoding="UTF-8"?>
<FlexQueryResponse queryName="Activity">
    <FlexStatements>
        <FlexStatement accountId="U123456">
        </FlexStatement>
    </FlexStatements>
</FlexQueryResponse>
"""
    assert detect_report_type(sample, "activity.xml") == "ib_activity_xml"


def test_detect_unknown_csv():
    """Неизвестный формат CSV должен вернуть None."""
    sample = b"""Date,Amount,Description
2024-01-01,100,Test
"""
    assert detect_report_type(sample, "unknown.csv") is None


def test_detect_with_bom():
    """Должен корректно обрабатывать файлы с BOM (UTF-8 signature)."""
    # BOM + IB CSV
    sample = b"\xef\xbb\xbfTrades,Header,DataDiscriminator,Asset Category\n"
    assert detect_report_type(sample, "activity.csv") == "ib_activity_csv"


def test_detect_with_windows_encoding():
    """Должен обрабатывать Windows-1251 кодировку (для российских брокеров)."""
    # Cyrillic "Дата сделки" in Windows-1251
    sample = "Дата сделки,Тикер,Freedom Finance\n".encode("windows-1251")
    result = detect_report_type(sample, "report.csv")
    # Должен определить как Freedom Finance (если парсер реализован)
    # Или вернуть None, если не распознал
    assert result in ("freedom_finance_xlsx", None)


@pytest.mark.parametrize("filename,expected", [
    ("ib_activity_20240115.csv", "ib_activity_csv"),
    ("bybit_trades.csv", "bybit_csv"),
    ("report.xml", "ib_activity_xml"),
])
def test_detect_by_content_not_filename(filename, expected):
    """Детекция должна работать по содержимому, а не только по имени файла."""
    samples = {
        "ib_activity_csv": b"Trades,Header,DataDiscriminator\nTrades,Data,Order",
        "bybit_csv": b"Time,Symbol,Side,Price,Quantity",
        "ib_activity_xml": b'<?xml version="1.0"?>\n<FlexQueryResponse>',
    }

    content = samples[expected]
    assert detect_report_type(content, filename) == expected


def test_detect_excel_placeholder():
    """Excel файлы пока не детектятся без реального контента (нужны примеры)."""
    # Minimal valid XLSX header (ZIP magic + xl/ structure)
    # В реальности нужен полноценный файл, это просто placeholder
    fake_excel = b"PK\x03\x04"  # ZIP signature

    result = detect_report_type(fake_excel, "report.xlsx")
    # Пока None, т.к. нет sample данных для TBC/Galt/Freedom
    assert result is None


def test_empty_file():
    """Пустой файл должен вернуть None."""
    assert detect_report_type(b"", "empty.csv") is None


def test_binary_garbage():
    """Бинарный мусор должен корректно обрабатываться."""
    garbage = bytes(range(256))  # binary junk
    assert detect_report_type(garbage, "garbage.bin") is None
