-- ============================================================================
-- Конвертация валют для агрегированной стоимости портфеля.
-- ============================================================================

-- Предпочитаемая валюта отображения. Хранится в открытом виде — это не
-- чувствительные данные, а настройка UI.
alter table public.users
    add column base_currency text not null default 'USD';

-- ----------------------------------------------------------------------------
-- fx_rates — курсы валют относительно USD (сколько единиц `currency` за 1 USD).
-- Публичные рыночные данные, не персональные — как и price_cache, без шифрования,
-- обновляются периодической задачей бэкенда (см. services/fx_rates.py).
-- ----------------------------------------------------------------------------
create table public.fx_rates (
    currency        text primary key,
    rate_to_usd     numeric not null,   -- 1 USD = rate_to_usd единиц currency
    updated_at      timestamptz not null default now()
);

insert into public.fx_rates (currency, rate_to_usd) values ('USD', 1);

alter table public.fx_rates enable row level security;

create policy "fx_rates_read_all" on public.fx_rates
    for select using (true);
