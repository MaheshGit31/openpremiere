from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

ROOT = Path(__file__).resolve().parent.parent
app = FastAPI()

class Isolate(BaseHTTPMiddleware):
    async def dispatch(self, req, call_next):
        r = await call_next(req)
        r.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        r.headers["Cross-Origin-Embedder-Policy"] = "credentialless"
        r.headers["Cache-Control"] = "no-cache"
        return r

app.add_middleware(Isolate)

@app.get("/health")
def health():
    return {"ok": True}

app.mount("/", StaticFiles(directory=ROOT, html=True), name="static")
