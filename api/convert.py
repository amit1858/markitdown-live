"""
MarkItDown Live — session-only conversion function.

Converts an uploaded file to Markdown entirely IN MEMORY using Microsoft's
`markitdown` library (https://github.com/microsoft/markitdown). Nothing is ever
persisted: no disk writes, no database, no logging of file names or contents.

Runs on the Vercel Python runtime using the BaseHTTPRequestHandler pattern.
API verified against markitdown 0.1.6:
  - MarkItDown().convert_stream(stream, *, stream_info=StreamInfo(...))
  - result.markdown / result.text_content hold the output
"""

import io
import json
from http.server import BaseHTTPRequestHandler

from markitdown import MarkItDown, StreamInfo

# ---- Limits & policy -------------------------------------------------------

# 4 MB hard cap. Vercel serverless functions cap request bodies at ~4.5 MB.
MAX_UPLOAD_BYTES = 4 * 1024 * 1024

# Extension allow-list (lower-case, no leading dot).
ALLOWED_EXTENSIONS = {
    "pdf", "docx", "pptx", "xlsx", "xls",
    "html", "htm", "csv", "json", "xml", "txt",
    "png", "jpg", "jpeg",
}

# A single shared converter instance is safe to reuse across invocations.
_md = MarkItDown()


# ---- Multipart parsing (in memory only) ------------------------------------

def _parse_multipart(body: bytes, content_type: str):
    """Extract the first file part from a multipart/form-data body.

    Returns (filename, file_bytes) or (None, None) if no file part is found.
    Everything stays in memory; no temp files are created.
    """
    if "boundary=" not in content_type:
        return None, None

    boundary = content_type.split("boundary=", 1)[1].strip()
    if boundary.startswith('"') and boundary.endswith('"'):
        boundary = boundary[1:-1]

    delimiter = ("--" + boundary).encode("utf-8")
    parts = body.split(delimiter)

    for part in parts:
        # Skip preamble, epilogue ("--\r\n") and empty segments.
        if not part or part in (b"\r\n", b"--\r\n", b"--"):
            continue

        header_blob, _, content = part.partition(b"\r\n\r\n")
        if not content:
            continue

        headers = header_blob.decode("utf-8", errors="replace")
        if "Content-Disposition" not in headers:
            continue
        if 'filename="' not in headers:
            continue

        filename = headers.split('filename="', 1)[1].split('"', 1)[0]

        # Strip the trailing CRLF that precedes the next boundary.
        if content.endswith(b"\r\n"):
            content = content[:-2]

        return filename, content

    return None, None


def _extension_of(filename: str) -> str:
    if "." not in filename:
        return ""
    return filename.rsplit(".", 1)[1].lower()


# ---- HTTP handler ----------------------------------------------------------

class handler(BaseHTTPRequestHandler):
    # Silence the default logger so file names are never written to logs.
    def log_message(self, *args, **kwargs):  # noqa: D401
        return

    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            content_type = self.headers.get("Content-Type", "")
            if not content_type.startswith("multipart/form-data"):
                self._send_json(400, {"error": "Expected multipart/form-data upload."})
                return

            try:
                content_length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                content_length = 0

            # Reject oversized uploads before reading the whole body.
            if content_length > MAX_UPLOAD_BYTES:
                self._send_json(
                    413,
                    {"error": "File is too large. The maximum upload size is 4 MB."},
                )
                return

            body = self.rfile.read(content_length) if content_length > 0 else b""

            # Defensive: also cap on actual bytes read.
            if len(body) > MAX_UPLOAD_BYTES:
                self._send_json(
                    413,
                    {"error": "File is too large. The maximum upload size is 4 MB."},
                )
                return

            filename, file_bytes = _parse_multipart(body, content_type)
            if not filename or file_bytes is None:
                self._send_json(400, {"error": "No file found in the upload."})
                return

            extension = _extension_of(filename)
            if extension not in ALLOWED_EXTENSIONS:
                self._send_json(
                    415,
                    {
                        "error": (
                            "Unsupported file type. Allowed types: "
                            "PDF, DOCX, PPTX, XLSX, XLS, HTML, CSV, JSON, XML, "
                            "TXT, PNG, JPG."
                        )
                    },
                )
                return

            # Convert fully in memory. Give markitdown an extension hint so it
            # selects the correct converter.
            stream = io.BytesIO(file_bytes)
            stream_info = StreamInfo(extension="." + extension, filename=filename)

            try:
                result = _md.convert_stream(stream, stream_info=stream_info)
            except Exception:
                # Never leak stack traces or file contents.
                self._send_json(
                    422,
                    {"error": "Could not convert this file. It may be corrupt or unsupported."},
                )
                return
            finally:
                stream.close()

            markdown = result.markdown or ""
            self._send_json(200, {"markdown": markdown})

        except Exception:
            self._send_json(500, {"error": "An unexpected error occurred during conversion."})

    def do_GET(self):
        self._send_json(200, {"status": "ok", "service": "markitdown-live"})
