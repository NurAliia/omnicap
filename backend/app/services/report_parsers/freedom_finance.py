"""Парсер Freedom Finance Excel отчета."""
from .base import ParsedTrade, ParsingWarning, ReportParser


class FreedomFinanceXLSXParser(ReportParser):
    """
    Парсер Freedom Finance XLSX отчета.

    TODO: Реализовать после получения примера реального отчета от Freedom Finance.
    Казахстанский брокер, формат отчета неизвестен (возможно похож на российские брокеры).
    """

    def parse(self, file_bytes: bytes) -> tuple[list[ParsedTrade], list[ParsingWarning]]:
        raise NotImplementedError(
            "Freedom Finance parser not implemented yet. "
            "Please provide a sample report to implement this parser."
        )
