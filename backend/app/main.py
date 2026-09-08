from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import auth, broker_accounts, fx, portfolio, screenshots

app = FastAPI(title="Omnicap API")

# Фронтенд (TMA) грузится в WebView Telegram с домена Vercel — это другой
# origin, значит без CORS браузер зарубит запросы к API ещё до нашего кода.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(screenshots.router)
app.include_router(portfolio.router)
app.include_router(fx.router)
app.include_router(broker_accounts.router)


@app.get("/health")
async def health():
    # Используется Render health check'ом (render.yaml) и не требует авторизации —
    # если сервис "спит" (free tier), именно этот запрос его поднимает.
    return {"status": "ok"}
