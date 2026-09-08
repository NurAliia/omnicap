# Деплой Omnicap: пошагово

Mini App — это не один деплой, а три независимые части, которые нужно связать:
бэкенд (Render), фронтенд (Vercel) и сам бот в Telegram (BotFather). Ниже —
порядок, в котором это имеет смысл делать (каждый шаг даёт значение,
нужное для следующего).

## 1. Бэкенд на Render

1. Запушьте репозиторий на GitHub (если ещё не там).
2. Render Dashboard -> **New** -> **Blueprint** -> выберите репозиторий.
   Render найдёт `render.yaml` в корне и предложит создать сервис `omnicap-backend`.
3. На экране создания сервиса заполните env-переменные (это секреты — их
   специально нет в `render.yaml`, `sync: false`):
   - `TELEGRAM_BOT_TOKEN` — получите на шаге 3 (BotFather), пока можно оставить заглушку и вернуться.
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase Dashboard -> Project Settings -> API.
   - `SUPABASE_JWT_SECRET` — там же, Project Settings -> API -> JWT Secret.
   - `ANTHROPIC_API_KEY` — console.anthropic.com -> API Keys.
   - `MASTER_KEK_B64` — сгенерируйте локально: `python3 -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())"`.
   - `INTERNAL_CRON_SECRET` — сгенерируйте: `openssl rand -hex 32`.
   - `ALLOWED_ORIGINS_RAW` — пока `http://localhost:3000`, обновите после шага 2 на реальный домен Vercel.
4. Deploy. Render выдаст URL вида `https://omnicap-backend.onrender.com` — сохраните его.
5. Проверка: откройте `https://omnicap-backend.onrender.com/health` в браузере —
   должно вернуть `{"status":"ok"}`. Если сервис "спал" (free tier засыпает
   без трафика), первый запрос может занять 30-60 секунд — это нормально.

## 2. Фронтенд на Vercel

1. Vercel Dashboard -> **Add New** -> **Project** -> тот же репозиторий.
2. **Root Directory** — обязательно укажите `frontend` (репозиторий монорепо, Vercel по умолчанию возьмёт корень).
3. Environment Variables:
   - `NEXT_PUBLIC_API_BASE_URL` = URL бэкенда из шага 1 (`https://omnicap-backend.onrender.com`).
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase Dashboard -> API.
4. Deploy. Vercel выдаст домен вида `https://omnicap.vercel.app`.
5. Вернитесь в Render и обновите `ALLOWED_ORIGINS_RAW` на этот домен —
   без этого браузер внутри Telegram будет рубить запросы к API как cross-origin.

## 3. Бот в Telegram (BotFather)

1. Напишите [@BotFather](https://t.me/BotFather) -> `/newbot` -> следуйте инструкциям
   (имя, username, должен кончаться на `bot`). В конце получите **токен** — это `TELEGRAM_BOT_TOKEN`, впишите его в Render (шаг 1.3) и передеплойте сервис.
2. `/mybots` -> выберите бота -> **Bot Settings** -> **Menu Button** -> **Configure Menu Button**.
3. Введите URL фронтенда с Vercel (`https://omnicap.vercel.app`) и текст кнопки (например "Открыть портфель").

Это всё, что нужно для запуска — Mini App не требует настройки webhook,
потому что бэкенд сейчас не обрабатывает входящие сообщения бота
(`/start` и т.п.), только HTTP API для самого приложения. Webhook понадобится,
если в будущем добавите бот-команды.

## 4. Supabase: миграции и cron

1. Прогоните миграции `supabase/migrations/0001_init.sql`, `0002_fx_rates.sql`,
   `0003_fx_cron.sql` (через Supabase CLI `supabase db push` или вручную в SQL Editor).
2. Откройте `supabase/ops/setup_fx_cron.sql`, замените плейсхолдеры:
   - URL бэкенда с Render (тот же, что в `NEXT_PUBLIC_API_BASE_URL`).
   - `INTERNAL_CRON_SECRET` — **то же значение**, что вписали в Render на шаге 1.3.
   Прогоните получившийся SQL в Supabase SQL Editor.
3. Проверка через сутки (или сразу, если поменяете расписание на `* * * * *` для теста):
   `select * from net._http_response order by created desc limit 5;` — код `204` = успех.

## Итоговая проверка

Откройте бота в Telegram -> нажмите Menu Button -> приложение должно
запросить авторизацию через `initData` и показать пустой портфель.
Если видите ошибку авторизации — почти наверняка проблема в CORS
(`ALLOWED_ORIGINS_RAW`) или в несовпадении `TELEGRAM_BOT_TOKEN` между
ботом и бэкендом.

## Известные ограничения free-тира Render

- Сервис засыпает без трафика — первый запрос после сна ~30-60с.
  Cron из Supabase (раз в час) технически не даёт ему "спать" дольше часа,
  но между отдельными действиями пользователя в приложении холодный старт возможен.
- Если это станет проблемой — есть платные планы Render без сна,
  либо внешний "пингер" (напр. cron-job.org раз в 10 минут на `/health`),
  но тогда почему бы вообще не выбрать an always-on план сразу, если бюджет позволит.
