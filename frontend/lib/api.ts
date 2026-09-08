const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL!;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Тонкая обёртка над fetch. Токен передаётся явно вызывающей стороной
 * (а не читается из какого-то глобального стора здесь), чтобы не было
 * скрытой зависимости от порядка инициализации auth-контекста.
 */
async function request<T>(
  path: string,
  token: string | null,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  loginWithTelegram: (initData: string) =>
    request<{ access_token: string; user_id: string }>(
      "/auth/telegram",
      null,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ init_data: initData }),
      }
    ),

  listAssets: (token: string) =>
    request<AssetDto[]>("/portfolio/assets", token),

  getPortfolioSummary: (token: string, baseCurrency?: string) =>
    request<PortfolioSummaryDto>(
      `/portfolio/summary${baseCurrency ? `?base_currency=${baseCurrency}` : ""}`,
      token
    ),

  uploadScreenshot: (token: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ job_id: string; status: string }>(
      "/screenshots/upload",
      token,
      { method: "POST", body: form }
    );
  },

  getScreenshotJob: (token: string, jobId: string) =>
    request<ScreenshotJobDto>(`/screenshots/${jobId}`, token),
};

export interface AssetDto {
  id: string;
  ticker: string;
  asset_type: string;
  currency: string;
  quantity: number;
  avg_purchase_price: number;
  current_price: number | null;
  market_value: number | null;
  unrealized_pnl: number | null;
  unrealized_pnl_pct: number | null;
}

export interface PortfolioSummaryDto {
  base_currency: string;
  total_market_value: number;
  total_cost_basis: number;
  total_unrealized_pnl: number;
  total_unrealized_pnl_pct: number | null;
  rates_stale: boolean;
  skipped_tickers: string[];
}

export interface ScreenshotJobDto {
  id: string;
  status: "pending" | "processing" | "done" | "failed";
  extracted_json: Record<string, unknown> | null;
  error_message: string | null;
}
