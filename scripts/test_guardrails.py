"""HTTP-level regression tests for api/convert.py.

Drives the real `handler.do_POST` code path (the same code Vercel runs) rather
than calling markitdown directly, so it exercises multipart parsing, the size
cap, the extension allow-list, StreamInfo routing, and byte integrity.

Covers the office/binary formats (PDF, PPTX, DOCX, XLSX) that each need an
optional markitdown extra — the formats that previously failed while the
CSV/HTML happy path (which needs no extras) passed.

Run:  python scripts/test_guardrails.py
Requires the deps from requirements.txt installed in the current environment.
"""
import io
import os
import sys
import hashlib
import importlib.util

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLES = os.path.join(ROOT, "samples")

spec = importlib.util.spec_from_file_location("convert", os.path.join(ROOT, "api", "convert.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class FakeHeaders(dict):
    def get(self, k, default=None):
        for kk, vv in self.items():
            if kk.lower() == k.lower():
                return vv
        return default


def _multipart(filename, data):
    boundary = "----markitdownlivetest"
    pre = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: application/octet-stream\r\n\r\n"
    ).encode()
    body = pre + data + f"\r\n--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"


def _post(filename, data, spy=None):
    body, ctype = _multipart(filename, data)
    inst = mod.handler.__new__(mod.handler)
    inst.headers = FakeHeaders({"Content-Type": ctype, "Content-Length": str(len(body))})
    inst.rfile = io.BytesIO(body)
    out = {}
    inst._send_json = lambda s, p: out.update(status=s, payload=p)

    if spy is not None:
        original = mod._md.convert_stream

        def wrapper(stream, *, stream_info=None, **kw):
            pos = stream.tell()
            stream.seek(0)
            raw = stream.read()
            stream.seek(pos)
            spy["received_sha"] = hashlib.sha256(raw).hexdigest()
            spy["received_len"] = len(raw)
            spy["is_bytesio"] = isinstance(stream, io.BytesIO)
            spy["ext"] = stream_info.extension if stream_info else None
            spy["filename"] = stream_info.filename if stream_info else None
            return original(stream, stream_info=stream_info, **kw)

        mod._md.convert_stream = wrapper
        try:
            inst.do_POST()
        finally:
            mod._md.convert_stream = original
    else:
        inst.do_POST()
    return out


results = []


def check(name, cond, extra=""):
    results.append(cond)
    print(f"{'PASS' if cond else 'FAIL'}  {name}  {extra}")


# --- Happy path: office/binary + text formats (200 + byte integrity) --------
happy = ["sample.pdf", "sample.pptx", "sample.docx", "sample.xlsx", "sample.csv"]
for fn in happy:
    path = os.path.join(SAMPLES, fn)
    if not os.path.exists(path):
        check(f"{fn} present", False, "(sample missing)")
        continue
    src = open(path, "rb").read()
    spy = {}
    out = _post(fn, src, spy=spy)
    ok_status = out.get("status") == 200
    payload = out.get("payload", {})
    ok_md = isinstance(payload.get("markdown"), str) and len(payload.get("markdown", "")) > 0
    ok_bytes = (
        spy.get("received_sha") == hashlib.sha256(src).hexdigest()
        and spy.get("received_len") == len(src)
    )
    ok_stream = spy.get("is_bytesio") is True and spy.get("ext") == "." + fn.rsplit(".", 1)[1]
    check(
        f"{fn} -> 200 + markdown + byte-integrity + StreamInfo",
        ok_status and ok_md and ok_bytes and ok_stream,
        f"status={out.get('status')} md_chars={len(payload.get('markdown', ''))} "
        f"bytes_ok={ok_bytes} ext={spy.get('ext')}",
    )

# --- Guardrail: oversized (>4 MB) allowed type -> 413 -----------------------
over = os.path.join(SAMPLES, "oversized.csv")
if os.path.exists(over):
    out = _post("oversized.csv", open(over, "rb").read())
    check("oversized.csv -> 413", out.get("status") == 413, f"status={out.get('status')}")

# --- Guardrail: disallowed types -> 415 -------------------------------------
for fn in ["disallowed.zip", "disallowed.exe"]:
    path = os.path.join(SAMPLES, fn)
    if os.path.exists(path):
        out = _post(fn, open(path, "rb").read())
        check(f"{fn} -> 415", out.get("status") == 415, f"status={out.get('status')}")

print()
if all(results):
    print(f"ALL {len(results)} TESTS PASSED")
    sys.exit(0)
else:
    print(f"{results.count(False)} of {len(results)} TESTS FAILED")
    sys.exit(1)
