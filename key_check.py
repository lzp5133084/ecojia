# -*- coding: utf-8 -*-
"""
════════════════════════════════════════════════════════════
 密钥与模型健康监控引擎 V1.0
 作者：军哥懂保（微信：xunijiayuan）
 职责：实测 keyring.json 中的全部密钥 + 本地/线上大模型通道，
      结果缓存 10 分钟，供 /keys 页面与 /api/keys/status 调用。
 安全：密钥只存 keyring.json（gitignore 不入库），页面只显示打码后的指纹。
════════════════════════════════════════════════════════════
"""
import json
import os
import ssl
import time
import urllib.request
import urllib.error
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KEYRING_FILE = os.path.join(BASE_DIR, "keyring.json")
CACHE_FILE = os.path.join(BASE_DIR, "keycheck_cache.json")
CACHE_TTL = 600  # 缓存 10 分钟

ARK_BASE = "https://ark.cn-beijing.volces.com/api/v3"
_ssl = ssl.create_default_context()


def _now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _http(method, url, headers=None, payload=None, timeout=15, limit=3000):
    data = payload if isinstance(payload, bytes) else \
        (json.dumps(payload).encode("utf-8") if payload is not None else None)
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_ssl) as r:
            return r.status, r.read().decode("utf-8", "ignore")[:limit], int((time.time() - t0) * 1000)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "ignore")[:limit], int((time.time() - t0) * 1000)
    except Exception as e:
        return -1, str(e)[:200], int((time.time() - t0) * 1000)


def mask(secret):
    """密钥打码：只留前6后4，中间星号"""
    s = str(secret or "")
    if len(s) <= 12:
        return s[:3] + "***"
    return s[:6] + "…" + s[-4:]


