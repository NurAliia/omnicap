import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Клиент создаётся заново на каждый access_token: наш JWT живёт 1 час
 * (см. backend/app/core/config.py: access_token_ttl_seconds) и минтится
 * бэкендом при каждом открытии Mini App, поэтому кэшировать клиент между
 * токенами смысла нет.
 *
 * anon key тут используется только как API-ключ для PostgREST endpoint,
 * реальная авторизация запроса идёт через наш кастомный JWT в заголовке
 * Authorization — именно он определяет auth.uid() внутри RLS policies.
 *
 * Используется только для некритичных прямых чтений (price_cache, статус
 * screenshot_jobs). Всё, что требует расшифровки (assets/transactions),
 * идёт через backend REST API (lib/api.ts) — см. пояснение в
 * backend/app/routers/portfolio.py.
 */
export function createSupabaseClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
