"""
Hermes Agent Dashboard — FastAPI 数据中间层 v1.1.0
端口: 8643
新增: JWT 鉴权 + Cron 任务 CRUD + 执行日志
"""

import asyncio
import functools
import hashlib
import json
import os
import re
import subprocess
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import bcrypt
import httpx
import jwt
import yaml
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

app = FastAPI(title="Hermes Dashboard API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Paths ────────────────────────────────────────────────────
HERMES_HOME = Path(os.path.expanduser("~/.hermes"))
CONFIG_PATH = HERMES_HOME / "config.yaml"
SESSIONS_DIR = HERMES_HOME / "sessions"
SKILLS_DIR = HERMES_HOME / "skills"
AUTH_FILE = HERMES_HOME / "dashboard-auth.json"
CRON_JOBS_FILE = HERMES_HOME / "cron_jobs.json"
CHAT_WORKDIR = Path("/tmp/hermes-chat")
HERMES_BIN = os.path.expanduser("~/.local/bin/hermes")
HERMES_API_URL = "http://127.0.0.1:8642"
HERMES_API_KEY = os.environ.get("API_SERVER_KEY", "")
AGENT_LOG = HERMES_HOME / "logs" / "agent.log"
ERRORS_LOG = HERMES_HOME / "logs" / "errors.log"
MODELS_FILE = HERMES_HOME / "dashboard-models.json"

# ── Auth ─────────────────────────────────────────────────────
JWT_SECRET = os.environ.get("DASHBOARD_JWT_SECRET", hashlib.sha256(os.urandom(64)).hexdigest())
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24


def _load_auth():
    if AUTH_FILE.exists():
        return json.loads(AUTH_FILE.read_text())
    return {"users": {}}


def _save_auth(data):
    AUTH_FILE.write_text(json.dumps(data, indent=2))


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _get_default_password():
    """First-run: generate and store a random password."""
    auth = _load_auth()
    if "users" not in auth or not auth["users"]:
        import secrets, string
        pw = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(12))
        auth["users"] = {"admin": hash_password(pw)}
        _save_auth(auth)
        print(f"\n  ╔══════════════════════════════════════╗")
        print(f"  ║  Dashboard 初始密码: {pw:<14} ║")
        print(f"  ╚══════════════════════════════════════╝\n")
    return auth


# Initialize on import
_auth_data = _get_default_password()


