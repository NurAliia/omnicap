"""Парсер Bybit Trade History CSV."""
import csv
import io

from .base import ParsedTrade, ParsingWarning, ReportParser


class BybitCSVParser(ReportParser):
    """
    Парсер Bybit Trade History CSV.

    Формат CSV с заголовками:
    Time, Symbol, Side, Price, Quantity, Fee, Fee Currency, Order Type, ...

    Пример:
    2024-01-15 12:30:00,BTCUSDT,Buy,42000.50,0.1,4.2,USDT,Market
    """

    def parse(self, file_bytes: bytes) -> tuple[list[ParsedTrade], list[ParsingWarning]]:
        content = file_bytes.decode("utf-8")
        reader = csv.DictReader(io.StringIO(content))

        trades: list[ParsedTrade] = []
        warnings: list[ParsingWarning] = []

        for line_num, row in enumerate(reader, start=2):  # start=2 т.к. строка 1 = header
            try:
                trade = self._parse_trade_row(row, line_num)
                if trade:
                    trades.append(trade)
            except Exception as exc:
                warnings.append(ParsingWarning(
                    line_number=line_num,
                    message=f"Failed to parse trade: {exc}",
                    raw_data=row
                ))

        if not trades and not warnings:
            raise ValueError("No trades found in Bybit CSV")

        return trades, warnings

    def _parse_trade_row(self, row: dict, line_num: int) -> ParsedTrade | None:
        """Парсит одну строку сделки."""
        symbol = row.get("Symbol", "").strip()
        if not symbol:
            return None

        # Bybit криптопары обычно в формате BTCUSDT, разделяем на base/quote
        # Упрощение: считаем что торговали base валютой за quote
        ticker = self.normalize_ticker(symbol)

        side = row.get("Side", "").lower()
        tx_type = "buy" if side == "buy" else "sell"

        quantity = float(row.get("Quantity", 0))
        price = float(row.get("Price", 0))
        fee = float(row.get("Fee", 0))
        fee_currency = row.get("Fee Currency", "USDT")

        # Парсим дату: "2024-01-15 12:30:00"
        date_str = row.get("Time", "").split()[0]  # берем только дату
        tx_date = self.parse_date(date_str, ["%Y-%m-%d", "%d/%m/%Y"])

        # Определяем валюту сделки (обычно последняя часть пары, например USDT в BTCUSDT)
        currency = "USDT"  # дефолт для Bybit
        if ticker.endswith("USDT"):
            currency = "USDT"
        elif ticker.endswith("USD"):
            currency = "USD"
        elif ticker.endswith("BTC"):
            currency = "BTC"

        return ParsedTrade(
            ticker=ticker,
            asset_type="crypto",
            tx_type=tx_type,
            quantity=quantity,
            price=price,
            currency=currency,
            tx_date=tx_date,
            commission=fee,
            raw_line_number=line_num,
            raw_data=row,
        )
