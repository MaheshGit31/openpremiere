import os, re, time, asyncio
from pathlib import Path
import httpx
from fastapi import Query, HTTPException, Response
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

UA = {"User-Agent": "OpenPremiere/0.3 (+https://github.com/MaheshGit31/openpremiere)"}
_cache = {}
def cget(k):
    v = _cache.get(k)
    if v and v[0] > time.time(): return v[1]
def cput(k, val, ttl=900):
    if len(_cache) > 500: _cache.clear()
    _cache[k] = (time.time() + ttl, val); return val

_tok = {"v": None, "exp": 0}
async def ov_headers(c):
    """Optional Openverse OAuth (higher rate limit) when OPENVERSE_ID / OPENVERSE_SECRET are set."""
    h = dict(UA); cid, sec = os.environ.get("OPENVERSE_ID"), os.environ.get("OPENVERSE_SECRET")
    if cid and sec:
        if not _tok["v"] or _tok["exp"] < time.time():
            r = await c.post("https://api.openverse.org/v1/auth_tokens/token/", data={"grant_type": "client_credentials", "client_id": cid, "client_secret": sec}, headers=UA)
            if r.status_code == 200: j = r.json(); _tok.update(v=j["access_token"], exp=time.time() + j.get("expires_in", 3600) - 60)
        if _tok["v"]: h["Authorization"] = "Bearer " + _tok["v"]
    return h

def lic(r):
    l = (r.get("license") or "").upper(); v = r.get("license_version") or ""
    return ("CC0" if l == "CC0" else "CC " + l + (" " + v if v else "")).strip()

@app.get("/api/lib/sfx")
async def lib_sfx(q: str = "", page: int = 1, source: str = "all", n: int = 20):
    q = q.strip()[:80] or "whoosh"; page = max(1, min(page, 50)); n = max(6, min(n, 20))
    key = ("sfx", q, page, source, n)
    hit = cget(key)
    if hit: return hit
    out = []; total = 0
    async with httpx.AsyncClient(timeout=15) as c:
        try:
            p = {"q": q, "page": page, "page_size": n, "license_type": "all-cc"}
            if source != "all": p["source"] = source
            r = await c.get("https://api.openverse.org/v1/audio/", params=p, headers=await ov_headers(c))
            if r.status_code == 200:
                j = r.json(); total = j.get("result_count", 0)
                for a in j.get("results", []):
                    if (a.get("filetype") or "") not in ("mp3", "ogg", "oga", "wav", "flac", "opus", ""): continue
                    out.append({"id": a["id"], "title": a.get("title") or "Untitled", "url": a["url"], "creator": a.get("creator") or "", "license": lic(a), "licenseUrl": a.get("license_url"),
                                "dur": (a.get("duration") or 0) / 1000, "source": a.get("source"), "landing": a.get("foreign_landing_url"), "ext": a.get("filetype") or "mp3"})
        except Exception:
            pass
        if not out:  # fallback: Wikimedia Commons audio
            try:
                r = await c.get("https://commons.wikimedia.org/w/api.php", params={"action": "query", "generator": "search", "gsrsearch": "filetype:audio " + q, "gsrnamespace": 6, "gsrlimit": n, "gsroffset": (page - 1) * n,
                                "prop": "imageinfo", "iiprop": "url|mime|size|extmetadata", "format": "json"}, headers=UA)
                pages = (r.json().get("query") or {}).get("pages") or {}
                for pg in sorted(pages.values(), key=lambda x: x.get("index", 0)):
                    ii = (pg.get("imageinfo") or [{}])[0]; md = ii.get("extmetadata") or {}
                    out.append({"id": "wm" + str(pg["pageid"]), "title": re.sub(r"^File:|\.\w+$", "", pg["title"]), "url": ii.get("url", ""), "creator": re.sub("<[^>]+>", "", (md.get("Artist") or {}).get("value", ""))[:60],
                                "license": (md.get("LicenseShortName") or {}).get("value", "CC"), "licenseUrl": (md.get("LicenseUrl") or {}).get("value"), "dur": ii.get("duration") or 0, "source": "wikimedia", "landing": ii.get("descriptionurl"), "ext": (ii.get("url") or "x.ogg").rsplit(".", 1)[-1]})
                total = len(out)
            except Exception:
                pass
    res = {"total": total, "page": page, "items": out}
    return cput(key, res, 900) if out else res

_imgflip = {"t": 0, "v": []}
@app.get("/api/lib/templates")
async def lib_templates():
    if _imgflip["v"] and _imgflip["t"] > time.time(): return {"items": _imgflip["v"]}
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get("https://api.imgflip.com/get_memes", headers=UA)
    items = [{"id": m["id"], "title": m["name"], "url": m["url"], "w": m["width"], "h": m["height"], "source": "imgflip"} for m in r.json().get("data", {}).get("memes", [])]
    _imgflip.update(t=time.time() + 3600, v=items); return {"items": items}

SUBS = {"memes", "dankmemes", "wholesomememes", "me_irl", "ProgrammerHumor", "AdviceAnimals", "HistoryMemes", "MemeEconomy", "PrequelMemes", "funny", "reactiongifs", "okbuddyretard"}
@app.get("/api/lib/reddit")
async def lib_reddit(sub: str = "memes", n: int = 20):
    if sub not in SUBS: raise HTTPException(400, "unknown subreddit")
    n = max(5, min(n, 30))
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"https://meme-api.com/gimme/{sub}/{n}", headers=UA)
    if r.status_code != 200: return {"items": []}
    items = [{"id": m["postLink"], "title": m["title"], "url": m["url"], "thumb": (m.get("preview") or [m["url"]])[min(2, len(m.get("preview") or [1]) - 1)] if m.get("preview") else m["url"], "author": m.get("author"), "ups": m.get("ups"), "landing": m["postLink"], "source": "reddit/" + sub}
             for m in r.json().get("memes", []) if not m.get("nsfw") and re.search(r"\.(jpe?g|png|gif|webp)$", m["url"], re.I)]
    return {"items": items}

ALLOW = ("cdn.freesound.org", "upload.wikimedia.org", "i.imgflip.com", "i.redd.it", "preview.redd.it", "external-preview.redd.it", "i.imgur.com", "api.openverse.org", "archive.org")
@app.get("/api/lib/fetch")
async def lib_fetch(url: str):
    m = re.match(r"^https://([A-Za-z0-9.-]+)(:443)?/", url + "/")
    if not m or m.group(1).lower() not in ALLOW: raise HTTPException(400, "host not allowed")
    key = ("f", url); hit = cget(key)
    if hit: return Response(hit[0], media_type=hit[1], headers={"Cache-Control": "public, max-age=86400"})
    async with httpx.AsyncClient(timeout=30, follow_redirects=False) as c:
        r = await c.get(url, headers=UA)
    if r.status_code != 200: raise HTTPException(502, "upstream " + str(r.status_code))
    if len(r.content) > 30_000_000: raise HTTPException(413, "too large")
    ct = r.headers.get("content-type", "application/octet-stream").split(";")[0]
    if len(r.content) < 3_000_000: cput(key, (r.content, ct), 600)
    return Response(r.content, media_type=ct, headers={"Cache-Control": "public, max-age=86400"})

app.mount("/", StaticFiles(directory=ROOT, html=True), name="static")
