"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownResultProps = {
  markdown: string;
  originalFilename: string;
};

type Tab = "preview" | "raw";

function downloadMarkdown(markdown: string, originalFilename: string) {
  const base = originalFilename.includes(".")
    ? originalFilename.slice(0, originalFilename.lastIndexOf("."))
    : originalFilename;
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${base || "converted"}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function MarkdownResult({
  markdown,
  originalFilename,
}: MarkdownResultProps) {
  const [tab, setTab] = useState<Tab>("preview");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard may be unavailable; fail silently in the UI.
    }
  };

  return (
    <section
      aria-label="Conversion result"
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Markdown view"
          className="inline-flex rounded-lg bg-slate-100 p-1"
        >
          <button
            role="tab"
            aria-selected={tab === "preview"}
            onClick={() => setTab("preview")}
            className={[
              "rounded-md px-3 py-1.5 text-sm font-medium transition",
              tab === "preview" ? "bg-white text-slate-900 shadow" : "text-slate-500 hover:text-slate-700",
            ].join(" ")}
          >
            Preview
          </button>
          <button
            role="tab"
            aria-selected={tab === "raw"}
            onClick={() => setTab("raw")}
            className={[
              "rounded-md px-3 py-1.5 text-sm font-medium transition",
              tab === "raw" ? "bg-white text-slate-900 shadow" : "text-slate-500 hover:text-slate-700",
            ].join(" ")}
          >
            Raw Markdown
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <button
            onClick={() => downloadMarkdown(markdown, originalFilename)}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Download .md
          </button>
        </div>
      </div>

      <div className="max-h-[60vh] overflow-auto p-5">
        {tab === "preview" ? (
          markdown.trim() ? (
            <div className="markdown-preview">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              The converter returned no text content for this file.
            </p>
          )
        ) : (
          <pre className="whitespace-pre-wrap break-words font-mono text-sm text-slate-800">
            {markdown}
          </pre>
        )}
      </div>
    </section>
  );
}
