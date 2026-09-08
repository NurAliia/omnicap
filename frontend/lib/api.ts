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

  uploadScreenshot: (token: string, file: File, brokerAccountId?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (brokerAccountId) form.append("broker_account_id", brokerAccountId);
    return request<{ job_id: string; status: string }>(
      "/screenshots/upload",
      token,
      { method: "POST", body: form }
    );
  },

  getScreenshotJob: (token: string, jobId: string) =>
    request<ScreenshotJobDto>(`/screenshots/${jobId}`, token),

  addManualAsset: (token: string, payload: ManualAssetInput) =>
    request<{ status: string }>("/portfolio/assets/manual", token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  listBrokerAccounts: (token: string) =>
    request<BrokerAccountDto[]>("/broker-accounts", token),

  createBrokerAccount: (token: string, brokerName: string) =>
    request<BrokerAccountDto>("/broker-accounts", token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ broker_name: brokerName }),
    }),

  uploadReport: (token: string, file: File, brokerAccountId: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("broker_account_id", brokerAccountId);
    return request<{ job_id: string; status: string; detected_broker?: string }>(
      "/reports/upload",
      token,
      { method: "POST", body: form }
    );
  },

  getReportJob: (token: string, jobId: string) =>
    request<ReportJob>(`/reports/${jobId}`, token),
};

export interface BrokerAccountDto {
  id: string;
  broker_name: string;
  base_currency: string;
  created_at: string;
}

export interface ManualAssetInput {
  ticker: string;
  asset_type: "stock" | "etf" | "bond" | "crypto" | "currency" | "other";
  currency: string;
  quantity: number;
  price: number;
  date: string | null;
  broker_account_id?: string | null;
}

export interface AssetDto {
  id: string;
  broker_account_id: string | null;
  broker_name: string | null;
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

export interface ReportJob {
  id: string;
  status: "pending" | "processing" | "done" | "failed";
  report_type: string;
  parsed_trades_count?: number;
  imported_assets_count?: number;
  imported_transactions_count?: number;
  error_message?: string;
  parsing_warnings?: Array<{ line_number?: number; message: string }>;
  created_at: string;
  processed_at?: string;
}
