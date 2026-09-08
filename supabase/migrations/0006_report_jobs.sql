-- ============================================================================
-- Обработка брокерских отчетов (CSV/XLSX/PDF) с массовым импортом сделок.
-- Отчет загружается временно в Storage, парсится, данные сохраняются в
-- assets/transactions, файл удаляется (аналогично screenshot_jobs).
-- ============================================================================

create table if not exists public.report_jobs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    broker_account_id uuid not null references public.broker_accounts(id) on delete cascade,

    -- Тип отчета (определяет парсер)
    report_type text not null check (report_type in (
        'ib_activity_csv',      -- Interactive Brokers Activity Statement (CSV)
        'ib_activity_xml',      -- Interactive Brokers Activity Statement (XML)
        'bybit_csv',            -- Bybit Trade History CSV
        'tbc_capital_xlsx',     -- TBC Capital Excel report
        'galt_taggart_xlsx',    -- Galt and Taggart Excel report
        'freedom_finance_xlsx'  -- Freedom Finance Excel report
    )),

    status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),

    -- Storage path (удаляется после обработки)
    storage_path text,

    -- Результаты парсинга
    parsed_trades_count int default 0,
    imported_assets_count int default 0,
    imported_transactions_count int default 0,

    -- Ошибки парсинга
    error_message text,
    parsing_warnings jsonb default '[]'::jsonb,  -- некритичные проблемы (пропущенные строки и т.д.)

    created_at timestamptz not null default now(),
    processed_at timestamptz,

    -- Privacy: автоматическая очистка старых job'ов (аналогично screenshot_jobs)
    purge_after timestamptz not null default (now() + interval '7 days')
);

create index idx_report_jobs_user_status on public.report_jobs(user_id, status);
create index idx_report_jobs_purge on public.report_jobs(purge_after) where status in ('done', 'failed');

-- RLS: пользователь видит только свои job'ы
alter table public.report_jobs enable row level security;

create policy "Users can view own report jobs"
    on public.report_jobs for select
    using (auth.uid() = user_id);

create policy "Users can insert own report jobs"
    on public.report_jobs for insert
    with check (auth.uid() = user_id);

-- Периодическая очистка старых job'ов (аналогично screenshot_jobs cleanup)
-- Вызывается из pg_cron в 0003_fx_cron.sql или добавить отдельную задачу
