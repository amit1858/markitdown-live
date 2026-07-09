import io, os, json, importlib.util

spec = importlib.util.spec_from_file_location("convert", os.path.join("api", "convert.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class FakeHeaders(dict):
    def get(self, k, default=None):
        for kk, vv in self.items():
            if kk.lower() == k.lower():
                return vv
        return default

def make_multipart(filename, data, ctype="application/octet-stream"):
    boundary = "----guardrail"
    pre = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {ctype}\r\n\r\n"
    ).encode()
    post = f"\r\n--{boundary}--\r\n".encode()
    body = pre + data + post
    return body, f"multipart/form-data; boundary={boundary}"

def run_case(filename):
    with open(os.path.join("samples", filename), "rb") as f:
        data = f.read()
    body, ctype = make_multipart(filename, data)
    inst = mod.handler.__new__(mod.handler)
    inst.headers = FakeHeaders({
        "Content-Type": ctype,
        "Content-Length": str(len(body)),
    })
    inst.rfile = io.BytesIO(body)
    captured = {}
    def fake_send(status, payload):
        captured["status"] = status
        captured["payload"] = payload
    inst._send_json = fake_send
    inst.do_POST()
    return captured["status"], captured["payload"]

cases = [
    ("sample.csv", 200),
    ("sample.docx", 200),
    ("sample.pdf", 200),
    ("oversized.csv", 413),
    ("disallowed.zip", 415),
    ("disallowed.exe", 415),
]

all_ok = True
for fn, expected in cases:
    status, payload = run_case(fn)
    ok = status == expected
    all_ok = all_ok and ok
    detail = payload.get("error") if status != 200 else f"markdown[{len(payload.get('markdown',''))} chars]"
    print(f"{'PASS' if ok else 'FAIL'}  {fn:16s} -> {status} (expected {expected})  {detail}")

print("\nALL GUARDRAIL TESTS PASSED" if all_ok else "\nSOME TESTS FAILED")
