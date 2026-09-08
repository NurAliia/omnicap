-- ============================================================================
-- РАНТАЙМ-НАСТРОЙКА cron-задачи обновления курсов валют.
--
-- Это НЕ миграция — не коммитить с реальными значениями. Прогнать вручную
-- в Supabase SQL Editor один раз на каждое окружение (staging/prod), заменив
-- плейсхолдеры ниже на реальные значения.
--
-- Предпосылки: 0003_fx_cron.sql уже применена (pg_cron/pg_net включены),
-- INTERNAL_CRON_SECRET сгенерирован и установлен в env бэкенда
-- (backend/app/core/config.py: internal_cron_secret) — значение здесь
-- ДОЛЖНО совпадать с тем, что видит FastAPI, иначе /internal/fx/refresh
-- будет отвечать 401.
-- ============================================================================

-- 1. Секреты кладём в Vault, а не в тело cron-задачи: cron.job.command
--    виден в открытом виде любому с доступом к системным таблицам pg_cron,
--    а vault.decrypted_secrets — только через SECURITY DEFINER функции Vault.
select vault.create_secret(
    'https://api.omnicap.example.com',  -- REPLACE: базовый URL задеплоенного бэкенда
    'fx_refresh_base_url'
);

select vault.create_secret(
    'REPLACE_WITH_THE_SAME_VALUE_AS_INTERNAL_CRON_SECRET_ENV',
    'fx_refresh_internal_secret'
);

-- 2. Сама задача: раз в час, POST на /internal/fx/refresh.
--    net.http_post асинхронный — не блокирует cron worker и не роняет job,
--    если бэкенд временно недоступен (см. секцию "мониторинг" ниже).
select cron.schedule(
    'fx-rates-refresh',
    '0 * * * *',
    $$
    select net.http_post(
        url := (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'fx_refresh_base_url'
        ) || '/internal/fx/refresh',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Internal-Secret', (
                select decrypted_secret from vault.decrypted_secrets
                where name = 'fx_refresh_internal_secret'
            )
        ),
        body := '{}'::jsonb,
        -- Render free tier "спит" без трафика и поднимается ~30-60с на первый
        -- запрос после сна — таймаут ниже почти всегда покрывает cold start.
        -- Если всё же не успеет: net.http_post просто вернёт ошибку таймаута,
        -- курсы обновятся следующим часовым запуском — не критично.
        timeout_milliseconds := 30000
    );
    $$
);

-- ============================================================================
-- Мониторинг и отладка
-- ============================================================================

-- Список активных cron-задач и их расписание:
--   select jobid, jobname, schedule, active from cron.job;

-- История запусков (успех/фейл, время выполнения):
--   select jobid, status, return_message, start_time, end_time
--   from cron.job_run_details
--   where jobname = 'fx-rates-refresh'  -- через join с cron.job, см. ниже
--   order by start_time desc limit 20;
--
-- (job_run_details не хранит jobname напрямую, джойнить по jobid:
--   select d.status, d.return_message, d.start_time
--   from cron.job_run_details d
--   join cron.job j on j.jobid = d.jobid
--   where j.jobname = 'fx-rates-refresh'
--   order by d.start_time desc limit 20;)

-- Фактические HTTP-ответы от pg_net (код ответа, тело, ошибки сети):
--   select id, status_code, content, created
--   from net._http_response
--   order by created desc limit 20;

-- ============================================================================
-- Откат / изменение расписания
-- ============================================================================
-- select cron.unschedule('fx-rates-refresh');
-- Секреты в Vault не удаляются автоматически — при ротации INTERNAL_CRON_SECRET
-- нужно обновить env бэкенда И перезаписать значение в Vault:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'fx_refresh_internal_secret'),
--     'NEW_SECRET_VALUE'
--   );
