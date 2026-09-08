"""Парсер Interactive Brokers Activity Statement (CSV и XML)."""
import csv
import io
from datetime import date

from .base import ParsedTrade, ParsingWarning, ReportParser


class IBActivityCSVParser(ReportParser):
    """
    Парсер Interactive Brokers Activity Statement в формате CSV.

    Формат: CSV с заголовками, секции разделены строками типа "Trades,Header,..."
    Интересует секция "Trades" с колонками:
    - DataDiscriminator, Asset Category, Currency, Symbol, Date/Time, Quantity, T. Price, ...
    """

    def parse(self, file_bytes: bytes) -> tuple[list[ParsedTrade], list[ParsingWarning]]:
        content = file_bytes.decode("utf-8-sig")  # IB может добавлять BOM
        reader = csv.reader(io.StringIO(content))

        trades: list[ParsedTrade] = []
        warnings: list[ParsingWarning] = []

        # Ищем секцию "Trades"
        in_trades_section = False
        header_row: list[str] = []
        line_number = 0

        for row in reader:
            line_number += 1
            if not row or not row[0]:
                continue

            # Начало секции Trades
            if row[0] == "Trades" and len(row) > 1 and row[1] == "Header":
                in_trades_section = True
                header_row = row[2:]  # пропускаем "Trades,Header,"
                continue

            # Конец секции (новая секция или пустая строка после Trades)
            if in_trades_section and row[0] != "Trades":
                in_trades_section = False
                continue

            # Парсим строку данных
            if in_trades_section and row[0] == "Trades" and row[1] == "Data":
                try:
                    trade = self._parse_trade_row(row[2:], header_row, line_number)
                    if trade:
                        trades.append(trade)
                except Exception as exc:
                    warnings.append(ParsingWarning(
                        line_number=line_number,
                        message=f"Failed to parse trade: {exc}",
                        raw_data={"row": row}
                    ))

        if not trades and not warnings:
            raise ValueError("No Trades section found in IB Activity Statement")

        return trades, warnings

    def _parse_trade_row(self, data: list[str], header: list[str], line_num: int) -> ParsedTrade | None:
        """Парсит одну строку сделки из секции Trades."""
        if len(data) != len(header):
            raise ValueError(f"Header/data length mismatch: {len(header)} vs {len(data)}")

        row_dict = dict(zip(header, data))

        # Пропускаем не-сделки (дивиденды, комиссии обрабатываются отдельно)
        asset_category = row_dict.get("Asset Category", "")
        if asset_category not in ("Stocks", "ETFs", "Bonds", "Crypto"):
            return None

        ticker = self.normalize_ticker(row_dict.get("Symbol", ""))
        quantity = float(row_dict.get("Quantity", 0))
        price = float(row_dict.get("T. Price", 0))
        currency = row_dict.get("Currency", "USD")
        date_str = row_dict.get("Date/Time", "").split(",")[0]  # "2024-01-15, 12:30:00" -> "2024-01-15"

        tx_date = self.parse_date(date_str, ["%Y-%m-%d", "%Y%m%d"])

        # Определяем тип сделки (buy/sell)
        tx_type = "buy" if quantity > 0 else "sell"

        # Маппинг типа актива
        asset_type_map = {
            "Stocks": "stock",
            "ETFs": "etf",
            "Bonds": "bond",
            "Crypto": "crypto",
        }
        asset_type = asset_type_map.get(asset_category, "other")

        commission = abs(float(row_dict.get("Comm/Fee", 0)))

        return ParsedTrade(
            ticker=ticker,
            asset_type=asset_type,
            tx_type=tx_type,
            quantity=abs(quantity),
            price=abs(price),
            currency=currency,
            tx_date=tx_date,
            commission=commission,
            raw_line_number=line_num,
            raw_data=row_dict,
        )


class IBActivityXMLParser(ReportParser):
    """
    Парсер Interactive Brokers Activity Statement в формате XML/FlexQuery.

    TODO: Реализовать при необходимости (XML сложнее, но более структурирован).
    """

    def parse(self, file_bytes: bytes) -> tuple[list[ParsedTrade], list[ParsingWarning]]:
        raise NotImplementedError("IB XML parser not implemented yet. Use CSV export.")