def create_token(username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    return jwt.encode(
        {"sub": username, "exp": expire},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def verify_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("sub")
    except jwt.PyJWTError:
        return None


async def get_current_user(request: Request) -> str:
    """FastAPI dependency: extract and verify JWT from Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    token = auth_header[7:]
    username = verify_token(token)
    if not username:
        raise HTTPException(status_code=401, detail="Token expired or invalid")

    auth = _load_auth()
    if username not in auth.get("users", {}):
        raise HTTPException(status_code=401, detail="User not found")

    return username


# ── Cache ────────────────────────────────────────────────────
_cache: dict = {}
CACHE_TTL = 30


def cached(key: str, ttl: int = CACHE_TTL):
    def decorator(fn):
        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            now = time.time()
            if key in _cache and now - _cache[key]["ts"] < ttl:
                return _cache[key]["data"]
            data = await fn(*args, **kwargs) if asyncio.iscoroutinefunction(fn) else fn(*args, **kwargs)
            _cache[key] = {"data": data, "ts": now}
            return data
        return wrapper
    return decorator


def clear_cache(*keys):
    for k in keys:
        _cache.pop(k, None)


# ── CLI helpers ──────────────────────────────────────────────

def run_hermes(*args: str, timeout: int = 15) -> str:
    try:
        result = subprocess.run(
            [HERMES_BIN, *args],
            capture_output=True, text=True, timeout=timeout,
            env={**os.environ, "HERMES_NO_COLOR": "1"},
        )
        return result.stdout
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return ""


def run_hermes_raw(*args: str, timeout: int = 30) -> subprocess.CompletedProcess:
    return subprocess.run(
        [HERMES_BIN, *args],
        capture_output=True, text=True, timeout=timeout,
        env={**os.environ, "HERMES_NO_COLOR": "1"},
    )


# ── Models ───────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class PasswordChangeRequest(BaseModel):
    old_password: str
    new_password: str


class CronCreateRequest(BaseModel):
    schedule: str
    prompt: str = ""
    name: str = ""
    skills: list[str] = []
    deliver: str = ""


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    session_id: str = ""
    skills: list[str] = []
    provider: str = ""
    model: str = ""


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    files: list[dict] = []
    error: str = ""


class FileInfo(BaseModel):
    path: str
    name: str
    size: int
    modified: str


class CronJobInfo(BaseModel):
    id: str
    name: str
    schedule: str
    status: str
    prompt: str = ""
    skills: list[str] = []
    last_run: Optional[str] = None
    next_run: Optional[str] = None
    run_count: int = 0
    history: list[dict] = []


class RoomAgent(BaseModel):
    name: str
    provider: str
    model: str
    system_prompt: str = ""
    is_host: bool = False


class RoomCreateRequest(BaseModel):
    name: str
    topic: str
    agents: list[RoomAgent]


class RoomTurnRequest(BaseModel):
    room_id: str
    message: str = ""


# ── Public Endpoints (no auth) ───────────────────────────────

@app.get("/api/health")
async def health():
    return {"ok": True, "timestamp": time.time()}


@app.get("/api/models")
async def get_models(user: str = Depends(get_current_user)):
    """List available provider/models (custom + built-in)."""
    models = []

    if CONFIG_PATH.exists():
        try:
            config = yaml.safe_load(CONFIG_PATH.read_text())
            default_model = config.get("model", {})
            if default_model.get("default"):
                models.append({
                    "provider": default_model.get("provider", "unknown"),
                    "model": default_model.get("default", ""),
                    "label": f"{default_model.get('provider','')}/{default_model.get('default','')}",
                    "is_default": True,
                })
        except Exception:
            pass

    # Built-in common models
    builtin = [
        {"provider": "deepseek", "model": "deepseek-chat", "label": "DeepSeek Chat"},
        {"provider": "deepseek", "model": "deepseek-reasoner", "label": "DeepSeek Reasoner"},
        {"provider": "openrouter", "model": "anthropic/claude-sonnet-4", "label": "Claude Sonnet 4"},
        {"provider": "openrouter", "model": "anthropic/claude-opus-4", "label": "Claude Opus 4"},
        {"provider": "openrouter", "model": "openai/gpt-4o", "label": "GPT-4o"},
        {"provider": "openrouter", "model": "openai/gpt-4.1", "label": "GPT-4.1"},
        {"provider": "openrouter", "model": "google/gemini-2.5-pro", "label": "Gemini 2.5 Pro"},
        {"provider": "openrouter", "model": "google/gemini-2.5-flash", "label": "Gemini 2.5 Flash"},
        {"provider": "openrouter", "model": "meta-llama/llama-4-maverick", "label": "Llama 4 Maverick"},
    ]

    # Load custom models
    custom = _load_custom_models()

    all_available = models + [
        {**m, "is_default": False, "source": "builtin"}
        for m in builtin
        if not any(existing["model"] == m["model"] and existing.get("provider") == m["provider"] for existing in models)
    ] + [
        {**m, "is_default": False, "source": "custom"}
        for m in custom
    ]

    return {
        "current": models[0] if models else None,
        "available": all_available,
    }


# ── Custom Model Management ───────────────────────────────────

def _load_custom_models() -> list[dict]:
    if MODELS_FILE.exists():
        try:
            return json.loads(MODELS_FILE.read_text())
        except Exception:
            pass
    return []


def _save_custom_models(models: list[dict]):
    MODELS_FILE.write_text(json.dumps(models, indent=2))


def _sync_providers_to_config():
    """Write custom provider endpoints to hermes config.yaml."""
    models = _load_custom_models()
    if not CONFIG_PATH.exists():
        return

    try:
        config = yaml.safe_load(CONFIG_PATH.read_text()) or {}
    except Exception:
        return

    providers = config.get("providers", {}) or {}
    changed = False

    for m in models:
        provider_name = m.get("provider", "")
        api_url = m.get("base_url", "").strip()
        if not provider_name or not api_url:
            continue
        if provider_name in ("deepseek", "openrouter", "anthropic", "openai", "google"):
            continue  # Don't overwrite built-in providers

        entry = providers.get(provider_name, {})
        current_api = entry.get("api", "") or entry.get("url", "") or entry.get("base_url", "")
        if current_api != api_url:
            entry["api"] = api_url
            entry["transport"] = m.get("transport", "openai_chat")
            providers[provider_name] = entry
            changed = True

    if changed:
        config["providers"] = providers
        CONFIG_PATH.write_text(yaml.dump(config, default_flow_style=False, allow_unicode=True))


def _get_provider_api_key(provider: str) -> str:
    """Get API key for a custom provider from stored models."""
    models = _load_custom_models()
    for m in models:
        if m.get("provider") == provider and m.get("api_key"):
            return m["api_key"]
    return ""


def _build_hermes_env(agent: dict) -> dict:
    """Build environment dict for hermes subprocess with custom provider credentials."""
    env = {**os.environ, "HERMES_NO_COLOR": "1", "HERMES_YOLO_MODE": "1"}
    provider = agent.get("provider", "")
    api_key = _get_provider_api_key(provider) or agent.get("api_key", "")
    if api_key and provider and provider not in ("deepseek", "openrouter", "anthropic", "openai", "google"):
        # Inject API key as env var for the provider
        env[f"{provider.upper()}_API_KEY"] = api_key
    return env


@app.get("/api/manage/models")
async def list_custom_models(user: str = Depends(get_current_user)):
    return _load_custom_models()


@app.post("/api/manage/models")
async def add_custom_model(body: dict, user: str = Depends(get_current_user)):
    provider = body.get("provider", "").strip()
    model_name = body.get("model", "").strip()
    label = body.get("label", "").strip() or f"{provider}/{model_name}"
    base_url = body.get("base_url", "").strip()
    api_key = body.get("api_key", "").strip()
    transport = body.get("transport", "openai_chat").strip()

    if not provider or not model_name:
        raise HTTPException(status_code=400, detail="provider 和 model 不能为空")

    models = _load_custom_models()
    for m in models:
        if m["provider"] == provider and m["model"] == model_name:
            raise HTTPException(status_code=409, detail="该模型已存在")

    entry = {"provider": provider, "model": model_name, "label": label}
    if base_url:
        entry["base_url"] = base_url
        entry["transport"] = transport
    if api_key:
        entry["api_key"] = api_key

    models.append(entry)
    _save_custom_models(models)
    if base_url:
        _sync_providers_to_config()
    clear_cache("models")
    return {"ok": True, "model": entry}


@app.delete("/api/manage/models")
async def remove_custom_model(provider: str, model: str, user: str = Depends(get_current_user)):
    models = _load_custom_models()
    models = [m for m in models if not (m["provider"] == provider and m["model"] == model)]
    _save_custom_models(models)
    clear_cache("models")
    return {"ok": True}


# ── Entrypoint ───────────────────────────────────────────────

@app.post("/api/auth/login")
async def login(body: LoginRequest):
    auth = _load_auth()
    users = auth.get("users", {})

    if body.username not in users:
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    if not verify_password(body.password, users[body.username]):
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    token = create_token(body.username)
    return {"token": token, "username": body.username}


@app.post("/api/auth/verify")
async def verify(request: Request):
    """Verify token validity (used by frontend on load)."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid token")

    username = verify_token(auth_header[7:])
    if not username:
        raise HTTPException(status_code=401, detail="Token expired")
    return {"username": username, "valid": True}


# ── Protected Endpoints ──────────────────────────────────────

@app.get("/api/status")
@cached("status")
async def get_status(user: str = Depends(get_current_user)):
    output = run_hermes("status", "--all", timeout=20)
    model_match = re.search(r"Model:\s+(.+)", output)
    provider_match = re.search(r"Provider:\s+(.+)", output)

    api_keys = []
    for m in re.finditer(r"(\\w[\\w\\s/]+?)\\s{2,}([✓✗])", output):
        name = m.group(1).strip()
        set_val = m.group(2).strip()
        if name not in ("Project", "Python", ".env file", "Model", "Provider"):
            api_keys.append({"name": name, "set": set_val == "✓"})

    # Add custom models from dashboard as configured API keys
    for cm in _load_custom_models():
        provider_name = cm.get("provider", "")
        model_name = cm.get("model", "")
        has_config = bool(cm.get("api_key") or cm.get("base_url"))
        key_label = model_name
        if not any(k["name"] == key_label for k in api_keys):
            api_keys.append({"name": key_label, "set": has_config, "custom": True})

    sessions_output = run_hermes("sessions", "stats", timeout=10)
    session_count = 0
    message_count = 0
    for line in sessions_output.split("\n"):
        if "Total sessions:" in line:
            session_count = int(re.search(r"(\d+)", line).group(1))
        elif "Total messages:" in line:
            message_count = int(re.search(r"(\d+)", line).group(1))

    skill_count = 0
    if SKILLS_DIR.exists():
        skill_count = len([d for d in SKILLS_DIR.rglob("SKILL.md") if d.is_file()])

    def safe_group(m: Optional[re.Match], g: int = 1) -> str:
        return m.group(g).strip() if m else "unknown"

    # Check if current model is the configured default
    is_default = False
    if CONFIG_PATH.exists():
        try:
            config = yaml.safe_load(CONFIG_PATH.read_text())
            default_cfg = config.get("model", {})
            is_default = (default_cfg.get("default") == safe_group(model_match))
        except Exception:
            pass

    return {
        "provider": safe_group(provider_match),
        "model": safe_group(model_match),
        "is_default_model": is_default,
        "api_keys": api_keys,
        "session_count": session_count,
        "message_count": message_count,
        "skill_count": skill_count,
    }


@app.get("/api/sessions")
@cached("sessions")
async def get_sessions(user: str = Depends(get_current_user)):
    if not SESSIONS_DIR.exists():
        return []

    sessions = []
    for f in sorted(SESSIONS_DIR.glob("session_*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            sessions.append({
                "id": data.get("session_id", f.stem),
                "title": data.get("title") or data.get("session_id", "Untitled"),
                "platform": data.get("platform", "cli"),
                "message_count": data.get("message_count", 0),
                "created_at": data.get("session_start", ""),
                "updated_at": data.get("last_updated", ""),
            })
        except Exception:
            continue
        if len(sessions) >= 20:
            break
    return sessions


@app.get("/api/tokens")
@cached("tokens")
async def get_tokens(user: str = Depends(get_current_user)):
    output = run_hermes("insights", "--days", "7", timeout=20)
    total = 0; input_tokens = 0; output_tokens = 0
    by_model = []; by_platform = []

    total_match = re.search(r"Total tokens:\s+([\d,]+)", output)
    if total_match: total = int(total_match.group(1).replace(",", ""))
    input_match = re.search(r"Input tokens:\s+([\d,]+)", output)
    if input_match: input_tokens = int(input_match.group(1).replace(",", ""))
    output_match = re.search(r"Output tokens:\s+([\d,]+)", output)
    if output_match: output_tokens = int(output_match.group(1).replace(",", ""))

    in_models = False
    for line in output.split("\n"):
        if "Models Used" in line: in_models = True; continue
        if in_models:
            if line.strip().startswith("─") or not line.strip():
                if not line.strip(): in_models = False
                continue
            parts = line.strip().split()
            if len(parts) >= 3:
                try:
                    tokens_val = int(parts[-1].replace(",", ""))
                    model_name = " ".join(parts[:-2])
                    by_model.append({"model": model_name, "tokens": tokens_val})
                except ValueError: pass

    in_platforms = False
    for line in output.split("\n"):
        if "Platform" in line and "─" not in line: in_platforms = True; continue
        if in_platforms:
            if line.strip().startswith("─") or not line.strip():
                if not line.strip(): in_platforms = False
                continue
            parts = line.strip().split()
            if len(parts) >= 4:
                try:
                    tokens_val = int(parts[-1].replace(",", ""))
                    by_platform.append({"platform": parts[0], "tokens": tokens_val})
                except ValueError: pass

    return {"total": total, "input": input_tokens, "output": output_tokens,
            "by_model": by_model, "by_platform": by_platform}


@app.get("/api/skills")
@cached("skills")
async def get_skills(user: str = Depends(get_current_user)):
    if not SKILLS_DIR.exists(): return []
    skills = []
    for skill_md in SKILLS_DIR.rglob("SKILL.md"):
        try:
            content = skill_md.read_text(encoding="utf-8")
            fm_match = re.match(r"^---\s*\n(.*?)\n---", content, re.DOTALL)
            if fm_match:
                fm = yaml.safe_load(fm_match.group(1)) or {}
                skills.append({
                    "name": fm.get("name", skill_md.parent.name),
                    "description": fm.get("description", ""),
                    "category": str(skill_md.parent.relative_to(SKILLS_DIR)).split("/")[0] if skill_md.parent != SKILLS_DIR else "root",
                    "enabled": True,
                })
        except Exception: continue
    return sorted(skills, key=lambda s: s["name"])


@app.get("/api/overview")
async def get_overview(user: str = Depends(get_current_user)):
    status = await get_status(user=user)
    sessions = await get_sessions(user=user)
    tokens = await get_tokens(user=user)
    return {"status": status, "recent_sessions": sessions[:10], "tokens": tokens}


# ── Cron Management ──────────────────────────────────────────

def _parse_cron_list(output: str) -> list[dict]:
    """Parse 'hermes cron list --all' table output."""
    jobs = []
    if "No" in output and "jobs" in output:
        return jobs

    lines = output.strip().split("\n")
    for line in lines:
        if "│" in line and not line.strip().startswith("┌") and not line.strip().startswith("└"):
            parts = [p.strip() for p in line.split("│") if p.strip()]
            if len(parts) >= 3:
                # Try to extract job ID (usually first column)
                job_id = parts[0] if parts[0] else "unknown"
                jobs.append({
                    "id": job_id,
                    "name": parts[1] if len(parts) > 1 else "",
                    "schedule": parts[2] if len(parts) > 2 else "",
                    "status": "active" if "active" in line.lower() else "paused",
                })
    return jobs


def _read_cron_logs(job_name: Optional[str] = None, limit: int = 50) -> list[dict]:
    """Read cron-related log entries from agent.log and errors.log."""
    entries = []
    for log_path in [AGENT_LOG, ERRORS_LOG]:
        if not log_path.exists():
            continue
        try:
            lines = log_path.read_text(errors="ignore").split("\n")
            # Read last ~5000 lines for performance
            recent = lines[-5000:]
            for line in recent:
                if "cron" in line.lower() or "job" in line.lower():
                    if job_name and job_name.lower() not in line.lower():
                        continue
                    # Extract timestamp
                    ts_match = re.match(r"^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})", line)
                    timestamp = ts_match.group(1) if ts_match else ""
                    level = "INFO"
                    if "ERROR" in line or "error" in line:
                        level = "ERROR"
                    elif "WARNING" in line or "warn" in line:
                        level = "WARNING"

                    entries.append({
                        "timestamp": timestamp,
                        "level": level,
                        "message": line[:500],
                    })
        except Exception:
            continue

    entries.sort(key=lambda e: e["timestamp"], reverse=True)
    return entries[:limit]


def _load_cron_jobs_file() -> dict:
    """Load persistent cron job metadata."""
    if CRON_JOBS_FILE.exists():
        try:
            return json.loads(CRON_JOBS_FILE.read_text())
        except Exception:
            pass
    return {"jobs": {}}


def _save_cron_jobs_file(data: dict):
    CRON_JOBS_FILE.write_text(json.dumps(data, indent=2))


@app.get("/api/cron")
async def get_cron(user: str = Depends(get_current_user)):
    """Get all cron jobs with enhanced info."""
    output = run_hermes("cron", "list", "--all", timeout=10)
    raw_jobs = _parse_cron_list(output)

    # Load persistent metadata
    persisted = _load_cron_jobs_file()

    jobs = []
    for j in raw_jobs:
        job_id = j["id"]
        meta = persisted.get("jobs", {}).get(job_id, {})
        jobs.append({
            "id": job_id,
            "name": j["name"] or meta.get("name", job_id),
            "schedule": j["schedule"],
            "status": j["status"],
            "prompt": meta.get("prompt", ""),
            "skills": meta.get("skills", []),
            "last_run": meta.get("last_run"),
            "run_count": meta.get("run_count", 0),
        })

    return jobs


@app.get("/api/cron/{job_id}/logs")
async def get_cron_logs(job_id: str, limit: int = 50, user: str = Depends(get_current_user)):
    """Get execution logs for a specific cron job."""
    # Try to find the job name first
    output = run_hermes("cron", "list", "--all", timeout=10)
    raw_jobs = _parse_cron_list(output)
    job_name = job_id
    for j in raw_jobs:
        if j["id"] == job_id:
            job_name = j["name"] or job_id
            break

    logs = _read_cron_logs(job_name=job_id, limit=limit)
    return {"job_id": job_id, "job_name": job_name, "logs": logs}


@app.post("/api/cron")
async def create_cron(body: CronCreateRequest, user: str = Depends(get_current_user)):
    """Create a new cron job."""
    if not body.schedule:
        raise HTTPException(status_code=400, detail="schedule is required")

    args = ["cron", "create", body.schedule]
    if body.name:
        args.extend(["--name", body.name])
    if body.prompt:
        args.append(body.prompt)
    for skill in body.skills:
        args.extend(["--skill", skill])
    if body.deliver:
        args.extend(["--deliver", body.deliver])

    result = run_hermes_raw(*args, timeout=30)

    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr or "创建失败")

    # Parse the created job ID from output
    output = result.stdout + result.stderr
    job_id_match = re.search(r"job[_\s]?id[:\s]+(\S+)", output, re.IGNORECASE)

    # Save metadata
    job_list = _parse_cron_list(run_hermes("cron", "list", "--all", timeout=10))
    persisted = _load_cron_jobs_file()

    for j in job_list:
        if job_id_match and j["id"] == job_id_match.group(1):
            job_id = j["id"]
        elif body.name and body.name in (j.get("name", ""), j.get("id", "")):
            job_id = j["id"]
        else:
            continue

        persisted.setdefault("jobs", {})[job_id] = {
            "name": body.name or job_id,
            "prompt": body.prompt,
            "skills": body.skills,
            "run_count": 0,
            "last_run": None,
        }
        _save_cron_jobs_file(persisted)
        clear_cache("cron")
        return {"ok": True, "job_id": job_id, "message": "定时任务创建成功"}

    # Fallback: just return success
    clear_cache("cron")
    return {"ok": True, "message": "定时任务创建成功", "output": output[:500]}


