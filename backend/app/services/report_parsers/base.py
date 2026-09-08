"""Базовый класс для парсеров брокерских отчетов."""
from abc import ABC, abstractmethod
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class ParsedTrade(BaseModel):
    """Унифицированная структура сделки, извлеченной из отчета."""
    ticker: str
    asset_type: Literal["stock", "etf", "bond", "crypto", "currency", "option", "future", "other"]
    tx_type: Literal["buy", "sell", "dividend", "fee", "tax", "split", "transfer"]
    quantity: float
    price: float  # цена за единицу (0 для дивидендов/комиссий/налогов)
    currency: str  # ISO 4217
    tx_date: date

    # Опциональные поля
    commission: float = 0.0
    tax: float = 0.0

    # Метаданные для дебага
    raw_line_number: int | None = None  # номер строки в исходном файле
    raw_data: dict = Field(default_factory=dict)  # исходные данные для отладки


class ParsingWarning(BaseModel):
    """Некритичное предупреждение при парсинге (пропущенная строка, неизвестный тикер и т.д.)."""
    line_number: int | None = None
    message: str
    raw_data: dict = Field(default_factory=dict)


class ReportParser(ABC):
    """Абстрактный парсер брокерского отчета."""

    @abstractmethod
    def parse(self, file_bytes: bytes) -> tuple[list[ParsedTrade], list[ParsingWarning]]:
        """
        Парсит файл отчета и возвращает список сделок + список предупреждений.

        Args:
            file_bytes: содержимое файла (CSV/XLSX/PDF/XML)

        Returns:
            (trades, warnings) - список сделок и некритичных предупреждений

        Raises:
            ValueError: если файл полностью не распознан или критическая ошибка формата
        """
        pass

    @staticmethod
    def normalize_ticker(raw_ticker: str) -> str:
        """Нормализует тикер (убирает пробелы, приводит к uppercase)."""
        return raw_ticker.strip().upper()

    @staticmethod
    def parse_date(date_str: str, formats: list[str]) -> date:
        """Парсит дату из строки, пробуя несколько форматов."""
        from datetime import datetime

        for fmt in formats:
            try:
                return datetime.strptime(date_str.strip(), fmt).date()
            except ValueError:
                continue
        raise ValueError(f"Could not parse date '{date_str}' with formats {formats}")
