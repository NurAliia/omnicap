"""Парсер Galt and Taggart Excel отчета."""
from .base import ParsedTrade, ParsingWarning, ReportParser


class GaltTaggartXLSXParser(ReportParser):
    """
    Парсер Galt and Taggart XLSX отчета.

    TODO: Реализовать после получения примера реального отчета от Galt and Taggart.
    Грузинский инвестиционный банк, формат отчета неизвестен.
    """

    def parse(self, file_bytes: bytes) -> tuple[list[ParsedTrade], list[ParsingWarning]]:
        raise NotImplementedError(
            "Galt and Taggart parser not implemented yet. "
            "Please provide a sample report to implement this parser."
        )
