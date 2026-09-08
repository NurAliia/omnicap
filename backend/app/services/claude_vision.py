"""
Извлечение структурированных данных о сделке из скриншота брокерского приложения
через Claude Vision (Messages API, image content block + строгий JSON-контракт).
"""
import base64
import json

from anthropic import Anthropic
from pydantic import BaseModel, ValidationError

from app.core.config import settings

_client = Anthropic(api_key=settings.anthropic_api_key)

EXTRACTION_PROMPT = """\
Ты обрабатываешь скриншот из приложения брокера или инвестиционной платформы.
Извлеки данные о позиции/сделке и верни ТОЛЬКО валидный JSON без пояснений,
строго по схеме:

{
  "ticker": string,            // тикер или название бумаги, как на скриншоте
  "asset_type": "stock"|"etf"|"bond"|"crypto"|"currency"|"other",
  "quantity": number,          // количество единиц
  "price": number,             // цена покупки за единицу
  "currency": string,          // код валюты, ISO-4217, напр. "USD", "RUB"
  "date": string | null,       // дата сделки в формате YYYY-MM-DD, если видна
  "confidence": number         // 0..1, твоя уверенность в корректности извлечения
}

Если на скриншоте несколько позиций — верни данные только по первой/основной.
Если какое-то поле невозможно определить — верни null для него (кроме ticker,
quantity, price — они обязательны; если их нет, верни {"error": "not_recognized"}).
"""


class ExtractedTrade(BaseModel):
    ticker: str
    asset_type: str
    quantity: float
    price: float
    currency: str
    date: str | None = None
    confidence: float


class ExtractionError(Exception):
    pass


def extract_trade_from_screenshot(image_bytes: bytes, media_type: str) -> ExtractedTrade:
    image_b64 = base64.b64encode(image_bytes).decode()

    response = _client.messages.create(
        model=settings.claude_vision_model,
        max_tokens=512,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_b64,
                        },
                    },
                    {"type": "text", "text": EXTRACTION_PROMPT},
                ],
            }
        ],
    )

    raw_text = response.content[0].text.strip()

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise ExtractionError(f"Claude вернул не-JSON: {raw_text[:200]}") from exc

    if "error" in parsed:
        raise ExtractionError(f"Claude не распознал скриншот: {parsed['error']}")

    try:
        return ExtractedTrade.model_validate(parsed)
    except ValidationError as exc:
        raise ExtractionError(f"Ответ Claude не прошёл валидацию схемы: {exc}") from exc