@app.post("/api/cron/{job_id}/pause")
async def pause_cron(job_id: str, user: str = Depends(get_current_user)):
    result = run_hermes_raw("cron", "pause", job_id, timeout=15)
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr or "暂停失败")
    clear_cache("cron")
    return {"ok": True, "message": "已暂停"}


@app.post("/api/cron/{job_id}/resume")
async def resume_cron(job_id: str, user: str = Depends(get_current_user)):
    result = run_hermes_raw("cron", "resume", job_id, timeout=15)
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr or "恢复失败")
    clear_cache("cron")
    return {"ok": True, "message": "已恢复"}


@app.post("/api/cron/{job_id}/run")
async def run_cron_now(job_id: str, user: str = Depends(get_current_user)):
    """Trigger a cron job to run on the next tick."""
    result = run_hermes_raw("cron", "run", job_id, timeout=15)
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr or "触发失败")
    clear_cache("cron")
    return {"ok": True, "message": "已触发执行"}


@app.delete("/api/cron/{job_id}")
async def delete_cron(job_id: str, user: str = Depends(get_current_user)):
    result = run_hermes_raw("cron", "remove", job_id, timeout=15)
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr or "删除失败")

    # Clean up metadata
    persisted = _load_cron_jobs_file()
    persisted.get("jobs", {}).pop(job_id, None)
    _save_cron_jobs_file(persisted)
    clear_cache("cron")
    return {"ok": True, "message": "已删除"}