def load_keyring():
    if not os.path.exists(KEYRING_FILE):
        return {}
    try:
        with open(KEYRING_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def check_ark(key, probe_models):
    """方舟 Key：先鉴权（/models），再逐个试推理端点"""
    code, body, ms = _http("GET", ARK_BASE + "/models", {"Authorization": "Bearer " + key})
    if code != 200:
        return {"ok": False, "stage": "鉴权失败", "ms": ms,
                "detail": "HTTP %s %s" % (code, body[:120])}
    alive = []
    for m in probe_models:
        c, b, _ = _http("POST", ARK_BASE + "/chat/completions",
                        {"Content-Type": "application/json", "Authorization": "Bearer " + key},
                        {"model": m, "messages": [{"role": "user", "content": "hi"}], "max_tokens": 5})
        if c == 200:
            alive.append(m)
    if alive:
        return {"ok": True, "stage": "鉴权+推理", "ms": ms,
                "detail": "可推理模型：" + "、".join(alive)}
    return {"ok": False, "stage": "鉴权通过·推理端点关闭", "ms": ms,
            "detail": "Key 有效但名下所有模型端点已关闭，需到火山方舟控制台重新开通"}


def check_doubao_speech(key):
    """豆包语音 TTS：带 Authorization 头做一次 1 字合成"""
    payload = {
        "app": {"appid": "default", "token": key, "cluster": "volcano_tts"},
        "user": {"uid": "keycheck"},
        "audio": {"voice_type": "zh_female_qingxin", "encoding": "mp3", "speed_ratio": 1.0},
        "request": {"reqid": "keycheck-%d" % int(time.time()), "text": "你",
                    "text_type": "plain", "operation": "query"},
    }
    code, body, ms = _http("POST", "https://openspeech.bytedance.com/api/v1/tts",
                           {"Content-Type": "application/json",
                            "Authorization": "Bearer " + key}, payload)
    try:
        d = json.loads(body)
        ok = code == 200 and d.get("code") == 3000
        return {"ok": ok, "ms": ms,
                "detail": ("合成成功" if ok else "code=%s %s" % (d.get("code"), d.get("message", "")[:100]))}
    except Exception:
        return {"ok": False, "ms": ms, "detail": "HTTP %s %s" % (code, body[:120])}


def check_amap(key):
    from urllib.parse import quote
    code, body, ms = _http("GET", "https://restapi.amap.com/v3/geocode/geo?address=%s&key=%s"
                           % (quote("北京市"), key))
    try:
        d = json.loads(body)
        ok = d.get("status") == "1"
        return {"ok": ok, "ms": ms, "detail": "info=%s（infocode %s）" % (d.get("info"), d.get("infocode"))}
    except Exception:
        return {"ok": False, "ms": ms, "detail": "HTTP %s %s" % (code, body[:120])}


def check_gitee(token):
    code, body, ms = _http("GET", "https://gitee.com/api/v5/user?access_token=" + token)
    try:
        d = json.loads(body)
        ok = bool(d.get("login"))
        return {"ok": ok, "ms": ms,
                "detail": ("用户 %s（%s）" % (d.get("login"), d.get("name"))) if ok else body[:120]}
    except Exception:
        return {"ok": False, "ms": ms, "detail": "HTTP %s" % code}


def check_github(token):
    code, body, ms = _http("GET", "https://api.github.com/user",
                           {"Authorization": "Bearer " + token, "User-Agent": "ecojia-keycheck"}, timeout=25)
    try:
        d = json.loads(body)
        ok = bool(d.get("login"))
        return {"ok": ok, "ms": ms, "detail": ("用户 %s" % d.get("login")) if ok else (d.get("message") or "")[:120]}
    except Exception:
        return {"ok": False, "ms": ms, "detail": "HTTP %s" % code}


def check_admin(site, username, password):
    code, body, ms = _http("POST", site.rstrip("/") + "/api/auth/login",
                           {"Content-Type": "application/json"},
                           {"username": username, "password": password}, timeout=20)
    try:
        d = json.loads(body)
        ok = bool(d.get("ok"))
        return {"ok": ok, "ms": ms,
                "detail": ("登录成功 role=%s nick=%s" % (d.get("role"), d.get("nickname"))) if ok else body[:120]}
    except Exception:
        return {"ok": False, "ms": ms, "detail": "HTTP %s %s" % (code, body[:120])}


def check_ollama(url, model):
    """本地 Ollama：/api/tags 看服务，再确认目标模型是否已拉取"""
    if not url:
        url = "http://127.0.0.1:11434"
    code, body, ms = _http("GET", url.rstrip("/") + "/api/tags", timeout=6)
    if code != 200:
        return {"ok": False, "ms": ms, "detail": "本地服务未运行（HTTP %s）" % code}
    try:
        models = [m.get("name", "") for m in json.loads(body).get("models", [])]
        if not models:
            return {"ok": False, "ms": ms, "detail": "服务在线但未拉取任何模型"}
        has = any(model in m for m in models) if model else True
        note = "已装模型：" + "、".join(models[:5])
        if model and not has:
            note += "（默认模型 %s 未安装，可在环境变量 OLLAMA_MODEL 换成已装模型）" % model
        return {"ok": True, "ms": ms, "detail": note}
    except Exception:
        return {"ok": False, "ms": ms, "detail": "返回解析失败"}


def run_checks(site_base="https://ecojia.cn"):
    """全量实测一遍，返回结构化结果"""
    ring = load_keyring()
    probes = ring.get("ark_probe_models") or ["doubao-lite-128k-240428"]
    items = []

    for k in ring.get("ark_keys", []):
        r = check_ark(k["key"], probes)
        r.update({"group": "火山方舟大模型", "label": k["label"], "fp": mask(k["key"])})
        items.append(r)

    if ring.get("doubao_chat_key"):
        r = check_ark(ring["doubao_chat_key"], probes)
        r.update({"group": "豆包对话", "label": "对话类 Key", "fp": mask(ring["doubao_chat_key"])})
        items.append(r)

    if ring.get("doubao_speech_key"):
        r = check_doubao_speech(ring["doubao_speech_key"])
        r.update({"group": "豆包语音", "label": "语音合成 TTS", "fp": mask(ring["doubao_speech_key"])})
        items.append(r)

    if ring.get("amap_key"):
        r = check_amap(ring["amap_key"])
        r.update({"group": "高德地图", "label": "Web 服务 Key", "fp": mask(ring["amap_key"])})
        items.append(r)

    if ring.get("gitee_token"):
        r = check_gitee(ring["gitee_token"])
        r.update({"group": "Gitee", "label": "通用令牌", "fp": mask(ring["gitee_token"])})
        items.append(r)

    if ring.get("github_token"):
        r = check_github(ring["github_token"])
        r.update({"group": "GitHub", "label": "仓库 Token", "fp": mask(ring["github_token"])})
        items.append(r)

    acc = ring.get("admin_account")
    if acc:
        r = check_admin(site_base, acc["username"], acc["password"])
        r.update({"group": "站点账号", "label": "管理员 %s" % acc["username"], "fp": acc["username"]})
        items.append(r)

    r = check_ollama(os.environ.get("OLLAMA_URL", ""), os.environ.get("OLLAMA_MODEL", "qwen2.5:0.5b"))
    r.update({"group": "本地模型", "label": "Ollama（本机兜底）", "fp": "127.0.0.1:11434"})
    items.append(r)

    ok_n = sum(1 for i in items if i["ok"])
    return {"checked_at": _now(), "total": len(items), "ok": ok_n,
            "bad": len(items) - ok_n, "items": items}


def get_status(force=False):
    """带缓存的状态：10 分钟内直接读缓存，过期或 force 时重测"""
    if not force and os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                c = json.load(f)
            ts = datetime.strptime(c["checked_at"], "%Y-%m-%d %H:%M:%S")
            if (datetime.now() - ts).total_seconds() < CACHE_TTL:
                c["cached"] = True
                return c
        except Exception:
            pass
    c = run_checks()
    c["cached"] = False
    try:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(c, f, ensure_ascii=False, indent=1)
    except Exception:
        pass
    return c
