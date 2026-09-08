"""
Парсеры брокерских отчетов.

Каждый парсер реализует интерфейс ReportParser и возвращает список сделок
в унифицированном формате ParsedTrade.

Тип отчета определяется автоматически через detector.detect_report_type().
"""
from .base import ParsedTrade, ParsingWarning, ReportParser
from .bybit import BybitCSVParser
from .detector import detect_report_type
from .freedom_finance import FreedomFinanceXLSXParser
from .galt_taggart import GaltTaggartXLSXParser
from .interactive_brokers import IBActivityCSVParser, IBActivityXMLParser
from .tbc_capital import TBCCapitalXLSXParser

PARSER_REGISTRY = {
    "ib_activity_csv": IBActivityCSVParser,
    "ib_activity_xml": IBActivityXMLParser,
    "bybit_csv": BybitCSVParser,
    "tbc_capital_xlsx": TBCCapitalXLSXParser,
    "galt_taggart_xlsx": GaltTaggartXLSXParser,
    "freedom_finance_xlsx": FreedomFinanceXLSXParser,
}


def get_parser(report_type: str) -> ReportParser:
    """Возвращает экземпляр парсера для данного типа отчета."""
    parser_class = PARSER_REGISTRY.get(report_type)
    if not parser_class:
        raise ValueError(f"Unknown report type: {report_type}")
    return parser_class()


__all__ = [
    "ParsedTrade",
    "ParsingWarning",
    "ReportParser",
    "get_parser",
    "detect_report_type",
    "PARSER_REGISTRY",
]
