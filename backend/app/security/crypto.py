"""
Envelope encryption для чувствительных полей (quantity, price, notes, account label).

Схема:
- MASTER_KEK живёт вне БД (env -> в проде переносится в KMS/Vault), никогда не
  меняется на лету без миграции.
- Для каждого пользователя при первом логине генерируется DEK (32 байта),
  шифруется KEK через AES-GCM и сохраняется в users.encrypted_dek.
- Каждое поле шифруется DEK пользователя через Fernet (AES-128-CBC + HMAC).
  DEK на уровне пользователя (а не общий на всё приложение) ограничивает
  blast radius: компрометация одного DEK не раскрывает чужие портфели.

Это НЕ замена RLS, а вторая линия защиты: если кто-то получит прямой доступ
к БД (бэкап, дамп, скомпрометированный service_role key), данные всё равно
останутся нечитаемыми без KEK.
"""
import base64
import os

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings


def _kek() -> bytes:
    return base64.b64decode(settings.master_kek_b64)


def generate_wrapped_dek() -> bytes:
    """Генерирует новый DEK для пользователя и возвращает его, обёрнутый KEK (nonce||ciphertext)."""
    dek = AESGCM.generate_key(bit_length=256)
    nonce = os.urandom(12)
    aesgcm = AESGCM(_kek())
    wrapped = aesgcm.encrypt(nonce, dek, associated_data=None)
    return nonce + wrapped


def unwrap_dek(encrypted_dek: bytes) -> bytes:
    nonce, wrapped = encrypted_dek[:12], encrypted_dek[12:]
    aesgcm = AESGCM(_kek())
    return aesgcm.decrypt(nonce, wrapped, associated_data=None)


def _fernet_for_dek(dek: bytes) -> Fernet:
    # Fernet требует urlsafe-base64 ключ ровно 32 байта в исходном виде
    return Fernet(base64.urlsafe_b64encode(dek))


def encrypt_field(dek: bytes, value: str) -> bytes:
    return _fernet_for_dek(dek).encrypt(value.encode())


def decrypt_field(dek: bytes, token: bytes) -> str:
    return _fernet_for_dek(dek).decrypt(token).decode()


def to_pg_bytea(data: bytes) -> str:
    """
    Кодирует bytes для записи в bytea-колонку через PostgREST JSON API.

    Postgres распознаёт hex-текст как bytea только с префиксом \\x — без
    него применяется legacy "escape"-формат, который трактует строку как
    буквальные ASCII-байты, а не как hex для декодирования. Голый .hex()
    без этого префикса — то, из-за чего это всплыло в проде: значения
    писались, но не читались обратно (see git log).
    """
    return "\\x" + data.hex()


def from_pg_bytea(value: str) -> bytes:
    """Обратная операция to_pg_bytea — PostgREST возвращает bytea с тем же префиксом \\x."""
    return bytes.fromhex(value.removeprefix("\\x"))
