# Broker Report Import System

Система массового импорта сделок из брокерских отчетов с **автоматическим определением брокера**.

## Supported Brokers

### ✅ Implemented
1. **Interactive Brokers (CSV)** - `ib_activity_csv`
   - Format: Activity Statement CSV export
   - Contains: Trades section with all transaction details
   
2. **Bybit (CSV)** - `bybit_csv`
   - Format: Trade History CSV export
   - Contains: Crypto trades with fees

### 🚧 Placeholders (need sample reports)
3. **TBC Capital (Excel)** - `tbc_capital_xlsx`
4. **Galt and Taggart (Excel)** - `galt_taggart_xlsx`
5. **Freedom Finance (Excel)** - `freedom_finance_xlsx`

## How to Add a New Broker Parser

1. Create a new parser in `backend/app/services/report_parsers/<broker_name>.py`:

```python
from .base import ParsedTrade, ParsingWarning, ReportParser

class MyBrokerParser(ReportParser):
    def parse(self, file_bytes: bytes) -> tuple[list[ParsedTrade], list[ParsingWarning]]:
        # Implement your parsing logic
        trades = []
        warnings = []
        
        # ... parse file_bytes ...
        
        return trades, warnings
```

2. Register the parser in `backend/app/services/report_parsers/__init__.py`:

```python
from .my_broker import MyBrokerParser

PARSER_REGISTRY = {
    # ... existing parsers ...
    "my_broker_csv": MyBrokerParser,
}
```

3. Add the report type to migrations (`0006_report_jobs.sql`):

```sql
report_type text not null check (report_type in (
    -- ... existing types ...
    'my_broker_csv'
))
```

4. Update frontend `REPORT_TYPES` in `frontend/components/ReportUploader.tsx`.

## Architecture

### Backend Flow
```
1. Upload → Auto-detect broker type
2. Storage (temporary)
3. Create report_job (status: pending)
4. Background task:
   a. Download from Storage
   b. Parse with appropriate parser
   c. Bulk insert into assets + transactions
   d. Update report_job (status: done/failed)
   e. Delete from Storage (privacy)
```

### Auto-Detection

Система автоматически определяет тип отчета по содержимому файла:

**Detection signatures:**
- **IB CSV**: `Trades,Header,DataDiscriminator` в заголовках
- **IB XML**: `<FlexQueryResponse>` или `<FlexStatement>` теги
- **Bybit CSV**: `Time,Symbol,Side,Price,Quantity` заголовки
- **TBC Capital**: "TBC Capital" или грузинский текст в файле
- **Galt and Taggart**: "Galt" или "Taggart" в заголовках
- **Freedom Finance**: "Freedom" или "Номер счета", "Дата сделки"

Если тип не определен → возвращается ошибка с подсказкой.

### Database Tables
- `report_jobs` - tracks processing status
- `assets` - deduplicated by (user_id, broker_account_id, ticker)
- `transactions` - individual trades with `report_job_id` reference

### Security
- Files stored temporarily in private Storage bucket
- Encrypted financial data (quantity, price) with user DEK
- Files deleted immediately after processing
- Old jobs auto-purged after 7 days

## Testing

### Sample Data Format

**Interactive Brokers CSV**:
```csv
Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code
Trades,Data,Order,Stocks,USD,AAPL,2024-01-15,100,150.00,150.00,-15000.00,-1.00,-15001.00,0,0,
```

**Bybit CSV**:
```csv
Time,Symbol,Side,Price,Quantity,Fee,Fee Currency,Order Type
2024-01-15 12:30:00,BTCUSDT,Buy,42000.50,0.1,4.2,USDT,Market
```

### Manual Testing

```bash
# Upload a report (broker type detected automatically)
curl -X POST http://localhost:8000/reports/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/report.csv" \
  -F "broker_account_id=UUID"

# Response: {"job_id": "...", "status": "pending", "detected_broker": "Interactive Brokers (CSV)"}

# Check status
curl http://localhost:8000/reports/{job_id} \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Next Steps

To fully implement TBC Capital, Galt and Taggart, and Freedom Finance parsers:

1. **Get sample reports** from each broker
2. **Analyze structure**: column names, date formats, encoding
3. **Implement parser** following the base class interface
4. **Test with real data**
5. **Update documentation** with specific format notes

## Notes

- Maximum file size: 50MB (configurable)
- Supported formats: CSV, XLSX, XLS, XML
- Processing timeout: 120 seconds (can increase for large files)
- Deduplication: by (user_id, broker_account_id, ticker)
