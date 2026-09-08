"use client";

import { useState } from "react";
import { api } from "@/lib/api";

interface ReportUploaderProps {
  brokerAccountId: string;
  onUploadComplete?: () => void;
}

interface ReportJob {
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

export function ReportUploader({ brokerAccountId, onUploadComplete }: ReportUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<ReportJob | null>(null);
  const [detectedBroker, setDetectedBroker] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("broker_account_id", brokerAccountId);

      const response = await api.post<{
        job_id: string;
        status: string;
        detected_broker?: string;
      }>("/reports/upload", formData);

      setJobId(response.job_id);
      setDetectedBroker(response.detected_broker || null);
      setJobStatus({
        ...response,
        report_type: response.detected_broker || "unknown",
        created_at: new Date().toISOString()
      } as ReportJob);

      // Начинаем polling статуса
      pollJobStatus(response.job_id);
    } catch (err: any) {
      setError(err.message || "Failed to upload report");
      setUploading(false);
    }
  };

  const pollJobStatus = async (id: string) => {
    const maxAttempts = 60; // 2 минуты (60 * 2s)
    let attempts = 0;

    const poll = async () => {
      try {
        const job = await api.get<ReportJob>(`/reports/${id}`);
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
    <div className="space-y-4 p-4 border rounded-lg bg-white">
      <h3 className="text-lg font-semibold">Upload Broker Report</h3>

      {!jobId ? (
        <>
          <div>
            <label className="block text-sm font-medium mb-2">Select Report File</label>
            <p className="text-xs text-gray-500 mb-2">
              We'll automatically detect your broker (IB, Bybit, TBC Capital, etc.)
            </p>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.xml"
              onChange={handleFileChange}
              className="w-full p-2 border rounded"
              disabled={uploading}
            />
            {selectedFile && (
              <p className="text-sm text-gray-600 mt-1">
                Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-700"
          >
            {uploading ? "Uploading..." : "Upload Report"}
          </button>
        </>
      ) : (
        <div className="space-y-3">
          <div className="p-3 bg-gray-50 rounded">
            {detectedBroker && (
              <p className="text-sm font-medium mb-1">
                Detected: <span className="text-blue-600">{detectedBroker}</span>
              </p>
            )}
            <p className="text-sm font-medium">Job ID: {jobId}</p>
            <p className="text-sm">
              Status: <span className="font-semibold">{jobStatus?.status}</span>
            </p>
            {jobStatus?.status === "processing" && (
              <p className="text-sm text-gray-600">Processing report, please wait...</p>
            )}
          </div>

          {jobStatus?.status === "done" && (
            <div className="p-3 bg-green-50 border border-green-200 rounded">
              <p className="font-semibold text-green-800">✓ Import Completed</p>
              <ul className="text-sm text-green-700 mt-2 space-y-1">
                <li>Parsed trades: {jobStatus.parsed_trades_count}</li>
                <li>Imported assets: {jobStatus.imported_assets_count}</li>
                <li>Imported transactions: {jobStatus.imported_transactions_count}</li>
              </ul>
              {jobStatus.parsing_warnings && jobStatus.parsing_warnings.length > 0 && (
                <details className="mt-2">
                  <summary className="text-sm text-yellow-700 cursor-pointer">
                    {jobStatus.parsing_warnings.length} warnings
                  </summary>
                  <ul className="text-xs text-yellow-600 mt-1 space-y-1 pl-4">
                    {jobStatus.parsing_warnings.map((w, i) => (
                      <li key={i}>
                        {w.line_number ? `Line ${w.line_number}: ` : ""}{w.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {jobStatus?.status === "failed" && (
            <div className="p-3 bg-red-50 border border-red-200 rounded">
              <p className="font-semibold text-red-800">✗ Processing Failed</p>
              <p className="text-sm text-red-700 mt-1">{jobStatus.error_message}</p>
            </div>
          )}

          <button
            onClick={handleReset}
            disabled={uploading}
            className="w-full py-2 px-4 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Upload Another Report
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
}
