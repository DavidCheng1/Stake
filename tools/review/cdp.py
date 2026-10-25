"""Minimal Chrome DevTools Protocol driver for the review checks: headless Chrome (or Edge), JS evaluation, screenshots,
viewport and touch emulation, real mouse clicks/taps, and interception of RGS requests (record, block, rewrite)."""

import base64
import json
import os
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request

import websocket

BROWSERS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]


def find_browser():
    for path in BROWSERS:
        if os.path.exists(path):
            return path
    found = shutil.which("chrome") or shutil.which("msedge") or shutil.which("google-chrome") or shutil.which("chromium")
    if not found:
        raise RuntimeError("No Chrome or Edge found; install Chrome or add it to PATH")
    return found


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Browser:
    """One headless browser with one page. RGS requests (/wallet/*, /bet/*) are paused so they can be
    recorded (self.requests), failed (self.block) or have their JSON response rewritten (self.rewrite)."""

    def __init__(self, outdir=None, width=1280, height=800):
        self.out = outdir
        if outdir:
            os.makedirs(outdir, exist_ok=True)
        self.profile = tempfile.mkdtemp(prefix="review-chrome-")
        port = free_port()
        self.proc = subprocess.Popen(
            [find_browser(), "--headless=new", f"--remote-debugging-port={port}", f"--user-data-dir={self.profile}",
             f"--window-size={width},{height}", "--no-first-run", "--no-default-browser-check", "--mute-audio",
             f"--remote-allow-origins=http://127.0.0.1:{port}", "--autoplay-policy=no-user-gesture-required", "about:blank"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        page = None
        for _ in range(150):
            try:
                page = next(t for t in json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json")) if t["type"] == "page")
                break
            except Exception:
                time.sleep(0.2)
        if not page:
            self.close()
            raise RuntimeError("browser did not start")
        self.ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=120)
        self.mid, self.replies = 0, {}
        self.requests, self.errors = [], []
        self.block, self.rewrite, self.rewrite_any = set(), {}, None
        for m in ("Runtime.enable", "Log.enable", "Page.enable"):
            self.send(m)
        self.send("Fetch.enable", patterns=[{"urlPattern": p, "requestStage": s} for p in ("*/wallet/*", "*/bet/*") for s in ("Request", "Response")])

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass
        self.proc.kill()
        try:
            self.proc.wait(5)
        except Exception:
            pass
        shutil.rmtree(self.profile, ignore_errors=True)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    # ---- protocol
    def send(self, method, **params):
        self.mid += 1
        my = self.mid
        self.ws.send(json.dumps({"id": my, "method": method, "params": params}))
        m = self._reply(my)
        return m.get("result", m.get("error"))

    def _reply(self, my):
        """Wait for the reply to command `my`. Replies to other commands are kept: a response rewrite (which waits
        for its own reply) can run while an outer command is waiting, and must not swallow the outer reply."""
        while my not in self.replies:
            m = json.loads(self.ws.recv())
            if "id" in m:
                self.replies[m["id"]] = m
            else:
                self._handle(m)
        return self.replies.pop(my)

    def _send_nowait(self, method, **params):
        self.mid += 1
        self.ws.send(json.dumps({"id": self.mid, "method": method, "params": params}))

    def _handle(self, m):
        meth = m.get("method")
        if meth == "Runtime.consoleAPICalled" and m["params"]["type"] == "error":
            self.errors.append("console.error: " + " ".join(str(a.get("value", a.get("description", ""))) for a in m["params"]["args"])[:300])
        elif meth == "Runtime.exceptionThrown":
            d = m["params"]["exceptionDetails"]
            self.errors.append("exception: " + d.get("exception", {}).get("description", d.get("text", ""))[:300])
        elif meth == "Fetch.requestPaused":
            self._paused(m["params"])

    @staticmethod
    def rgs_path(url):
        path = "/" + url.split("://", 1)[-1].split("/", 1)[-1].split("?")[0]
        if path.startswith("/force/"):  # the mock's forced-feature prefix
            path = "/" + "/".join(path.split("/")[3:])
        return path

    def _paused(self, p):
        rid, path = p["requestId"], self.rgs_path(p["request"]["url"])
        if "responseStatusCode" not in p:
            body = p["request"].get("postData")
            self.requests.append((path, json.loads(body) if body else None))
            if any(path.startswith(b) for b in self.block):
                return self._send_nowait("Fetch.failRequest", requestId=rid, errorReason="Failed")
            return self._send_nowait("Fetch.continueRequest", requestId=rid)
        fn = self.rewrite.get(path)
        if not fn and not self.rewrite_any:
            return self._send_nowait("Fetch.continueResponse", requestId=rid)
        self.mid += 1
        my = self.mid
        self.ws.send(json.dumps({"id": my, "method": "Fetch.getResponseBody", "params": {"requestId": rid}}))
        m = self._reply(my)
        r = m.get("result", {})
        raw = base64.b64decode(r.get("body", "")) if r.get("base64Encoded") else r.get("body", "").encode()
        try:
            data = json.loads(raw)
            if self.rewrite_any:
                data = self.rewrite_any(path, data)
            if fn:
                data = fn(data)
            raw = json.dumps(data).encode()
        except ValueError:
            pass
        headers = [h for h in p.get("responseHeaders", []) if h["name"].lower() not in ("content-length", "content-encoding")]
        self._send_nowait("Fetch.fulfillRequest", requestId=rid, responseCode=p["responseStatusCode"], responseHeaders=headers,
                          body=base64.b64encode(raw).decode())

    def pump(self, sec):
        """Let the page run for `sec` seconds while handling events."""
        self.ws.settimeout(0.2)
        end = time.time() + sec
        while time.time() < end:
            try:
                m = json.loads(self.ws.recv())
                if "id" in m:
                    self.replies[m["id"]] = m
                else:
                    self._handle(m)
            except websocket.WebSocketTimeoutException:
                pass
        self.ws.settimeout(120)

    # ---- page helpers
    def ev(self, expr):
        r = self.send("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
        return (r or {}).get("result", {}).get("value")

    def init_script(self, source):
        self.send("Page.addScriptToEvaluateOnNewDocument", source=source)

    def viewport(self, w, h, mobile=False):
        self.send("Emulation.setDeviceMetricsOverride", width=w, height=h, deviceScaleFactor=1, mobile=mobile)
        self.send("Emulation.setTouchEmulationEnabled", enabled=mobile)

    def open(self, url, wait=3.0):
        self.send("Page.navigate", url=url)
        self.pump(wait)

    def wait_for(self, expr, limit=20.0, step=0.2):
        t0 = time.time()
        while time.time() - t0 < limit:
            if self.ev(expr):
                return True
            self.pump(step)
        return False

    def center(self, selector):
        return self.ev(f"(() => {{ const e = document.querySelector({json.dumps(selector)}); if (!e) return null; const r = e.getBoundingClientRect();"
                       f" return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; }})()")

    def click(self, selector, touch=False):
        """A real pointer click (or tap) at the element's centre; returns False if it is not on screen."""
        c = self.center(selector)
        if not c:
            return False
        if touch:
            self.send("Input.dispatchTouchEvent", type="touchStart", touchPoints=[{"x": c[0], "y": c[1]}])
            self.send("Input.dispatchTouchEvent", type="touchEnd", touchPoints=[])
        else:
            for t in ("mousePressed", "mouseReleased"):
                self.send("Input.dispatchMouseEvent", type=t, x=c[0], y=c[1], button="left", clickCount=1)
        return True

    def key(self, code="Space", key=" "):
        for t in ("keyDown", "keyUp"):
            self.send("Input.dispatchKeyEvent", type=t, code=code, key=key, windowsVirtualKeyCode=32 if code == "Space" else 0)

    def shot(self, name, clip_selector=None):
        if not self.out:
            return
        params = {"format": "png"}
        if clip_selector:
            r = self.ev(f"(() => {{ const r = document.querySelector({json.dumps(clip_selector)}).getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }})()")
            params["clip"] = {"x": r[0], "y": r[1], "width": r[2], "height": r[3], "scale": 2}
        with open(os.path.join(self.out, name), "wb") as f:
            f.write(base64.b64decode(self.send("Page.captureScreenshot", **params)["data"]))

    def plays(self):
        return [b for p, b in self.requests if p == "/wallet/play"]

    def paths(self):
        return [p for p, _ in self.requests]
