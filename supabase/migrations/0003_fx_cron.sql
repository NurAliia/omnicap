-- ============================================================================
-- Расширения для periodic-обновления курсов валют изнутри Supabase.
-- Только включение расширений — безопасно коммитить и гонять как обычную
-- миграцию. Сам cron.schedule() с реальным URL/секретом окружения — в
-- supabase/ops/setup_fx_cron.sql, его прогоняют вручную per-environment.
-- ============================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Vault (supabase_vault) в размещённом Supabase обычно уже доступен без
-- create extension — управляется платформой. Если schema `vault` отсутствует,
-- включите Vault через Dashboard -> Project Settings -> Vault.
