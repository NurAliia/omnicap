-- ============================================================================
-- Storage bucket для брокерских отчетов (временное хранение при обработке).
-- Аналогично screenshots bucket, но для более крупных файлов (CSV/XLSX/XML).
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

-- RLS: пользователь может загружать/читать/удалять только свои отчеты
create policy "Users can upload own reports"
    on storage.objects for insert
    with check (
        bucket_id = 'reports'
        and auth.uid()::text = (storage.foldername(name))[1]
    );

create policy "Users can read own reports"
    on storage.objects for select
    using (
        bucket_id = 'reports'
        and auth.uid()::text = (storage.foldername(name))[1]
    );

create policy "Users can delete own reports"
    on storage.objects for delete
    using (
        bucket_id = 'reports'
        and auth.uid()::text = (storage.foldername(name))[1]
    );
