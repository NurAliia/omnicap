-- ============================================================================
-- Добавляем ссылку на report_job_id в transactions (аналогично screenshot_job_id).
-- Это позволяет отследить, из какого отчета была импортирована сделка.
-- ============================================================================

alter table public.transactions
    add column report_job_id uuid references public.report_jobs(id) on delete set null;

create index idx_transactions_report_job on public.transactions(report_job_id);