@app.get("/api/cron/status")
async def cron_scheduler_status(user: str = Depends(get_current_user)):
    output = run_hermes("cron", "status", timeout=10)
    running = "running" in output.lower() or "gateway is running" in output.lower()
    pid_match = re.search(r"PID:\s+(\d+)", output)
    return {
        "running": running,
        "pid": int(pid_match.group(1)) if pid_match else None,
        "raw": output.strip(),
    }


# ── Account ──────────────────────────────────────────────────

@app.post("/api/auth/change-password")
async def change_password(body: PasswordChangeRequest, user: str = Depends(get_current_user)):
    auth = _load_auth()
    if not verify_password(body.old_password, auth["users"].get(user, "")):
        raise HTTPException(status_code=400, detail="原密码错误")

    auth["users"][user] = hash_password(body.new_password)
    _save_auth(auth)
    return {"ok": True, "message": "密码已修改"}


# ── Chat ─────────────────────────────────────────────────────

CHAT_SESSIONS: dict = {}  # session_id -> list of messages


def _scan_chat_files() -> list[dict]:
    """Scan chat workdir for generated files."""
    if not CHAT_WORKDIR.exists():
        return []
    files = []
    for f in CHAT_WORKDIR.rglob("*"):
        if f.is_file() and not f.name.startswith("."):
            rel = str(f.relative_to(CHAT_WORKDIR))
            files.append({
                "path": rel,
                "name": f.name,
                "size": f.stat().st_size,
                "modified": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
            })
    return sorted(files, key=lambda x: x["modified"], reverse=True)


def _extract_and_save_code_blocks(reply: str) -> int:
    """Extract code blocks from reply and save them as files in workdir.
    Returns number of files saved."""
    saved = 0
    # Match ```lang filename\n code \n```
    # Pattern 1: ```lang:filename  or  ```filename.ext
    blocks = re.findall(
        r'```(?:(\w+)[:\s]+(\S+\.\w+))?\s*\n(.*?)```',
        reply, re.DOTALL
    )
    # Pattern 2: ```lang\n code \n``` (no explicit filename)
    blocks2 = re.findall(
        r'```(\w+)\s*\n(.*?)```',
        reply, re.DOTALL
    )

    # Filename extensions by language
    ext_map = {
        "python": "py", "py": "py",
        "javascript": "js", "js": "js", "typescript": "ts", "ts": "ts",
        "tsx": "tsx", "jsx": "jsx",
        "html": "html", "css": "css",
        "bash": "sh", "sh": "sh", "shell": "sh",
        "nginx": "conf",
        "json": "json", "yaml": "yaml", "yml": "yml",
        "sql": "sql", "go": "go", "rust": "rs", "java": "java",
        "dockerfile": "Dockerfile", "makefile": "Makefile",
        "markdown": "md", "md": "md",
        "text": "txt", "txt": "txt",
        "conf": "conf", "toml": "toml", "ini": "ini",
    }

    # Process blocks with explicit filenames (Pattern 1)
    for lang_or_file, filename_or_empty, code in blocks:
        if not code.strip():
            continue
        fname = _resolve_filename(lang_or_file, filename_or_empty, saved)
        dest = _unique_dest(fname)
        if dest:
            try:
                dest.write_text(code.strip(), encoding="utf-8")
                saved += 1
            except Exception:
                continue

    # Process code blocks without filename (Pattern 2)
    for lang, code in blocks2:
        if not code.strip():
            continue
        fname = _resolve_filename(lang, "", saved)
        dest = _unique_dest(fname)
        if dest:
            try:
                dest.write_text(code.strip(), encoding="utf-8")
                saved += 1
            except Exception:
                continue

    return saved


