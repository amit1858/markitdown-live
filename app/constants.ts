// Shared client/server constants for upload validation.
// These MUST stay in sync with api/convert.py.

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB

export const ALLOWED_EXTENSIONS = [
  "pdf",
  "docx",
  "pptx",
  "xlsx",
  "xls",
  "html",
  "htm",
  "csv",
  "json",
  "xml",
  "txt",
  "png",
  "jpg",
  "jpeg",
] as const;

export function extensionOf(filename: string): string {
  if (!filename.includes(".")) return "";
  return filename.split(".").pop()!.toLowerCase();
}

export function isAllowed(filename: string): boolean {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(extensionOf(filename));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
