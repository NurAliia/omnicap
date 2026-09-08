# Test Data Samples

Примеры файлов для тестирования парсеров брокерских отчетов.

## 📁 Файлы

### ✅ Interactive Brokers
- **sample_ib_activity.csv** - Activity Statement (CSV)
  - 4 сделки: 3 buy (AAPL, MSFT, SPY), 1 sell (GOOGL)
  - Asset types: Stocks, ETFs
  - С комиссиями

### ✅ Bybit
- **sample_bybit_trades.csv** - Trade History
  - 4 сделки: 3 buy (BTC, ETH, SOL), 1 sell (BTC)
  - Криптопары в USDT
  - С комиссиями в USDT

## 🧪 Как тестировать

### Через API (curl)

```bash
# 1. Получить auth token
TOKEN="your_jwt_token_here"
BROKER_ACCOUNT_ID="your_broker_account_uuid"

# 2. Загрузить IB отчет
curl -X POST http://localhost:8000/reports/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test_data/sample_ib_activity.csv" \
  -F "broker_account_id=$BROKER_ACCOUNT_ID" \
  -F "report_type=ib_activity_csv"

# Ответ: {"job_id": "uuid", "status": "pending"}

# 3. Проверить статус
JOB_ID="uuid_from_step_2"
curl http://localhost:8000/reports/$JOB_ID \
  -H "Authorization: Bearer $TOKEN"

# Ответ после обработки:
# {
#   "status": "done",
#   "parsed_trades_count": 4,
#   "imported_assets_count": 4,
#   "imported_transactions_count": 4,
#   ...
# }
```

### Через UI

1. Открой приложение в Telegram Mini App
2. Нажми "Добавить сделку"
3. Выбери брокерский аккаунт
4. Выбери "Загрузить отчет брокера"
5. Выбери тип отчета: "Interactive Brokers (CSV)"
6. Загрузи файл `sample_ib_activity.csv`
7. Дождись обработки (2-5 секунд)
8. Проверь, что 4 сделки добавлены в портфолио

### Python unit test

```python
from app.services.report_parsers import get_parser

def test_ib_parser():
    with open("test_data/sample_ib_activity.csv", "rb") as f:
        file_bytes = f.read()
    
    parser = get_parser("ib_activity_csv")
    trades, warnings = parser.parse(file_bytes)
    
    assert len(trades) == 4
    assert len(warnings) == 0
    
    # Проверка первой сделки
    assert trades[0].ticker == "AAPL"
    assert trades[0].quantity == 100
    assert trades[0].price == 150.00
    assert trades[0].asset_type == "stock"
    assert trades[0].tx_type == "buy"
    assert trades[0].commission == 1.00
    
    # Проверка продажи
    sell_trade = next(t for t in trades if t.ticker == "GOOGL")
    assert sell_trade.tx_type == "sell"
    assert sell_trade.quantity == 30
```

## 🚧 TODO: Нужны sample файлы

Для реализации парсеров этих брокеров нужны примеры отчетов:

- [ ] **TBC Capital** (Georgia) - Excel
- [ ] **Galt and Taggart** (Georgia) - Excel
- [ ] **Freedom Finance** (Kazakhstan) - Excel

### Как предоставить sample

1. Экспортируй отчет из личного кабинета брокера
2. **Anonymize данные**:
   - Замени account number на "12345"
   - Используй тестовые тикеры (AAPL, MSFT, etc.)
   - Или удали строки с личными позициями
3. Положи файл в `test_data/sample_<broker>.<ext>`
4. Создай Pull Request или отправь на email

## 📊 Expected Results

### sample_ib_activity.csv

После обработки должно быть создано:

**Assets** (4 новых):
1. AAPL (stock) - qty: 100, avg_price: 150.01
2. MSFT (stock) - qty: 50, avg_price: 380.02
3. SPY (etf) - qty: 20, avg_price: 450.025
4. GOOGL (stock) - qty: -30, avg_price: ... (sell)

**Transactions** (4):
- Buy AAPL: 100 @ 150.00 (commission: 1.00)
- Buy MSFT: 50 @ 380.00 (commission: 1.00)
- Buy SPY: 20 @ 450.00 (commission: 0.50)
- Sell GOOGL: 30 @ 140.00 (commission: 0.80)

### sample_bybit_trades.csv

**Assets** (3 новых):
1. BTCUSDT (crypto) - qty: 0.05, avg_price: ...
2. ETHUSDT (crypto) - qty: 2.0, avg_price: 2500.00
3. SOLUSDT (crypto) - qty: 50.0, avg_price: 100.00

**Transactions** (4):
- Buy BTC: 0.1 @ 42000.50 (fee: 4.2 USDT)
- Buy ETH: 2.0 @ 2500.00 (fee: 5.0 USDT)
- Buy SOL: 50.0 @ 100.00 (fee: 5.0 USDT)
- Sell BTC: 0.05 @ 43000.00 (fee: 2.15 USDT)

## 🔍 Debugging Failed Parses

Если парсер падает:

1. Проверь логи backend:
```bash
docker logs omnicap-backend -f
```

2. Проверь `error_message` в report_job:
```bash
curl http://localhost:8000/reports/$JOB_ID \
  -H "Authorization: Bearer $TOKEN" | jq .error_message
```

3. Проверь `parsing_warnings` (некритичные ошибки):
```bash
curl http://localhost:8000/reports/$JOB_ID \
  -H "Authorization: Bearer $TOKEN" | jq .parsing_warnings
```

4. Открой файл в текстовом редакторе и проверь:
   - Кодировка (UTF-8 vs Windows-1251)
   - Разделители (запятая vs точка с запятой)
   - Формат дат
   - Наличие BOM (Byte Order Mark)