def _resolve_filename(lang: str, filename: str, saved: int) -> str:
    """Determine a filename from language tag and optional filename."""
    ext_map = {
        "python": "py", "py": "py",
        "javascript": "js", "js": "js", "typescript": "ts", "ts": "ts",
        "tsx": "tsx", "jsx": "jsx",
        "html": "html", "css": "css",
        "bash": "sh", "sh": "sh", "shell": "sh",
        "nginx": "conf",
        "json": "json", "yaml": "yaml", "yml": "yml",
        "sql": "sql", "go": "go", "rust": "rs", "java": "java",
        "dockerfile": "Dockerfile", "makefile": "Makefile",
        "markdown": "md", "md": "md",
        "text": "txt", "txt": "txt",
        "conf": "conf", "toml": "toml", "ini": "ini",
    }
    if filename and "." in filename:
        return filename
    if lang and "." in lang:
        return lang
    ext = ext_map.get(lang.lower(), "txt") if lang else "txt"
    return f"code_{saved}.{ext}"


def _unique_dest(fname: str) -> Optional[Path]:
    """Return a unique destination path, appending counter if needed."""
    dest = CHAT_WORKDIR / fname
    counter = 1
    while dest.exists():
        stem = Path(fname).stem
        ext = Path(fname).suffix
        dest = CHAT_WORKDIR / f"{stem}_{counter}{ext}"
        counter += 1
    return dest


def _read_file_content(rel_path: str) -> Optional[str]:
    """Read a file from chat workdir. Returns base64 for binary files."""
    full = (CHAT_WORKDIR / rel_path).resolve()
    if not str(full).startswith(str(CHAT_WORKDIR.resolve())):
        return None
    if not full.exists():
        return None

    binary_exts = {".docx", ".xlsx", ".pptx", ".pdf", ".png", ".jpg", ".jpeg",
                   ".gif", ".webp", ".mp4", ".mp3", ".zip", ".gz", ".tar",
                   ".woff", ".woff2", ".ttf", ".otf", ".ico", ".exe", ".bin"}
    is_binary = full.suffix.lower() in binary_exts

    try:
        if is_binary:
            import base64
            raw = full.read_bytes()
            return base64.b64encode(raw).decode("ascii")
        return full.read_text(encoding="utf-8", errors="replace")
    except Exception:
        try:
            import base64
            raw = full.read_bytes()
            return base64.b64encode(raw).decode("ascii")
        except Exception:
            return None


@app.post("/api/chat")
async def chat(body: ChatRequest, user: str = Depends(get_current_user)):
    """Send a message to Hermes Agent and get a reply."""
    CHAT_WORKDIR.mkdir(parents=True, exist_ok=True)

    session_id = body.session_id or f"chat_{int(time.time())}"
    if session_id not in CHAT_SESSIONS:
        CHAT_SESSIONS[session_id] = []

    # Record files before
    before_files = set()
    if CHAT_WORKDIR.exists():
        before_files = {str(f) for f in CHAT_WORKDIR.rglob("*") if f.is_file()}

    # Build the command
    cmd_args = ["chat", "-q", body.message, "--quiet", "--yolo"]
    if body.provider:
        cmd_args.extend(["--provider", body.provider])
    if body.model:
        cmd_args.extend(["--model", body.model])
    if body.skills:
        for skill in body.skills:
            cmd_args.extend(["--skills", skill])

    try:
        result = subprocess.run(
            [HERMES_BIN, *cmd_args],
            capture_output=True, text=True, timeout=300,
            cwd=str(CHAT_WORKDIR),
            env=_build_hermes_env({"provider": body.provider, "model": body.model}),
        )
        reply = result.stdout.strip()
        if result.returncode != 0:
            reply = reply or result.stderr.strip()

        # Auto-save code blocks from reply as files
        _extract_and_save_code_blocks(reply)

        # Return all files in workdir
        after_files = set()
        if CHAT_WORKDIR.exists():
            after_files = {str(f) for f in CHAT_WORKDIR.rglob("*") if f.is_file()}

        new_files = after_files - before_files
        file_list = []
        for fp in new_files:
            p = Path(fp)
            if not p.name.startswith("."):
                rel = str(p.relative_to(CHAT_WORKDIR))
                file_list.append({
                    "path": rel,
                    "name": p.name,
                    "size": p.stat().st_size,
                    "modified": datetime.fromtimestamp(p.stat().st_mtime).isoformat(),
                })

        CHAT_SESSIONS[session_id].append({"role": "user", "content": body.message})
        CHAT_SESSIONS[session_id].append({"role": "assistant", "content": reply})

        # Return all files in workdir (not just new ones)
        all_files = _scan_chat_files()

        return ChatResponse(
            session_id=session_id,
            reply=reply,
            files=all_files,
        )

    except subprocess.TimeoutExpired:
        return ChatResponse(
            session_id=session_id,
            reply="",
            error="请求超时（300秒）。复杂任务可能需要较长时间，请尝试简化问题或分步执行。",
        )


@app.get("/api/chat/files")
async def list_chat_files(user: str = Depends(get_current_user)):
    """List all generated files in chat workdir."""
    return _scan_chat_files()


@app.get("/api/chat/files/{file_path:path}")
async def get_chat_file(file_path: str, user: str = Depends(get_current_user)):
    """Download a generated file — base64 for binary, text for others."""
    content = _read_file_content(file_path)
    if content is None:
        raise HTTPException(status_code=404, detail="文件不存在")

    # Detect binary by extension
    binary_exts = {".docx", ".xlsx", ".pptx", ".pdf", ".png", ".jpg", ".jpeg",
                   ".gif", ".webp", ".mp4", ".mp3", ".zip", ".gz", ".tar"}
    is_binary = Path(file_path).suffix.lower() in binary_exts

    return {"path": file_path, "content": content, "encoding": "base64" if is_binary else "text"}


@app.get("/api/chat/sessions")
async def list_chat_sessions(user: str = Depends(get_current_user)):
    """List active chat sessions."""
    sessions = []
    for sid, msgs in CHAT_SESSIONS.items():
        preview = ""
        for m in msgs:
            if m["role"] == "user":
                preview = m["content"][:80]
                break
        sessions.append({
            "session_id": sid,
            "message_count": len(msgs),
            "preview": preview,
        })
    return sorted(sessions, key=lambda s: s["session_id"], reverse=True)


