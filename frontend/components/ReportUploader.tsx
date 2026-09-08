"use client";

import { useState } from "react";
import { api, type ReportJob } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/app/providers";

interface ReportUploaderProps {
  brokerAccountId: string;
  onUploadComplete?: () => void;
}

export function ReportUploader({ brokerAccountId, onUploadComplete }: ReportUploaderProps) {
  const auth = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<ReportJob | null>(null);
  const [detectedBroker, setDetectedBroker] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const token = auth.status === "ready" ? auth.token : null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
      setJobStatus(null);
      setJobId(null);
      setDetectedBroker(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError("Please select a file");
      return;
    }

    if (!token) {
      setError("Not authenticated");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const response = await api.uploadReport(token, selectedFile, brokerAccountId);

      setJobId(response.job_id);
      setDetectedBroker(response.detected_broker || null);
      setJobStatus({
        id: response.job_id,
        status: response.status as ReportJob["status"],
        report_type: response.detected_broker || "unknown",
        created_at: new Date().toISOString()
      });

      // Начинаем polling статуса
      pollJobStatus(response.job_id);
    } catch (err: any) {
      setError(err.message || "Failed to upload report");
      setUploading(false);
    }
  };

  const pollJobStatus = async (id: string) => {
    if (!token) return;

    const maxAttempts = 60; // 2 минуты (60 * 2s)
    let attempts = 0;

    const poll = async () => {
      try {
        const job = await api.getReportJob(token, id);
        setJobStatus(job);

        if (job.status === "done") {
          setUploading(false);
          if (onUploadComplete) {
            onUploadComplete();
          }
          return;
        }

        if (job.status === "failed") {
          setUploading(false);
          setError(job.error_message || "Processing failed");
          return;
        }

        // Продолжаем polling если статус pending или processing
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000);
        } else {
          setUploading(false);
          setError("Processing timeout - please check status later");
        }
      } catch (err: any) {
        setUploading(false);
        setError(err.message || "Failed to check job status");
      }
    };

    poll();
  };

  const handleReset = () => {
    setSelectedFile(null);
    setJobId(null);
    setJobStatus(null);
    setDetectedBroker(null);
    setError(null);
    setUploading(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <span style={{ fontSize: "var(--text-base)", fontWeight: 600 }}>
        Загрузка отчета брокера
      </span>

      {!jobId ? (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <label style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
              Система автоматически определит брокера (IB, Bybit, TBC Capital и др.)
            </label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.xml"
              onChange={handleFileChange}
              disabled={uploading}
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "var(--color-bg-secondary)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                fontSize: "var(--text-sm)",
              }}
            />
            {selectedFile && (
              <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", margin: 0 }}>
                {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} МБ)
              </p>
            )}
          </div>

          <Button
            type="button"
            variant="primary"
            fullWidth
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
          >
            {uploading ? "Загрузка..." : "Загрузить отчет"}
          </Button>
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <div
            style={{
              padding: "var(--space-3)",
              background: "var(--color-bg-secondary)",
              borderRadius: "var(--radius-md)",
            }}
          >
            {detectedBroker && (
              <p style={{ fontSize: "var(--text-sm)", margin: "0 0 8px 0" }}>
                Определен: <strong style={{ color: "var(--color-accent)" }}>{detectedBroker}</strong>
              </p>
            )}
            <p style={{ fontSize: "var(--text-sm)", margin: "0 0 4px 0", color: "var(--color-text-secondary)" }}>
              ID: {jobId}
            </p>
            <p style={{ fontSize: "var(--text-sm)", margin: 0 }}>
              Статус: <strong>{jobStatus?.status === "pending" ? "ожидание" : jobStatus?.status === "processing" ? "обработка" : jobStatus?.status}</strong>
            </p>
            {jobStatus?.status === "processing" && (
              <p style={{ fontSize: "var(--text-sm)", margin: "8px 0 0 0", color: "var(--color-text-secondary)" }}>
                Обрабатываем отчет, подождите...
              </p>
            )}
          </div>

          {jobStatus?.status === "done" && (
            <div
              style={{
                padding: "var(--space-3)",
                background: "rgba(34, 197, 94, 0.1)",
                border: "1px solid rgba(34, 197, 94, 0.3)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <p style={{ fontWeight: 600, margin: "0 0 8px 0" }}>✓ Импорт завершен</p>
              <ul style={{ fontSize: "var(--text-sm)", margin: 0, paddingLeft: "20px" }}>
                <li>Распознано сделок: {jobStatus.parsed_trades_count}</li>
                <li>Создано активов: {jobStatus.imported_assets_count}</li>
                <li>Создано транзакций: {jobStatus.imported_transactions_count}</li>
              </ul>
              {jobStatus.parsing_warnings && jobStatus.parsing_warnings.length > 0 && (
                <details style={{ marginTop: "8px" }}>
                  <summary style={{ fontSize: "var(--text-sm)", cursor: "pointer", color: "var(--color-text-secondary)" }}>
                    {jobStatus.parsing_warnings.length} предупреждений
                  </summary>
                  <ul style={{ fontSize: "var(--text-xs)", margin: "8px 0 0 0", paddingLeft: "20px", color: "var(--color-text-secondary)" }}>
                    {jobStatus.parsing_warnings.map((w, i) => (
                      <li key={i}>
                        {w.line_number ? `Строка ${w.line_number}: ` : ""}{w.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {jobStatus?.status === "failed" && (
            <div
              style={{
                padding: "var(--space-3)",
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <p style={{ fontWeight: 600, margin: "0 0 8px 0" }}>✗ Ошибка обработки</p>
              <p style={{ fontSize: "var(--text-sm)", margin: 0 }}>{jobStatus.error_message}</p>
            </div>
          )}

          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={handleReset}
            disabled={uploading}
          >
            Загрузить другой отчет
          </Button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            padding: "var(--space-3)",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--text-sm)",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
