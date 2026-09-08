# How to Add a New Broker Parser

## Быстрый старт

### 1. Получи пример отчета
Попроси пользователя экспортировать отчет из брокера. Желательно:
- С несколькими сделками (5-10)
- С разными типами активов (акции, ETF, облигации)
- С комиссиями и налогами (если есть)

### 2. Создай файл парсера

`backend/app/services/report_parsers/my_broker.py`:

```python
"""Парсер MyBroker отчета."""
import csv
import io
from datetime import datetime

from .base import ParsedTrade, ParsingWarning, ReportParser


class MyBrokerParser(ReportParser):
    """
    Парсер MyBroker CSV/Excel отчета.
    
    Формат:
    - CSV с заголовками
    - Колонки: Date, Symbol, Quantity, Price, Currency, Type
    - Даты в формате DD/MM/YYYY
    """

    def parse(self, file_bytes: bytes) -> tuple[list[ParsedTrade], list[ParsingWarning]]:
        # Для CSV
        content = file_bytes.decode("utf-8")
        reader = csv.DictReader(io.StringIO(content))
        
        # Для Excel используй:
        # import openpyxl
        # wb = openpyxl.load_workbook(io.BytesIO(file_bytes))
        # sheet = wb.active
        # for row in sheet.iter_rows(min_row=2, values_only=True):
        
        trades: list[ParsedTrade] = []
        warnings: list[ParsingWarning] = []

        for line_num, row in enumerate(reader, start=2):
            try:
                trade = self._parse_row(row, line_num)
                if trade:
                    trades.append(trade)
            except Exception as exc:
                warnings.append(ParsingWarning(
                    line_number=line_num,
                    message=f"Failed to parse: {exc}",
                    raw_data=row
                ))

        if not trades:
            raise ValueError("No trades found in report")

        return trades, warnings

    def _parse_row(self, row: dict, line_num: int) -> ParsedTrade | None:
        """Парсит одну строку."""
        # Пропускаем пустые строки
        if not row.get("Symbol"):
            return None

        ticker = self.normalize_ticker(row["Symbol"])
        quantity = float(row["Quantity"])
        price = float(row["Price"])
        currency = row.get("Currency", "USD")
        
        # Парсинг даты с несколькими форматами
        date_str = row["Date"]
        tx_date = self.parse_date(date_str, ["%d/%m/%Y", "%Y-%m-%d"])

        # Определение типа сделки
        tx_type = "buy" if quantity > 0 else "sell"

        # Определение типа актива (если есть в отчете)
        asset_type_raw = row.get("AssetType", "").lower()
        asset_type_map = {
            "stock": "stock",
            "etf": "etf",
            "bond": "bond",
            "crypto": "crypto",
        }
        asset_type = asset_type_map.get(asset_type_raw, "other")

        return ParsedTrade(
            ticker=ticker,
            asset_type=asset_type,
            tx_type=tx_type,
            quantity=abs(quantity),
            price=abs(price),
            currency=currency,
            tx_date=tx_date,
            commission=float(row.get("Commission", 0)),
            raw_line_number=line_num,
            raw_data=row,
        )
```

### 3. Зарегистрируй парсер

`backend/app/services/report_parsers/__init__.py`:

```python
from .my_broker import MyBrokerParser

PARSER_REGISTRY = {
    # ... existing
    "my_broker_csv": MyBrokerParser,
}
```

### 4. Добавь в миграцию

`supabase/migrations/0006_report_jobs.sql`:

```sql
report_type text not null check (report_type in (
    -- ... existing
    'my_broker_csv'  -- добавь здесь
))
```

### 5. Обнови frontend

`frontend/components/ReportUploader.tsx`:

```typescript
const REPORT_TYPES = {
  // ... existing
  my_broker_csv: "My Broker (CSV)",
};
```

### 6. Напиши тест

`backend/tests/test_my_broker_parser.py`:

```python
from app.services.report_parsers.my_broker import MyBrokerParser

def test_parse_sample():
    sample_csv = b"""Date,Symbol,Quantity,Price,Currency,AssetType
01/01/2024,AAPL,10,150.00,USD,Stock
02/01/2024,BTC,0.5,40000.00,USD,Crypto
"""
    
    parser = MyBrokerParser()
    trades, warnings = parser.parse(sample_csv)
    
    assert len(trades) == 2
    assert trades[0].ticker == "AAPL"
    assert trades[0].quantity == 10
    assert trades[0].price == 150.00
```

## Общие паттерны

### Excel с несколькими листами

```python
import openpyxl

wb = openpyxl.load_workbook(io.BytesIO(file_bytes))

# Если известно имя листа
sheet = wb["Trades"]

# Или первый лист
sheet = wb.active

# Пропустить заголовки (первые 3 строки)
for row in sheet.iter_rows(min_row=4, values_only=True):
    date, symbol, qty, price = row[0], row[1], row[2], row[3]
    # ...
```

### CSV с нестандартным разделителем

```python
reader = csv.DictReader(
    io.StringIO(content),
    delimiter=";",  # вместо запятой
    quotechar='"'
)
```

### Пропуск служебных строк

```python
# Если файл начинается с метаданных:
# Report Date: 2024-01-01
# Account: 12345
# --- Trades ---
# Date,Symbol,Quantity...

lines = content.split("\n")
# Найти строку с заголовками
header_idx = next(i for i, line in enumerate(lines) if "Date,Symbol" in line)
# Парсить с этой строки
reader = csv.DictReader(lines[header_idx:])
```

### Кодировка Windows (Cyrillic)

```python
try:
    content = file_bytes.decode("utf-8")
except UnicodeDecodeError:
    content = file_bytes.decode("windows-1251")  # для русских брокеров
```

### Сложные даты

```python
# "01 Jan 2024" -> date
formats = [
    "%d %b %Y",  # 01 Jan 2024
    "%d/%m/%Y",  # 01/01/2024
    "%Y-%m-%d",  # 2024-01-01
    "%d.%m.%Y",  # 01.01.2024 (EU/RU)
]
tx_date = self.parse_date(date_str, formats)
```

### Обработка дробных количеств

```python
# "1,234.56" -> 1234.56 (US)
# "1.234,56" -> 1234.56 (EU)

def parse_number(s: str) -> float:
    # Удалить разделители тысяч
    s = s.replace(" ", "").replace(",", ".")
    return float(s)
```

## Частые ошибки

### ❌ Забыли про заголовки

```python
# Wrong - пытается парсить header row
for row in sheet.iter_rows(values_only=True):
    trades.append(...)

# Right - пропускаем header
for row in sheet.iter_rows(min_row=2, values_only=True):
```

### ❌ Не обработали пустые ячейки

```python
# Wrong - упадет на None
quantity = float(row[2])

# Right
quantity = float(row[2] or 0)
```

### ❌ Не проверили encoding

```python
# Wrong - упадет на Cyrillic
content = file_bytes.decode("utf-8")

# Right
try:
    content = file_bytes.decode("utf-8")
except UnicodeDecodeError:
    content = file_bytes.decode("windows-1251")
```

## Debugging

### Логировать проблемные строки

```python
except Exception as exc:
    print(f"Failed to parse row {line_num}: {row}")  # temporary
    warnings.append(ParsingWarning(...))
```

### Сохранить raw_data для анализа

```python
ParsedTrade(
    # ...
    raw_line_number=line_num,
    raw_data=row,  # сохраняем исходную строку
)
```

### Проверить через curl

```bash
curl -X POST http://localhost:8000/reports/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@sample.csv" \
  -F "broker_account_id=$BROKER_ID" \
  -F "report_type=my_broker_csv" \
  -v
```

## Checklist перед релизом

- [ ] Парсер обрабатывает все типы активов из отчета
- [ ] Даты корректно парсятся (проверить timezone)
- [ ] Комиссии и налоги извлекаются (если есть)
- [ ] Warnings для пропущенных строк
- [ ] Тест с реальным sample файлом
- [ ] Обновлены все 3 места: parser, registry, migration
- [ ] Обновлен frontend REPORT_TYPES
- [ ] Добавлен раздел в README_REPORTS.md
