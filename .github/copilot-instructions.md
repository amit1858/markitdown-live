# Project rules for MarkItDown Live

These rules are non-negotiable. All code suggestions must comply.

## Storage & privacy
- **Never persist user uploads or conversion output. In-memory only.** No database,
  blob storage, cache, or file logging anywhere.
- The backend converts uploaded bytes with `io.BytesIO`. Never write user data to
  disk. If a temp path were ever unavoidable, use `/tmp` and delete it in a
  `finally` block — but prefer pure in-memory.
- **Frontend state must live in React `useState` — no `localStorage`,
  `sessionStorage`, cookies, or IndexedDB.** A browser refresh must return the app
  to its empty state.
- No analytics or telemetry that captures file names or contents. Do not log file
  names or file contents on the server.
- **Rate-limiter exception:** the edge middleware may store *only* per-IP request
  counters in KV (an IP key + integer + TTL). It must never store, read, or log
  file names or contents. Uploaded bytes must never reach the middleware/KV layer.

## Conversion engine
- **The conversion engine is `microsoft/markitdown`. Verify API usage against
  https://github.com/microsoft/markitdown, not from memory.**
- **Backend must call `markitdown` `convert_stream` on in-memory bytes; never disk,
  never URLs.** Pass a `StreamInfo(extension=..., filename=...)` hint so the right
  converter is chosen. Read the result from `result.markdown`.
- Do not install `markitdown[all]`, audio-transcription, or youtube extras. Only
  `markitdown[pdf,docx,pptx,xlsx,xls]`.

## Validation & security
- **Respect the 4 MB upload cap and the extension allow-list** on BOTH client and
  server. Allow-list: pdf, docx, pptx, xlsx, xls, html, htm, csv, json, xml, txt,
  png, jpg, jpeg.
- Never fetch remote URLs or open local paths from user input.
- On conversion failure, return a safe error — never echo stack traces or file
  contents.
- No secrets are required. If an env var is ever added, document it in the README
  and never hardcode it.

## Stack
- Next.js (App Router) + React + TypeScript + Tailwind CSS.
- Conversion API is a Python serverless function at `api/convert.py` (Vercel).
