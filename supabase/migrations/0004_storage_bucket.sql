-- ============================================================================
-- Приватный bucket для временного хранения скриншотов (см. backend/app/routers/screenshots.py).
-- public=false: доступ только через service_role с бэкенда, у клиента нет
-- прямого доступа к объектам через supabase-js Storage SDK.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('screenshots', 'screenshots', false)
on conflict (id) do nothing;
