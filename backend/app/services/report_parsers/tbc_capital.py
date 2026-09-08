"""Парсер TBC Capital Excel отчета."""
from .base import ParsedTrade, ParsingWarning, ReportParser


class TBCCapitalXLSXParser(ReportParser):
    """
    Парсер TBC Capital XLSX отчета.

    TODO: Реализовать после получения примера реального отчета от TBC Capital.
    Грузинский брокер, формат отчета неизвестен.
    """

    def parse(self, file_bytes: bytes) -> tuple[list[ParsedTrade], list[ParsingWarning]]:
        raise NotImplementedError(
            "TBC Capital parser not implemented yet. "
            "Please provide a sample report to implement this parser."
        )
