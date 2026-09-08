-- ============================================================================
-- Разовый откат частично применённой 0001_init.sql (упала на создании
-- transactions из-за forward-reference на screenshot_jobs — уже исправлено
-- в 0001_init.sql). Прогнать один раз в SQL Editor, ПОТОМ заново прогнать
-- исправленную 0001_init.sql целиком.
--
-- cascade безопасен здесь: в базе на этот момент нет реальных пользовательских
-- данных, только частично созданная схема.
-- ============================================================================

drop table if exists public.transactions cascade;
drop table if exists public.screenshot_jobs cascade;
drop table if exists public.price_cache cascade;
drop table if exists public.assets cascade;
drop table if exists public.broker_accounts cascade;
drop table if exists public.users cascade;

drop function if exists public.set_updated_at() cascade;
