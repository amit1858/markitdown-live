# MarkItDown Live

A single-page web app that converts files to **Markdown** instantly using
Microsoft's [`markitdown`](https://github.com/microsoft/markitdown) library.
Upload a PDF, Word, PowerPoint, Excel, HTML, CSV, JSON, XML, or image file and
get clean Markdown you can preview, copy, and download.

> **Session-only by design.** Nothing is ever stored. Files are converted
> entirely in memory on the server and held only in React state in the browser.
> **Refreshing the page wipes everything.**

> **Conversion engine:** [microsoft/markitdown](https://github.com/microsoft/markitdown)
> (MIT License) — © Microsoft. This project uses it as the file-to-Markdown engine.

---

## What it does

- Drag-and-drop or click-to-browse file upload.
- Converts to Markdown via `markitdown` (`convert_stream`, fully in memory).
- **Preview** (rendered with `react-markdown` + `remark-gfm` for tables) and
  **Raw Markdown** views.
- **Copy to clipboard** and **Download .md** (client-side, original filename).
- Client- and server-side validation: 4 MB cap + extension allow-list.

Supported types: `pdf, docx, pptx, xlsx, xls, html, htm, csv, json, xml, txt,
png, jpg, jpeg`.

---

## How the no-storage design works

- **Backend** (`api/convert.py`): reads the multipart upload into `io.BytesIO`
  and calls `MarkItDown().convert_stream(stream, stream_info=StreamInfo(...))`.
  No disk writes, no database, no caching. File names and contents are never
  logged. On failure it returns a safe error with no stack traces.
- **Frontend**: the selected file and resulting Markdown live only in React
  `useState`. No `localStorage`, `sessionStorage`, cookies, or IndexedDB. A
  browser refresh returns the app to a blank slate.
- No analytics or telemetry.

---

## Architecture

| Layer          | Tech                                                        |
| -------------- | ----------------------------------------------------------- |
| Frontend       | Next.js (App Router) + React + TypeScript + Tailwind CSS    |
| Conversion API | Python serverless function at `api/convert.py` (Vercel)     |
| Engine         | `markitdown[pdf,docx,pptx,xlsx,xls,outlook]` (v0.1.6)       |

```
/
├─ app/                 # Next.js App Router UI
│  ├─ page.tsx          # single-page UI (all state in useState)
│  ├─ layout.tsx
│  ├─ globals.css
│  └─ constants.ts      # shared validation constants
├─ components/
│  ├─ Dropzone.tsx      # drag-and-drop + file picker
│  └─ MarkdownResult.tsx# preview/raw toggle + copy + download
├─ api/
│  └─ convert.py        # Python serverless conversion function
├─ requirements.txt     # Python deps for the function
├─ vercel.json          # runtime + function config
├─ package.json
├─ tailwind.config.ts
├─ tsconfig.json
└─ README.md
```

---

## Supported formats & dependencies

Text-based formats work with the base install. Office and PDF formats each
require a MarkItDown "extra" — all bundled in our single requirements.txt pin:
`markitdown[pdf,docx,pptx,xlsx,xls,outlook]`.

| Format          | Extensions        | Needs an extra?    | Installed via       |
| --------------- | ----------------- | ------------------ | ------------------- |
| HTML            | .html, .htm       | No — built-in      | —                   |
| CSV             | .csv              | No — built-in      | —                   |
| JSON            | .json             | No — built-in      | —                   |
| XML             | .xml              | No — built-in      | —                   |
| Plain text      | .txt              | No — built-in      | —                   |
| PDF             | .pdf              | Yes                | markitdown[pdf]     |
| Word            | .docx             | Yes                | markitdown[docx]    |
| PowerPoint      | .pptx             | Yes                | markitdown[pptx]    |
| Excel           | .xlsx             | Yes                | markitdown[xlsx]    |
| Excel (legacy)  | .xls              | Yes                | markitdown[xls]     |
| Outlook message | .msg              | Yes                | markitdown[outlook] |
| Images          | .png, .jpg, .jpeg | No (EXIF/metadata) | —                   |

Image note: images return EXIF/metadata and directly extractable text only. Full
visual description/OCR needs an optional LLM client (`llm_client` / `llm_model`),
which this app does not configure — so image output is intentionally minimal.

> **`.msg` note:** the `[outlook]` extra is bundled in `requirements.txt`, but
> `.msg` is **not currently in the upload allow-list**, so `.msg` uploads return
> `415`. To enable them, add `"msg"` to `ALLOWED_EXTENSIONS` in both
> `api/convert.py` and `app/constants.ts`.

Troubleshooting "Conversion failed": if text formats convert but a
PDF/DOCX/PPTX/XLSX fails, the matching extra isn't importable in that runtime
(see the ARM64 note for local dev). Confirm `requirements.txt` pins the extras and
the build installed them — a `MissingDependencyException` names the exact one
(set `MARKITDOWN_DEBUG=1` locally to see it).

---

## Local development

### Prerequisites
- Node.js 18.17+ and npm
- Python 3.12 (only needed if you run the function locally via `vercel dev`)
- The [Vercel CLI](https://vercel.com/docs/cli): `npm i -g vercel`

### 1. Frontend only

```bash
npm install
npm run dev
```

Open http://localhost:3000. Note: `npm run dev` serves only the Next.js
frontend — the `/api/convert` Python function does **not** run under `next dev`.

### 2. Frontend + Python function together (recommended)

Use the Vercel CLI, which runs the Python serverless function locally exactly as
it does in production:

```bash
npm install
vercel dev
```

The first `vercel dev` run installs the Python dependencies from
`requirements.txt` automatically. Uploading a sample PDF/DOCX will return
rendered Markdown at http://localhost:3000.

> **⚠️ ARM64 Windows caveat.** Some optional markitdown extras have native
> dependencies (e.g. `pdfminer.six` → `cryptography`, and `lxml`) that may not
> have prebuilt **win-arm64** wheels. On an ARM64 Windows machine, `vercel dev`
> can fail to build them locally, so **PDF/DOCX/PPTX/XLSX** conversions will
> return a 422 locally even though the code is correct. The Vercel build runs on
> **Linux x86_64**, where prebuilt wheels exist and all formats work. To validate
> office formats locally on ARM64, use an **x64 Python** toolchain or test on a
> Vercel **preview deployment**. Text formats (CSV/HTML/JSON/XML/TXT) need no
> extras and always work locally.

### Debugging conversion failures

Conversion errors return a safe, generic message by default. For local
debugging, set `MARKITDOWN_DEBUG=1` and the API will include a `detail` field
with the real exception (e.g. markitdown's `MissingDependencyException`). This is
**off by default and must never be enabled in production** — it is read from the
environment and never hardcoded.

```bash
# macOS/Linux
MARKITDOWN_DEBUG=1 vercel dev
# Windows PowerShell
$env:MARKITDOWN_DEBUG=1; vercel dev
```

### Tests

An HTTP-level regression suite drives the real handler for the office/binary
formats (PDF, PPTX, DOCX, XLSX) plus the guardrails, and asserts byte-for-byte
integrity of the uploaded bytes:

```bash
# Requires the deps from requirements.txt installed locally.
python scripts/test_guardrails.py
```

---

## Deploy to Vercel

The repo deploys with zero manual config beyond the CLI:

```bash
vercel        # preview deployment
vercel deploy --prod   # production deployment
```

Or connect the repository in the Vercel dashboard (Framework preset: **Next.js**).
`vercel.json` already:
- registers `api/convert.py` as a Python serverless function, and
- sets the function `maxDuration` to 60 seconds.

No environment variables are required.

---

## Plan limits (important)

- **Request body cap ~4.5 MB.** Vercel serverless functions cap the request body
  at roughly 4.5 MB, so this app enforces a **4 MB** upload limit on both client
  and server.
- **Function duration.** `vercel.json` sets `maxDuration: 60`. **60s is the
  maximum for classic Serverless functions on the Hobby plan** (the default is
  10s), so this value deploys fine on Hobby. To go **beyond 60s** you need the
  **Pro** plan (up to 300s) or Vercel **Fluid Compute** enabled. To change it,
  edit `functions["api/convert.py"].maxDuration` in `vercel.json`. (Vercel's
  `vercel.json` is strict JSON and can't hold inline comments, so the guidance
  lives here.)
- **Function size ≤ 250 MB unzipped.** We install only
  `markitdown[pdf,docx,pptx,xlsx,xls,outlook]` (not `[all]`, audio, or youtube)
  to stay well under the limit.

---

## Security

- Only the uploaded byte stream is ever converted — no remote URL fetching and no
  local path access from user input.
- Size cap + extension allow-list enforced on both client and server.
- Conversion errors return safe, non-leaking JSON messages.
- No secrets required; if you add an env var, document it here and never hardcode
  it.

---

## Abuse protection / rate limiting

`/api/convert` is a public upload endpoint. **Basic per-IP rate limiting is
deferred to post-MVP** and is intentionally **not** implemented in code, because:

- Serverless functions don't share memory between invocations, so an in-process
  counter can't rate-limit reliably.
- A durable rate limiter needs an external store (e.g. Upstash Redis / Vercel KV),
  which would conflict with this app's **strict no-storage** design.

Recommended, no-storage-friendly options for production:

- **Vercel Firewall / Attack Challenge Mode** (platform-level, no code, no
  retention of file contents) to absorb bursts and bots.
- Vercel WAF custom rules to rate-limit `POST /api/convert` by IP at the edge.

The existing **4 MB size cap** and **extension allow-list** already bound the work
each request can trigger, limiting abuse impact in the meantime.

---

## Sample files

The `samples/` directory contains files that exercise both the happy path and the
guardrails:

| File              | Expected result                             |
| ----------------- | ------------------------------------------- |
| `sample.pdf`      | `200` → GFM Markdown                         |
| `sample.docx`     | `200` → GFM Markdown (heading, list, table) |
| `sample.csv`      | `200` → GFM Markdown table                   |
| `oversized.csv`   | `413` → over the 4 MB cap                     |
| `disallowed.zip`  | `415` → type not in the allow-list           |
| `disallowed.exe`  | `415` → type not in the allow-list           |

A self-contained guardrail test drives the handler directly:

```bash
# Requires the Python deps from requirements.txt installed locally.
python scripts/test_guardrails.py
```

It asserts `200` for the happy-path files and `413` / `415` for the guardrail files.

---

## License

Uses **Microsoft MarkItDown** ([microsoft/markitdown](https://github.com/microsoft/markitdown),
MIT License) as the conversion engine. This project is provided as-is.
