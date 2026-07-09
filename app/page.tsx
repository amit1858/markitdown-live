"use client";

import { useState } from "react";
import Dropzone from "@/components/Dropzone";
import MarkdownResult from "@/components/MarkdownResult";

type Status = "idle" | "loading" | "done";

export default function Home() {
  // All state is in-memory only. A refresh wipes everything — by design.
  const [file, setFile] = useState<File | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setMarkdown(null);
    setStatus("idle");
    setError(null);
  };

  const handleConvert = async () => {
    if (!file) return;
    setStatus("loading");
    setError(null);
    setMarkdown(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/convert", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || "Conversion failed. Please try a different file.");
        setStatus("idle");
        return;
      }

      setMarkdown(data.markdown ?? "");
      setStatus("done");
    } catch {
      setError("Could not reach the conversion service. Please try again.");
      setStatus("idle");
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-10 sm:py-16">
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          MarkItDown&nbsp;Live
        </h1>
        <p className="mt-2 text-slate-600">
          Convert PDF, Word, PowerPoint, Excel, HTML, CSV, JSON, XML &amp; images to Markdown instantly.
        </p>
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
          <span aria-hidden="true">🔒</span>
          Your files are never stored — everything clears when you refresh.
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            className="shrink-0 rounded p-0.5 text-red-500 hover:text-red-700"
          >
            ✕
          </button>
        </div>
      )}

      {status !== "done" && (
        <>
          <Dropzone
            file={file}
            onFileSelected={(f) => {
              setFile(f);
              setError(null);
            }}
            onValidationError={setError}
            disabled={status === "loading"}
          />

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleConvert}
              disabled={!file || status === "loading"}
              className="rounded-xl bg-blue-600 px-6 py-2.5 font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "loading" ? "Converting…" : "Convert to Markdown"}
            </button>
            {file && status !== "loading" && (
              <button
                onClick={reset}
                className="rounded-xl border border-slate-300 px-4 py-2.5 font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Clear
              </button>
            )}
          </div>
        </>
      )}

      {status === "done" && markdown !== null && (
        <div className="flex flex-col gap-4">
          <MarkdownResult markdown={markdown} originalFilename={file?.name ?? "converted"} />
          <div className="flex justify-center">
            <button
              onClick={reset}
              className="rounded-xl bg-blue-600 px-6 py-2.5 font-medium text-white transition hover:bg-blue-500"
            >
              Convert another file
            </button>
          </div>
        </div>
      )}

      <footer className="mt-auto pt-8 text-center text-xs text-slate-400">
        Powered by{" "}
        <a
          href="https://github.com/microsoft/markitdown"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-slate-600"
        >
          Microsoft MarkItDown
        </a>
        . In-memory conversion · no storage · no tracking.
      </footer>
    </main>
  );
}
