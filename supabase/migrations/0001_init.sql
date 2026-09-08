-- ============================================================================
-- Omnicap: схема БД для Telegram Mini App трекера инвестиционного портфеля
-- Privacy-first: RLS на все таблицы + app-level шифрование чувствительных полей
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- users
-- Telegram — единственный источник identity. Supabase Auth (email/password)
-- не используется: бэкенд сам минтит JWT (см. секцию auth в архитектуре ниже)
-- с claim `sub` = users.id, подписанный SUPABASE_JWT_SECRET, чтобы RLS
-- политики ниже работали через auth.uid().
-- ----------------------------------------------------------------------------
create table public.users (
    id                  uuid primary key default gen_random_uuid(),
    telegram_id         bigint unique not null,
    telegram_username   text,
    first_name          text,
    last_name           text,
    photo_url           text,
    -- Envelope encryption: DEK пользователя, зашифрованный мастер-ключом (KEK) из KMS/Vault.
    -- Само шифрование/расшифровка полей ниже происходит в бэкенде, не в БД.
    encrypted_dek        bytea,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

comment on column public.users.encrypted_dek is
    'Data Encryption Key пользователя, обёрнутый KEK. Хранится только в зашифрованном виде.';

-- ----------------------------------------------------------------------------
-- broker_accounts — привязка активов к конкретному брокеру/платформе
-- ----------------------------------------------------------------------------
create table public.broker_accounts (
    id                  uuid primary key default gen_random_uuid(),
    user_id             uuid not null references public.users(id) on delete cascade,
    broker_name         text not null,               -- напр. 'Tinkoff', 'Interactive Brokers'
    account_label_enc   bytea,                        -- зашифровано: произвольное имя счёта
    base_currency       text not null default 'USD',
    created_at          timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- assets — текущие позиции (агрегат по тикеру в рамках brokerAccount)
-- Количество и цена зашифрованы app-level: даже утечка БД/service-role
-- не раскрывает размер и состав портфеля напрямую.
-- ----------------------------------------------------------------------------
create table public.assets (
    id                      uuid primary key default gen_random_uuid(),
    user_id                 uuid not null references public.users(id) on delete cascade,
    broker_account_id       uuid references public.broker_accounts(id) on delete set null,
    ticker                  text not null,
    asset_type              text not null check (asset_type in ('stock','etf','bond','crypto','currency','other')),
    currency                text not null default 'USD',
    quantity_enc            bytea not null,           -- зашифрованное numeric (сериализовано)
    avg_purchase_price_enc  bytea not null,           -- зашифрованное numeric
    notes_enc               bytea,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now(),
    unique (user_id, broker_account_id, ticker)
);

-- ----------------------------------------------------------------------------
-- transactions — история покупок/продаж/дивидендов, источник для recompute assets
-- ----------------------------------------------------------------------------
create table public.transactions (
    id                  uuid primary key default gen_random_uuid(),
    user_id             uuid not null references public.users(id) on delete cascade,
    asset_id            uuid not null references public.assets(id) on delete cascade,
    tx_type             text not null check (tx_type in ('buy','sell','dividend')),
    quantity_enc        bytea not null,
    price_enc           bytea not null,
    fee_enc             bytea,
    tx_date             date not null,
    source              text not null default 'manual' check (source in ('manual','ai_screenshot')),
    screenshot_job_id   uuid references public.screenshot_jobs(id) on delete set null,
    created_at          timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- screenshot_jobs — жизненный цикл AI-парсинга скриншотов
-- storage_path существует только временно: воркер обязан удалить объект
-- из Storage сразу после обработки (успех/фейл) и обнулить сам path.
-- ----------------------------------------------------------------------------
create table public.screenshot_jobs (
    id                  uuid primary key default gen_random_uuid(),
    user_id             uuid not null references public.users(id) on delete cascade,
    status              text not null default 'pending'
                            check (status in ('pending','processing','done','failed')),
    storage_path        text,                         -- null после очистки
    extracted_json      jsonb,                        -- результат Claude Vision (уже без картинки)
    error_message       text,
    created_at          timestamptz not null default now(),
    processed_at        timestamptz,
    purge_after         timestamptz not null default (now() + interval '24 hours')
);

-- транзакции ссылаются на job уже после его создания — добавляем FK отдельно
alter table public.transactions
    add constraint transactions_screenshot_job_id_fkey
    foreign key (screenshot_job_id) references public.screenshot_jobs(id) on delete set null;

-- ----------------------------------------------------------------------------
-- price_cache — котировки для расчёта текущей доходности, не персональные данные
-- ----------------------------------------------------------------------------
create table public.price_cache (
    ticker              text primary key,
    price               numeric not null,
    currency            text not null default 'USD',
    updated_at          timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- updated_at триггеры
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger trg_users_updated_at before update on public.users
    for each row execute function public.set_updated_at();

create trigger trg_assets_updated_at before update on public.assets
    for each row execute function public.set_updated_at();

-- ============================================================================
-- Row Level Security
-- Все запросы от фронтенда идут с JWT, где auth.uid() = users.id (см. auth flow).
-- Бэкенд для служебных операций (создание job, воркер) использует service_role,
-- который RLS обходит по умолчанию — это ожидаемо и осознанно.
-- ============================================================================

alter table public.users              enable row level security;
alter table public.broker_accounts    enable row level security;
alter table public.assets             enable row level security;
alter table public.transactions       enable row level security;
alter table public.screenshot_jobs    enable row level security;
alter table public.price_cache        enable row level security;

create policy "users_select_self" on public.users
    for select using (id = auth.uid());
create policy "users_update_self" on public.users
    for update using (id = auth.uid());
-- insert в users делает только бэкенд через service_role при первом логине

create policy "broker_accounts_owner" on public.broker_accounts
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "assets_owner" on public.assets
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "transactions_owner" on public.transactions
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "screenshot_jobs_owner_select" on public.screenshot_jobs
    for select using (user_id = auth.uid());
-- insert/update job делает бэкенд (service_role); клиент только читает статус

create policy "price_cache_read_all" on public.price_cache
    for select using (true);

-- ============================================================================
-- Storage: приватный bucket для скриншотов
-- Выполнить отдельно через Supabase Storage API/Dashboard, либо через
-- management API, если он доступен в вашем pipeline.
-- ============================================================================
-- insert into storage.buckets (id, name, public) values ('screenshots', 'screenshots', false);
--
-- Доступ к объектам только через service_role (backend), у клиента нет
-- прямого доступа к bucket — загрузка идёт через backend-эндпоинт, не через
-- клиентский Supabase Storage SDK. Поэтому storage.objects policies для
-- authenticated роли намеренно не создаются.
