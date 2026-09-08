-- ============================================================================
-- Привязка скриншота к портфелю/брокеру (IB, Bybit, ...), выбранному
-- пользователем перед загрузкой, чтобы группировка сохранялась на
-- assets.broker_account_id, а не терялась в фоновой обработке job'а.
-- ============================================================================

alter table public.screenshot_jobs
    add column broker_account_id uuid references public.broker_accounts(id) on delete set null;
