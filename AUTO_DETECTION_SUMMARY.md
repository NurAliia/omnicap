# Auto-Detection Implementation Summary

## ✅ Изменения

### Backend

1. **Новый модуль `detector.py`**:
   - `detect_report_type(file_bytes, filename)` - определяет тип отчета
   - Проверяет CSV/XML/Excel по сигнатурам
   - Поддерживает UTF-8 и Windows-1251 кодировки
   - Возвращает `ReportType | None`

2. **Обновлен `reports.py`**:
   - ❌ Убран параметр `report_type` из `POST /reports/upload`
   - ✅ Добавлена автоматическая детекция перед сохранением
   - ✅ Возвращает `detected_broker` в ответе
   - ✅ 400 ошибка если тип не определен

3. **Тесты `test_report_detector.py`**:
   - 12 тест-кейсов для разных форматов
   - Проверка BOM, Windows-1251, XML, CSV
   - Edge cases: пустые файлы, бинарный мусор

### Frontend

**Обновлен `ReportUploader.tsx`**:
- ❌ Убран dropdown выбора типа отчета
- ✅ Показывается подсказка "We'll automatically detect your broker"
- ✅ После загрузки отображается детектированный брокер
- ✅ Упрощен UX: файл → загрузить → результат

## 🎯 Как это работает

### Шаг 1: Пользователь загружает файл
```
Frontend → POST /reports/upload
Body: file=report.csv, broker_account_id=uuid
(НЕТ report_type!)
```

### Шаг 2: Backend детектирует тип
```python
report_type = detect_report_type(file_bytes, filename)
# Проверяет:
# - CSV: первые строки на наличие специфичных заголовков
# - XML: <?xml> + теги FlexQuery/FlexStatement
# - Excel: структуру листов (openpyxl)

if not report_type:
    raise HTTPException(400, "Could not detect report type...")
```

### Шаг 3: Обработка как обычно
```python
# Все остальное без изменений:
# Storage → job → background parse → cleanup
```

### Шаг 4: Результат
```json
{
  "job_id": "uuid",
  "status": "pending",
  "detected_broker": "Interactive Brokers (CSV)"  // NEW!
}
```

## 📊 Detection Logic

### IB CSV
```
Trades,Header,DataDiscriminator,Asset Category,...
Trades,Data,Order,Stocks,USD,AAPL,...
```
**Signature**: `"trades,header,datadiscriminator"` в первых 5 строках

### Bybit CSV
```
Time,Symbol,Side,Price,Quantity,Fee,Fee Currency
2024-01-15 12:30:00,BTCUSDT,Buy,42000.50,0.1,4.2,USDT
```
**Signature**: `"time,symbol,side,price,quantity"` (без пробелов)

### IB XML
```xml
<?xml version="1.0"?>
<FlexQueryResponse>
  <FlexStatements>
    ...
```
**Signature**: `<flexquerysresponse>` или `<flexstatement>` теги

### TBC Capital / Galt / Freedom
**Сигнатуры** (ожидаются в Excel или CSV):
- TBC: "TBC Capital", "თიბისი" (грузинский)
- Galt: "Galt", "Taggart", "გალტი"
- Freedom: "Freedom", "Номер счета", "Дата сделки"

⚠️ **Требуются примеры файлов для точной реализации!**

## 🧪 Тестирование

### Unit tests
```bash
cd backend
pytest tests/test_report_detector.py -v
```

### Manual test (IB CSV)
```bash
curl -X POST http://localhost:8000/reports/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test_data/sample_ib_activity.csv" \
  -F "broker_account_id=$BROKER_ID"

# Ожидаемый ответ:
# {"job_id": "...", "status": "pending", "detected_broker": "Interactive Brokers (CSV)"}
```

### Manual test (Bybit CSV)
```bash
curl -X POST http://localhost:8000/reports/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test_data/sample_bybit_trades.csv" \
  -F "broker_account_id=$BROKER_ID"

# Ожидаемый ответ:
# {"job_id": "...", "status": "pending", "detected_broker": "Bybit"}
```

### Manual test (unknown format)
```bash
echo "Random,Data,Here" > /tmp/unknown.csv
curl -X POST http://localhost:8000/reports/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/tmp/unknown.csv" \
  -F "broker_account_id=$BROKER_ID"

# Ожидаемый ответ:
# HTTP 400: "Could not detect report type. Supported brokers: ..."
```

## 📝 Обновленная документация

- `README_REPORTS.md` - добавлена секция Auto-Detection
- `test_data/README.md` - примеры без указания типа
- `HOW_TO_ADD_PARSER.md` - добавить сигнатуры в detector.py

## 🔮 Будущие улучшения

### 1. Confidence Score
```python
def detect_report_type(file_bytes, filename) -> tuple[ReportType | None, float]:
    # Возвращает тип + уверенность 0.0-1.0
    # Если < 0.7 → показать предупреждение пользователю
```

### 2. Multi-broker files
Некоторые сервисы объединяют отчеты → детектировать несколько секций:
```python
# Файл содержит и IB и Bybit данные
detected_types = detect_all_report_types(file_bytes)
# → ["ib_activity_csv", "bybit_csv"]
```

### 3. Fuzzy matching
Если файл почти похож на IB, но не совсем:
```python
# "Trade,Header,Symbol" (опечатка в "Trades")
# → предложить пользователю "Did you mean Interactive Brokers?"
```

### 4. Learning from failures
Логировать `error_message` из failed jobs:
```sql
SELECT error_message, COUNT(*) 
FROM report_jobs 
WHERE status = 'failed' 
GROUP BY error_message;
```
→ Улучшать детектор на основе частых ошибок

## 🎉 Результат

**Было** (3 шага):
1. Выбери тип отчета из dropdown
2. Загрузи файл
3. Нажми "Upload"

**Стало** (2 шага):
1. Загрузи файл
2. ✅ Система сама определит брокера!

**UX выигрыш**: -33% шагов, меньше ошибок (пользователь не выберет неправильный тип).