@app.get("/api/chat/{session_id}")
async def get_chat_history(session_id: str, user: str = Depends(get_current_user)):
    """Get chat history for a session."""
    msgs = CHAT_SESSIONS.get(session_id, [])
    return {"session_id": session_id, "messages": msgs}


@app.delete("/api/chat/files/{file_path:path}")
async def delete_chat_file(file_path: str, user: str = Depends(get_current_user)):
    """Delete a file from chat workdir."""
    full = (CHAT_WORKDIR / file_path).resolve()
    if not str(full).startswith(str(CHAT_WORKDIR.resolve())):
        raise HTTPException(status_code=403, detail="路径非法")
    if not full.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    try:
        full.unlink()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/chat/sessions/{session_id}")
async def delete_chat_session(session_id: str, user: str = Depends(get_current_user)):
    """Delete a chat session from memory."""
    if session_id in CHAT_SESSIONS:
        del CHAT_SESSIONS[session_id]
    return {"ok": True}


@app.post("/api/chat/stream")
async def chat_stream(body: ChatRequest, user: str = Depends(get_current_user)):
    """SSE streaming chat — proxies to Hermes API Server with real-time events."""
    CHAT_WORKDIR.mkdir(parents=True, exist_ok=True)

    session_id = body.session_id or f"chat_{int(time.time())}"
    if session_id not in CHAT_SESSIONS:
        CHAT_SESSIONS[session_id] = []

    before_files = set()
    if CHAT_WORKDIR.exists():
        before_files = {str(f) for f in CHAT_WORKDIR.rglob("*") if f.is_file()}

    # Build messages for Hermes API
    messages = [{"role": "user", "content": body.message}]

    async def event_generator():
        nonlocal before_files
        full_reply = ""
        tool_count = 0
        usage_info = {"total_tokens": 0, "prompt_tokens": 0, "completion_tokens": 0}

        try:
            # Subprocess streaming via asyncio
            cmd_args = ["chat", "-q", body.message, "--quiet", "--yolo"]
            if body.provider:
                cmd_args.extend(["--provider", body.provider])
            if body.model:
                cmd_args.extend(["--model", body.model])
            if body.skills:
                for skill in body.skills:
                    cmd_args.extend(["--skills", skill])

            proc = await asyncio.create_subprocess_exec(
                HERMES_BIN, *cmd_args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                cwd=str(CHAT_WORKDIR),
            env=_build_hermes_env({"provider": body.provider, "model": body.model}),
            )

            # Read lines as they come
            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                decoded = line.decode("utf-8", errors="replace")
                clean = decoded.strip()
                # Skip internal lines
                if not clean or clean.startswith("session_id:"):
                    continue
                if clean:
                    full_reply += clean + "\n"
                    yield f"data: {json.dumps({'choices':[{'delta':{'content':clean + chr(10)}}]})}\n\n"

            await proc.wait()

            # Emit final event
            if full_reply:
                _extract_and_save_code_blocks(full_reply)
            all_files = _scan_chat_files()

            final_event = {
                "session_id": session_id,
                "usage": usage_info,
                "files": all_files,
                "tool_count": tool_count,
            }
            yield f"event: hermes.done\ndata: {json.dumps(final_event)}\n\n"

            CHAT_SESSIONS[session_id].append({"role": "user", "content": body.message})
            CHAT_SESSIONS[session_id].append({"role": "assistant", "content": full_reply})

        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Multi-Agent Room ──────────────────────────────────────────

import uuid as _uuid

ROOMS: dict = {}  # room_id -> dict
ROOMS_LOCK = asyncio.Lock()


def _room_summary(room_id: str, room: dict) -> dict:
    return {
        "room_id": room_id,
        "name": room["name"],
        "topic": room["topic"],
        "agents": [{"name": a["name"], "provider": a["provider"], "model": a["model"], "system_prompt": a["system_prompt"], "is_host": a.get("is_host", False)} for a in room["agents"]],
        "message_count": len(room.get("messages", [])),
        "created_at": room.get("created_at", ""),
    }


@app.get("/api/rooms")
async def list_rooms(user: str = Depends(get_current_user)):
    return [_room_summary(rid, r) for rid, r in ROOMS.items()]


@app.post("/api/rooms")
async def create_room(body: RoomCreateRequest, user: str = Depends(get_current_user)):
    room_id = _uuid.uuid4().hex[:12]
    async with ROOMS_LOCK:
        ROOMS[room_id] = {
            "name": body.name,
            "topic": body.topic,
            "agents": [a.model_dump() for a in body.agents],
            "messages": [],
            "turn_index": 0,
            "created_at": datetime.now().isoformat(),
        }
    return {"ok": True, "room_id": room_id, "room": _room_summary(room_id, ROOMS[room_id])}


@app.get("/api/rooms/{room_id}")
async def get_room(room_id: str, user: str = Depends(get_current_user)):
    room = ROOMS.get(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="房间不存在")
    result = _room_summary(room_id, room)
    result["messages"] = room["messages"]
    return result


@app.delete("/api/rooms/{room_id}")
async def delete_room(room_id: str, user: str = Depends(get_current_user)):
    async with ROOMS_LOCK:
        if room_id not in ROOMS:
            raise HTTPException(status_code=404, detail="房间不存在")
        del ROOMS[room_id]
    return {"ok": True}


