"use client";

import { useCallback, useRef, useState } from "react";
import {
  ALLOWED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  formatBytes,
  isAllowed,
} from "@/app/constants";

type DropzoneProps = {
  file: File | null;
  onFileSelected: (file: File) => void;
  onValidationError: (message: string) => void;
  disabled?: boolean;
};

export default function Dropzone({
  file,
  onFileSelected,
  onValidationError,
  disabled = false,
}: DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndSelect = useCallback(
    (candidate: File) => {
      if (!isAllowed(candidate.name)) {
        onValidationError(
          "Unsupported file type. Allowed: PDF, DOCX, PPTX, XLSX, XLS, HTML, CSV, JSON, XML, TXT, PNG, JPG.",
        );
        return;
      }
      if (candidate.size > MAX_UPLOAD_BYTES) {
        onValidationError(
          `That file is ${formatBytes(candidate.size)}. The maximum upload size is 4 MB.`,
        );
        return;
      }
      onFileSelected(candidate);
    },
    [onFileSelected, onValidationError],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const dropped = e.dataTransfer.files?.[0];
      if (dropped) validateAndSelect(dropped);
    },
    [disabled, validateAndSelect],
  );

  const openPicker = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openPicker();
      }
    },
    [openPicker],
  );

  const accept = ALLOWED_EXTENSIONS.map((e) => "." + e).join(",");

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Upload a file to convert to Markdown. Drag and drop or press Enter to browse."
      aria-disabled={disabled}
      onClick={openPicker}
      onKeyDown={onKeyDown}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={[
        "flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        isDragging
          ? "border-blue-500 bg-blue-50"
          : "border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50",
      ].join(" ")}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const chosen = e.target.files?.[0];
          if (chosen) validateAndSelect(chosen);
          // Allow re-selecting the same file after a reset.
          e.target.value = "";
        }}
      />

      <svg
        aria-hidden="true"
        className="h-10 w-10 text-slate-400"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
        />
      </svg>

      {file ? (
        <div>
          <p className="font-medium text-slate-800">{file.name}</p>
          <p className="text-sm text-slate-500">{formatBytes(file.size)}</p>
          <p className="mt-1 text-xs text-blue-600">Click or drop to choose a different file</p>
        </div>
      ) : (
        <div>
          <p className="font-medium text-slate-700">
            Drag &amp; drop a file here, or click to browse
          </p>
          <p className="mt-1 text-sm text-slate-500">
            PDF, Word, PowerPoint, Excel, HTML, CSV, JSON, XML, images · max 4 MB
          </p>
        </div>
      )}
    </div>
  );
}