@app.post("/api/rooms/{room_id}/interject")
async def room_interject(room_id: str, body: dict, user: str = Depends(get_current_user)):
    """User interjects a message into the ongoing discussion."""
    room = ROOMS.get(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="房间不存在")
    message = body.get("message", "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="消息不能为空")

    msg = {"agent_name": "[用户]", "content": message,
           "timestamp": datetime.now().isoformat(), "phase": "user"}
    room["messages"].append(msg)
    return {"ok": True, "message": message}


ROOM_UPLOAD_DIR = Path("/tmp/hermes-rooms")


@app.post("/api/rooms/{room_id}/upload")
async def room_upload_file(room_id: str, request: Request, user: str = Depends(get_current_user)):
    """Upload a file for agents to reference. Uses raw multipart parsing."""
    room = ROOMS.get(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="房间不存在")

    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" not in content_type:
        raise HTTPException(status_code=400, detail="需要 multipart/form-data")

    body = await request.body()
    # Simple multipart parser
    boundary = content_type.split("boundary=")[-1].strip()
    if not boundary:
        raise HTTPException(status_code=400, detail="缺少 boundary")

    parts = body.split(b"--" + boundary.encode())
    filename = "upload.txt"
    content = ""
    for part in parts:
        if b"Content-Disposition" not in part:
            continue
        part_str = part.decode("utf-8", errors="replace")
        # Find filename
        fn_match = re.search(r'filename="([^"]*)"', part_str)
        if fn_match:
            filename = fn_match.group(1).strip() or "upload.txt"
        # Extract content after double CRLF
        if b"\r\n\r\n" in part:
            content = part.split(b"\r\n\r\n", 1)[-1].decode("utf-8", errors="replace").strip()
            break

    if not content:
        raise HTTPException(status_code=400, detail="文件内容为空")

    # Truncate if too large
    max_len = 15000
    preview = content[:max_len]

    room.setdefault("files", []).append({
        "name": filename, "size": len(content),
        "uploaded_at": datetime.now().isoformat()
    })
    room["messages"].append({
        "agent_name": "[系统]", "content": "用户上传了文件: {}\n\n内容:\n```\n{}\n```".format(filename, preview),
        "timestamp": datetime.now().isoformat(), "phase": "file"
    })
    return {"ok": True, "filename": filename, "size": len(content), "preview": preview[:200]}


@app.post("/api/rooms/{room_id}/export")
async def room_export_discussion(room_id: str, format: str = "md", user: str = Depends(get_current_user)):
    """Export room discussion as a downloadable Markdown file."""
    room = ROOMS.get(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="房间不存在")

    lines = []
    lines.append("# " + room["name"])
    lines.append("")
    lines.append("## 课题")
    lines.append(room["topic"])
    lines.append("")
    lines.append("## 参与 Agent")
    for a in room["agents"]:
        lines.append("- **{}** ({}/{})".format(a["name"], a.get("provider", ""), a.get("model", "")))
    lines.append("")
    lines.append("## 讨论记录")
    lines.append("")
    for m in room.get("messages", []):
        tag = ""
        if m.get("phase") == "intro": tag = " (开题)"
        elif m.get("phase") == "summary": tag = " (总结)"
        elif m.get("phase") == "user": tag = " (用户插话)"
        elif m.get("phase") == "file": tag = " (文件上传)"
        lines.append("### " + m["agent_name"] + tag)
        lines.append(m.get("content", ""))
        lines.append("")

    content = "\n".join(lines)
    export_dir = ROOM_UPLOAD_DIR / room_id
    export_dir.mkdir(parents=True, exist_ok=True)
    filepath = export_dir / "summary.md"
    filepath.write_text(content)

    return {"ok": True, "filename": "summary.md", "path": str(filepath), "size": len(content)}


@app.post("/api/rooms/{room_id}/next")
async def room_next_turn(room_id: str, body: RoomTurnRequest = None, user: str = Depends(get_current_user)):
    """Let the next agent speak. Host speaks first and last; members discuss in between."""
    room = ROOMS.get(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="房间不存在")

    agents = room["agents"]
    if not agents:
        raise HTTPException(status_code=400, detail="房间没有Agent")

    host = next((a for a in agents if a.get("is_host")), None)
    members = [a for a in agents if not a.get("is_host")]
    msgs = room["messages"]
    turn_idx = room["turn_index"]

    # Determine who speaks
    if host and turn_idx == 0:
        agent = host
        phase = "intro"
    elif host and not members:
        agent = host
        phase = "solo"
    elif len(msgs) > 0 and msgs[-1].get("phase") == "summary":
        # Already summarized, cycle back to members
        member_idx = (turn_idx - (1 if host else 0)) % len(members) if members else 0
        agent = members[member_idx] if members else host
        phase = "discussion"
    elif host and turn_idx > 0 and len(msgs) > 0:
        # Check if host should summarize
        member_turns = sum(1 for m in msgs if m.get("agent_name") != host.get("name", ""))
        if member_turns >= len(members) * 2 and not any(m.get("phase") == "summary" for m in msgs):
            agent = host
            phase = "summary"
        else:
            member_idx = (turn_idx - 1) % len(members) if members else 0
            agent = members[member_idx] if members else host
            phase = "discussion"
    elif members:
        member_idx = (turn_idx - (1 if host else 0)) % len(members)
        agent = members[member_idx]
        phase = "discussion"
    else:
        agent = host or agents[0]
        phase = "discussion"

    # Build prompt
    history_lines = []
    for m in msgs[-30:]:
        tag = "房主" if m.get("phase") in ("intro", "summary") else ""
        history_lines.append("**{}{}**: {}".format(m["agent_name"], " (" + tag + ")" if tag else "", m["content"]))

    user_insert = ""
    if body and body.message:
        user_insert = "\n\n[用户插话]: {}".format(body.message)

    if phase == "intro":
        prompt = (
            "你是\"{}\"，房主。\n\n"
            "角色设定: {}\n\n"
            "当前课题: {}\n\n"
            "请完成以下任务:\n"
            "1. 分析这个课题的核心要点\n"
            "2. 将任务分发给各成员: {}\n"
            "3. 明确每个成员应关注的方向\n"
            "4. 在发言末尾标注 [DISCUSS] 表示进入讨论环节\n\n"
            "请注意: 你只负责开题分析和最终汇总，不参与中间讨论。"
        ).format(
            agent["name"], agent["system_prompt"], room["topic"],
            "、".join(m["name"] for m in members) if members else "无",
        )
    elif phase == "summary":
        prompt = (
            "你是\"{}\"，房主。\n\n"
            "角色设定: {}\n\n"
            "当前课题: {}\n\n"
            "讨论历史:\n{}\n{}\n\n"
            "请综合所有成员的发言，给出最终结论和行动方案。在末尾标注 [DONE]。"
        ).format(
            agent["name"], agent["system_prompt"], room["topic"],
            "\n".join(history_lines) if history_lines else "(无)",
            user_insert,
        )
    else:
        member_names = [m["name"] for m in members]
        turn_num = sum(1 for m in msgs if m.get("agent_name") != (host.get("name") if host else ""))
        prompt = (
            "你是\"{}\"，团队成员。\n\n"
            "角色设定: {}\n\n"
            "当前课题: {}\n\n"
            "团队成员: {}\n\n"
            "讨论历史:\n{}\n{}\n\n"
            "这是第{}轮发言。请仔细阅读课题和前面所有人的发言，从你的专业角度发表观点。"
            "可以直接回应或反驳已有观点，也可以提出新思路。保持简洁有力。\n"
            "如果你认为讨论已经很充分，请在末尾标注 [READY] 表示可以汇总。"
        ).format(
            agent["name"], agent["system_prompt"], room["topic"],
            "、".join(member_names),
            "\n".join(history_lines) if history_lines else "(这是第一条发言)",
            user_insert,
            turn_num + 1,
        )

    # Call hermes
    reply = ""
    error = ""
    try:
        result = subprocess.run(
            [HERMES_BIN, "chat", "-q", prompt,
             "--quiet", "--yolo",
             "--provider", agent["provider"], "--model", agent["model"]],
            capture_output=True, text=True, timeout=300,
            env=_build_hermes_env(agent),
        )
        reply = (result.stdout or result.stderr or "").strip()
    except subprocess.TimeoutExpired:
        error = "Agent 响应超时"
    except Exception as e:
        error = str(e)

    if reply:
        msg = {"agent_name": agent["name"], "content": reply,
               "timestamp": datetime.now().isoformat(), "phase": phase}
        room["messages"].append(msg)

    # Auto-advance to summary if members signal READY
    if phase == "discussion" and "[READY]" in reply and host:
        room["turn_index"] += 1
    else:
        room["turn_index"] += 1

    return {
        "ok": True, "agent_name": agent["name"], "phase": phase,
        "reply": reply, "error": error,
        "turn": turn_idx + 1, "total_turns": room["turn_index"],
    }


@app.post("/api/rooms/{room_id}/run")
async def run_room_discussion(room_id: str, max_turns: int = 10, user: str = Depends(get_current_user)):
    """Run multi-agent discussion with SSE streaming. Host → members → host summary."""

    def _sse(event: str, data: dict) -> str:
        prefix = "event: " + event + "\n" if event else ""
        return prefix + "data: " + json.dumps(data) + "\n\n"

    async def event_generator():
        room = ROOMS.get(room_id)
        if not room:
            yield _sse("error", {"error": "房间不存在"})
            return

        agents = room["agents"]
        if not agents:
            yield _sse("error", {"error": "房间没有Agent"})
            return

        host = next((a for a in agents if a.get("is_host")), None)
        members = [a for a in agents if not a.get("is_host")]

        yield _sse("room.start", {
            "room_id": room_id, "topic": room["topic"],
            "agents": [a["name"] for a in agents],
            "host": host["name"] if host else None,
            "members": [m["name"] for m in members],
        })

        # Phase logic
        # max_turns = member discussion turns (host intro + summary are extra)
        member_turn = 0               # counts member discussion turns only
        phase = "intro" if host else "discussion"
        host_summarized = False

        while True:
            # Determine agent and phase
            msgs = room["messages"]
            if phase == "intro" and host:
                agent = host
            elif host_summarized:
                # After summary, keep discussing
                member_idx = member_turn % len(members) if members else 0
                agent = members[member_idx] if members else host
                phase = "discussion"
            elif host and len(msgs) > 0:
                # Summarize only when member_turn reaches max_turns
                if member_turn >= max_turns and not host_summarized:
                    agent = host
                    phase = "summary"
                else:
                    member_idx = member_turn % len(members) if members else 0
                    agent = members[member_idx] if members else host
                    phase = "discussion"
            elif members:
                member_idx = member_turn % len(members)
                agent = members[member_idx]
                phase = "discussion"
            else:
                agent = host or agents[0]
                phase = "discussion"

            current_turn = member_turn + (1 if phase == "discussion" else 0)
            yield _sse("agent.speaking", {
                "agent": agent["name"], "model": agent["model"],
                "phase": phase,
                "current_turn": current_turn,
                "max_turns": max_turns,
            })

            # Build history
            history_lines = []
            for m in msgs[-30:]:
                tag = "房主" if m.get("phase") in ("intro", "summary") else ""
                history_lines.append("**{}{}**: {}".format(m["agent_name"], " (" + tag + ")" if tag else "", m["content"]))

            # Build prompt
            if phase == "summary":
                prompt = (
                    "你是\"{}\"，房主。\n\n"
                    "角色设定: {}\n\n"
                    "当前课题: {}\n\n"
                    "讨论历史:\n{}\n\n"
                    "请综合所有成员的发言，给出最终结论和行动方案。在末尾标注 [DONE]。"
                ).format(
                    agent["name"], agent["system_prompt"], room["topic"],
                    "\n".join(history_lines) if history_lines else "(无)",
                )
            elif phase == "intro":
                prompt = (
                    "你是\"{}\"，房主。\n\n"
                    "角色设定: {}\n\n"
                    "当前课题: {}\n\n"
                    "请完成以下任务:\n"
                    "1. 分析这个课题的核心要点\n"
                    "2. 将任务分发给各成员: {}\n"
                    "3. 明确每个成员应关注的方向\n"
                    "4. 在发言末尾标注 [DISCUSS] 表示进入讨论环节\n\n"
                    "注意: 你只负责开题分析和最终汇总，不参与中间讨论。"
                ).format(
                    agent["name"], agent["system_prompt"], room["topic"],
                    "、".join(m["name"] for m in members) if members else "无",
                )
            else:
                member_names = [m["name"] for m in members]
                turn_num = sum(1 for m in msgs if m.get("agent_name") != (host.get("name") if host else ""))
                prompt = (
                    "你是\"{}\"，团队成员。\n\n"
                    "角色设定: {}\n\n"
                    "当前课题: {}\n\n"
                    "团队成员: {}\n\n"
                    "讨论历史:\n{}\n\n"
                    "这是第{}轮发言。请仔细阅读课题和前面所有人的发言，从你的专业角度发表观点。"
                    "可以直接回应或反驳已有观点，也可以提出新思路。保持简洁。"
                ).format(
                    agent["name"], agent["system_prompt"], room["topic"],
                    "、".join(member_names),
                    "\n".join(history_lines) if history_lines else "(这是第一条发言)",
                    turn_num + 1,
                )

            try:
                proc = await asyncio.create_subprocess_exec(
                    HERMES_BIN, "chat", "-q", prompt,
                    "--quiet", "--yolo",
                    "--provider", agent["provider"],
                    "--model", agent["model"],
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT,
                env=_build_hermes_env(agent),
                )

                response_text = ""
                while True:
                    line = await proc.stdout.readline()
                    if not line:
                        break
                    decoded = line.decode("utf-8", errors="replace").strip()
                    if decoded:
                        response_text += decoded + "\n"
                        yield _sse("", {"agent": agent["name"], "content": decoded})

                await proc.wait()

                cleaned = response_text.strip()
                if cleaned:
                    msg = {"agent_name": agent["name"], "content": cleaned,
                           "timestamp": datetime.now().isoformat(), "phase": phase}
                    room["messages"].append(msg)

                if phase == "summary":
                    host_summarized = True
                    yield _sse("room.done", {"message": "讨论完成", "member_turns": member_turn})
                    return

                if "[DONE]" in cleaned:
                    yield _sse("room.done", {"message": "房主已总结", "member_turns": member_turn})
                    return

            except Exception as e:
                yield _sse("error", {"error": "{} 出错: {}".format(agent["name"], str(e))})

            if phase == "discussion":
                member_turn += 1  # Always advance, even on error

            # Transition: after host intro, enter discussion
            if phase == "intro":
                phase = "discussion"

        # Should never reach here with while True, but just in case
        yield _sse("room.complete", {"message": "已达到最大轮数", "member_turns": member_turn})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Entrypoint ───────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8643, log_level="info")
