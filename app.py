# -*- coding: utf-8 -*-
"""
════════════════════════════════════════════════════════════
 数字生态家园（门户总站）V0.1
 作者：军哥懂保（微信：xunijiayuan）
 域名：ecojia.cn（门户总站）
════════════════════════════════════════════════════════════
 启动：python app.py  →  http://127.0.0.1:8400
 端口/地址可用环境变量 ZSTJ_PORT / ZSTJ_HOST 覆盖

 定位：
 - 本站是整个数字生态的「门户总站」，负责品牌展示、
   产品矩阵分发、用户许愿收集、统一账号（V0.1本地最小实现）
 - 各子站（资料百事通等）通过 /api/ecosystem/status 预留接口
   获取生态总览，后续统一账号打通

 统一账号V0.1说明：
 - 本站 users 表为统一账号体系的本地最小实现
 - 已预留 /api/auth/bridge 接口占位，后续与资料百事通用户库打通
 - 首个注册用户自动成为管理员（role=admin）
════════════════════════════════════════════════════════════
"""
import base64
import hashlib
import hmac
import re
import json
import os
import sqlite3
import time
from datetime import datetime
from functools import wraps

from flask import (Flask, g, session, request, jsonify, Response,
                   render_template, redirect, url_for, send_from_directory)
from werkzeug.security import generate_password_hash, check_password_hash
import agent_service

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "ecojia.db")
VERSION = "V1.7"

# 资料百事通公网入口（已部署到腾讯云服务器；备案后切换为 ziliao.ecojia.cn）
MAIN_SITE_URL = "http://118.24.173.246:8300"

app = Flask(__name__)
app.config["JSON_AS_ASCII"] = False

# ---- 跨子域会话共享：服务器上以环境变量 ZSTJ_COOKIE_DOMAIN=.ecojia.cn 开启 ----
_cookie_domain = os.environ.get("ZSTJ_COOKIE_DOMAIN", ".ecojia.cn").strip()
if _cookie_domain:
    app.config["SESSION_COOKIE_DOMAIN"] = _cookie_domain
    app.config["SESSION_COOKIE_SAMESITE"] = "None"
    app.config["SESSION_COOKIE_SECURE"] = True

# ---- 生态智能体：允许工具子站跨域调用 /api/（携带登录态） ----
AGENT_ORIGINS = {
    "https://ecojia.cn", "https://www.ecojia.cn",
    "https://tools.ecojia.cn", "https://ziliao.ecojia.cn",
}


@app.after_request
def agent_cors(resp):
    origin = request.headers.get("Origin", "")
    if origin in AGENT_ORIGINS and request.path.startswith("/api/"):
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Access-Control-Allow-Credentials"] = "true"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
        resp.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
    return resp


# ══════════════════ 错误页 ══════════════════
@app.errorhandler(404)
@app.errorhandler(405)
def _handle_404_405(e):
    code = getattr(e, "code", 404)
    if request.path.startswith("/api/"):
        msg = "接口不存在" if code == 404 else "请求方法不允许"
        return jsonify({"ok": False, "msg": msg, "path": request.path}), code
    # 非 API 路径一律走品牌 404（405 对用户也是"找不到"）
    return render_template("404.html"), 404


@app.errorhandler(500)
def server_error(e):
    if request.path.startswith("/api/"):
        return jsonify({"ok": False, "msg": "服务器内部错误，请稍后重试"}), 500
    return render_template("500.html"), 500


@app.route("/api/<path:_p>", methods=["OPTIONS"])
def api_options(_p):
    return ("", 204)

# ══════════════════ 商业级图标系统：emoji → 线性 SVG 图标名 ══════════════════
# 底座 icon 字段保留 emoji 语义，显示层统一映射为 icon_sprite.html 中的霓虹线性图标
ICON_MAP = {
    # 产品矩阵
    "🔐": "shieldlock", "📦": "database", "🗂": "library", "🗂️": "library",
    "💎": "gem", "🧒": "baby", "🗄": "locker", "🗄️": "locker",
    "🤝": "accessibility", "⚖": "scale", "⚖️": "scale",
    "📡": "tower", "🗃": "box", "🗃️": "box",
    "🕊": "bird", "🕊️": "bird", "🪶": "feather",
    "✨": "sparkles", "🧩": "puzzle",
    # 硬件生态
    "🛸": "drone", "🛸️": "drone", "🖨": "printer", "🖨️": "printer",
    "🕶": "glasses", "🕶️": "glasses", "🔫": "scan",
    "🧠": "cpu", "⌚": "watch",
}


def picon(emoji):
    """底座 emoji 图标 → SVG 图标名（未知图标回落到星光）"""
    return ICON_MAP.get((emoji or "").strip(), "sparkles")


app.jinja_env.globals["picon"] = picon


@app.context_processor
def inject_icon_map():
    return {"icon_map": ICON_MAP}

# ---- 密钥：首次运行自动生成 secret_key.txt，不入代码库 ----
_key_file = os.path.join(BASE_DIR, "secret_key.txt")
if os.path.exists(_key_file):
    with open(_key_file, "rb") as f:
        app.secret_key = f.read()
else:
    _k = os.urandom(32)
    with open(_key_file, "wb") as f:
        f.write(_k)
    app.secret_key = _k


# ══════════════════ 生态底座数据（单一数据源：ecosystem.json） ══════════════════
# 新增/修改积木只需改 ecosystem.json，服务自动热加载；
# 也可通过 /api/ecosystem/products 接口增删改（管理员）。
ECOSYSTEM_FILE = os.path.join(BASE_DIR, "ecosystem.json")
_eco_cache = {"mtime": None, "data": {}}


def load_ecosystem():
    """读取生态底座数据（按文件修改时间自动热加载）"""
    try:
        mtime = os.path.getmtime(ECOSYSTEM_FILE)
    except OSError:
        return {}
    if _eco_cache["mtime"] != mtime:
        try:
            with open(ECOSYSTEM_FILE, "r", encoding="utf-8") as f:
                _eco_cache["data"] = json.load(f)
            _eco_cache["mtime"] = mtime
        except (OSError, ValueError) as e:
            print(f"[底座] ecosystem.json 读取失败：{e}")
    return _eco_cache["data"]


def save_ecosystem(data):
    """写回底座数据，并让缓存失效"""
    with open(ECOSYSTEM_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    _eco_cache["mtime"] = None


def get_products():
    return load_ecosystem().get("products", [])


def get_hardware():
    return load_ecosystem().get("hardware", [])


def get_main_product():
    """当前主打产品（矩阵中 main=true 的第一位）"""
    for p in get_products():
        if p.get("main"):
            return p
    return {"name": "资料百事通", "url": MAIN_SITE_URL, "status": "已上线"}


def get_main_products():
    """全部主打产品（main=true，支持双主打）"""
    mains = [p for p in get_products() if p.get("main")]
    return mains or [{"name": "资料百事通", "url": MAIN_SITE_URL, "status": "已上线"}]


def renumber(products):
    """重排编号为 01..N，并保证「待添加」始终在末位"""
    products.sort(key=lambda p: p.get("name") == "待添加")
    for i, p in enumerate(products, 1):
        p["no"] = f"{i:02d}"

WISH_STATUS = ["待评估", "已纳入规划", "开发中", "已上线", "暂不规划"]
PRODUCT_STATUS = ["已上线", "开发中", "规划中", "敬请期待", "虚位以待"]

# ══════════════════ 火星平面（huoxingPM）· 火星身份证 ══════════════════
# 设计思路（去中心化 + 链式存证，非公链，数据自持）：
# 1. 每个用户铸造一枚唯一 DID（去中心化身份标识），身份资料由本人维护；
# 2. 每条历程写入即生成「内容哈希」，并与上一条记录首尾相连成链；
# 3. 任何人改动数据都会导致哈希对不上，可在页面一键验真；
# 4. 全部数据可一键导出成「火星护照」JSON，可迁移、可离线保存，平台不锁数据。
HX_CATEGORIES = [
    {"key": "历史", "color": "#7ee2a8", "icon": "clock", "desc": "走过的路、经历的事"},
    {"key": "成绩", "color": "#5ce1e6", "icon": "chart", "desc": "做成的结果与数据"},
    {"key": "荣耀", "color": "#ffd76b", "icon": "trophy", "desc": "被看见的高光时刻"},
    {"key": "难过", "color": "#8a97ff", "icon": "heart", "desc": "低谷与眼泪，也值得留存"},
    {"key": "开心", "color": "#ff9ec4", "icon": "sparkles", "desc": "值得反复回看的快乐"},
    {"key": "纪念", "color": "#c084fc", "icon": "gem", "desc": "人、物、日子的珍藏"},
    {"key": "重要", "color": "#f472b6", "icon": "star", "desc": "改变方向的关键决定"},
]
HX_CATS = [c["key"] for c in HX_CATEGORIES]
HX_COLOR = {c["key"]: c["color"] for c in HX_CATEGORIES}
HX_VISIBILITY = ["private", "public"]
HX_LEVELS = [
    (0, "星尘旅人"), (3, "赤砂探索者"), (7, "环形山行者"),
    (15, "极地守望者"), (30, "永恒火星人"),
]
PUBLIC_BASE = os.environ.get("ZSTJ_PUBLIC_BASE", "https://ecojia.cn")
HX_GENESIS_HASH = "0" * 64

HX_DEMO_IDENTITY = {
    "did": "did:mars:ecojia:6a1f3c9d8b2e4f70a5c6d7e8f9012345",
    "mars_name": "军哥懂保",
    "bio": "把每一段经历，都变成可以验证的温暖。",
    "avatar_seed": "jun-ge-dong-bao",
    "coordinate": "火星坐标 28.87°N / 105.44°E",
    "created_at": "2026-01-01 09:00:00",
    "public_card": 1,
}
# 示例历程：覆盖全部七类，访客未登录时展示
HX_DEMO_RECORDS = [
    {"id": "d01", "happened_on": "2008-09", "category": "历史", "title": "走出小城",
     "summary": "背上行囊，第一次看见更大的世界。",
     "detail": "第一次离开家乡去远方读书，学会独立，也第一次知道世界有多大。",
     "mood": "期待", "visibility": "public"},
    {"id": "d02", "happened_on": "2012-06", "category": "成绩", "title": "拿到第一份专业证书",
     "summary": "把课本上的知识，变成可以拿在手里的底气。",
     "detail": "连续备考三个月，第一次明白：真正的成绩不是分数，而是咬牙坚持的那段时间。",
     "mood": "骄傲", "visibility": "public"},
    {"id": "d03", "happened_on": "2014-03", "category": "重要", "title": "入行保险",
     "summary": "从零开始，服务第一位客户。",
     "detail": "带着一腔热忱进入保险行业，把每一份保单都当成一份托付。",
     "mood": "笃定", "visibility": "public"},
    {"id": "d04", "happened_on": "2016-05", "category": "开心", "title": "迎来新生命",
     "summary": "生命里多了一个最重要的人。",
     "detail": "孩子的到来让生活有了新的重心，也更懂得责任的重量。",
     "mood": "幸福", "visibility": "public"},
    {"id": "d05", "happened_on": "2018-11", "category": "难过", "title": "最难的一年",
     "summary": "有些坎，只能自己一步一步走过去。",
     "detail": "那一年接连的挫折让我第一次怀疑自己。回头看，正是那段低谷，教会了我共情与坚持。",
     "mood": "低落", "visibility": "private"},
    {"id": "d06", "happened_on": "2020-07", "category": "成绩", "title": "第100例理赔",
     "summary": "明白保险是雪中送炭。",
     "detail": "经手第100例理赔，看着一个个家庭渡过难关，坚定了从业的意义。",
     "mood": "感动", "visibility": "public"},
    {"id": "d07", "happened_on": "2022-10", "category": "纪念", "title": "父亲的老照片",
     "summary": "一张泛黄的照片，装着一整个时代。",
     "detail": "整理旧物时翻到父亲年轻时的照片，第一次认真听他讲那些没讲完的故事。",
     "mood": "怀念", "visibility": "private"},
    {"id": "d08", "happened_on": "2024-12", "category": "荣耀", "title": "年度服务之星",
     "summary": "十年坚持被看见。",
     "detail": "连续多年服务客户1000+，获得年度服务之星，感谢每一位信任。",
     "mood": "热泪", "visibility": "public"},
    {"id": "d09", "happened_on": "2025-06", "category": "开心", "title": "带家人看海",
     "summary": "把忙碌按下暂停，把时间还给家人。",
     "detail": "第一次全家一起看海，孩子在沙滩上跑了一下午，那天的风很轻。",
     "mood": "幸福", "visibility": "public"},
    {"id": "d10", "happened_on": "2026-08", "category": "重要", "title": "数字生态启航",
     "summary": "梦想开始生长。",
     "detail": "启动数字生态家园，希望用科技把温暖带给更多家庭。",
     "mood": "坚定", "visibility": "public"},
]


def hx_sha(text):
    """统一哈希算法：SHA-256，任何内容改动都会让指纹变化"""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def hx_json(obj):
    """规范化 JSON（键排序 + 紧凑格式），保证同一内容永远得到同一哈希"""
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def hx_record_payload(rec):
    """一条历程的存证内容（只包含需要防篡改的字段）。
    时间胶囊：仅当设定了 unlock_at 时才并入指纹，保证 V1.6 旧记录哈希不变。"""
    keys = ["category", "happened_on", "title", "summary", "detail", "mood", "place", "visibility"]
    if (rec.get("unlock_at") or "").strip():
        keys.append("unlock_at")
    return hx_json({k: rec.get(k) or "" for k in keys})


def hx_capsule_locked(rec):
    """时间胶囊是否仍在封存中（设定了未来解锁日期且今天尚未到期）"""
    ua = (rec.get("unlock_at") or "").strip()
    return bool(ua) and ua > now()[:10]


def hx_identity_payload(ident):
    """身份资料的存证内容"""
    return hx_json({k: ident.get(k) or "" for k in
                    ("did", "mars_name", "bio", "avatar_seed", "coordinate")})


def hx_new_did(user):
    """铸造 DID：did:mars:ecojia:xxxx，一次生成、终身不变"""
    raw = f"{user['id']}|{user['username']}|{os.urandom(16).hex()}|{now()}"
    return "did:mars:ecojia:" + hx_sha(raw)[:32]


def hx_coordinate(did):
    """由 DID 推导一枚只属于你的「火星坐标」（诗意定位，不影响真实地址）"""
    h = hx_sha("coord|" + did)
    lat = int(h[:8], 16) % 1800000 / 10000.0 - 90
    lon = int(h[8:16], 16) % 3600000 / 10000.0 - 180
    return f"火星坐标 {abs(lat):.2f}°{'N' if lat >= 0 else 'S'} / {abs(lon):.2f}°{'E' if lon >= 0 else 'W'}"


def hx_level(total):
    """身份等级：随记录数成长，并给出下一等级还差多少"""
    name = HX_LEVELS[0][1]
    for need, label in HX_LEVELS:
        if total >= need:
            name = label
    nxt = next(((need, label) for need, label in HX_LEVELS if total < need), None)
    need = nxt[0] if nxt else None
    return name, (nxt[1] if nxt else None), (need - total if need else 0)


def hx_append_block(db, user_id, action, record_id, payload):
    """追加一个区块：区块哈希 = 本块信息 + 上一块哈希，形成不可断的链条"""
    last = db.execute("SELECT block_no, block_hash FROM hx_blocks WHERE user_id=? "
                      "ORDER BY block_no DESC LIMIT 1", (user_id,)).fetchone()
    block_no = (last["block_no"] + 1) if last else 1
    prev_hash = last["block_hash"] if last else HX_GENESIS_HASH
    payload_hash = hx_sha(payload)
    ts = now()
    block_hash = hx_sha(f"{block_no}|{prev_hash}|{action}|{record_id or 0}|{payload_hash}|{ts}")
    db.execute("INSERT INTO hx_blocks(user_id, block_no, action, record_id, payload, "
               "payload_hash, prev_hash, block_hash, created_at) VALUES(?,?,?,?,?,?,?,?,?)",
               (user_id, block_no, action, record_id, payload, payload_hash,
                prev_hash, block_hash, ts))
    return {"block_no": block_no, "payload_hash": payload_hash, "prev_hash": prev_hash,
            "block_hash": block_hash, "created_at": ts}


def hx_identity_for(user, create=True):
    """读取身份；首次访问自动铸造（同时写入创世区块）"""
    db = get_db()
    row = db.execute("SELECT * FROM hx_identity WHERE user_id=?", (user["id"],)).fetchone()
    if row:
        return dict(row)
    if not create:
        return None
    did = hx_new_did(user)
    ts = now()
    ident = {
        "user_id": user["id"], "did": did,
        "mars_name": user["nickname"] or user["username"],
        "bio": "在这里，记录我走过的每一段路。",
        "avatar_seed": did[-12:], "coordinate": hx_coordinate(did),
        "public_card": 1, "created_at": ts, "updated_at": ts,
    }
    db.execute("INSERT INTO hx_identity(user_id, did, mars_name, bio, avatar_seed, "
               "coordinate, public_card, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
               (user["id"], did, ident["mars_name"], ident["bio"], ident["avatar_seed"],
                ident["coordinate"], 1, ts, ts))
    hx_append_block(db, user["id"], "genesis", 0, hx_identity_payload(ident))
    db.commit()
    return ident


def hx_records_for(user_id, include_private=True, only_public=False):
    """读取历程：默认只返回未删除记录，按发生时间排序"""
    sql = "SELECT * FROM hx_records WHERE user_id=? AND deleted=0"
    args = [user_id]
    if only_public:
        sql += " AND visibility='public'"
    elif not include_private:
        sql += " AND visibility='public'"
    sql += " ORDER BY happened_on ASC, id ASC"
    return [dict(r) for r in get_db().execute(sql, args).fetchall()]


def hx_stats(records):
    by = {c: 0 for c in HX_CATS}
    for r in records:
        if r.get("category") in by:
            by[r["category"]] += 1
    total = len(records)
    level, next_level, remain = hx_level(total)
    return {"total": total, "by_category": by, "level": level,
            "next_level": next_level, "next_need": remain,
            "public": len([r for r in records if r.get("visibility") == "public"])}


def hx_verify(user_id):
    """验真：逐块重算哈希 + 校验前后衔接 + 比对当前记录内容"""
    db = get_db()
    rows = db.execute("SELECT * FROM hx_blocks WHERE user_id=? ORDER BY block_no ASC",
                      (user_id,)).fetchall()
    issues = []
    prev_hash = HX_GENESIS_HASH
    for r in rows:
        if r["prev_hash"] != prev_hash:
            issues.append(f"第 {r['block_no']} 块与上一块衔接断裂")
        if hx_sha(r["payload"]) != r["payload_hash"]:
            issues.append(f"第 {r['block_no']} 块内容指纹被改动")
        expect = hx_sha(f"{r['block_no']}|{r['prev_hash']}|{r['action']}|{r['record_id'] or 0}|"
                        f"{r['payload_hash']}|{r['created_at']}")
        if expect != r["block_hash"]:
            issues.append(f"第 {r['block_no']} 块区块哈希不匹配")
        prev_hash = r["block_hash"]
    latest = {}
    for r in rows:
        if r["action"] in ("create", "update") and r["record_id"]:
            latest[r["record_id"]] = r["payload_hash"]
    for rec in db.execute("SELECT * FROM hx_records WHERE user_id=? AND deleted=0",
                          (user_id,)).fetchall():
        if latest.get(rec["id"]) != hx_sha(hx_record_payload(dict(rec))):
            issues.append(f"记录「{rec['title']}」的当前内容与链上指纹不一致")
    return {"ok": not issues, "height": len(rows),
            "head": rows[-1]["block_hash"] if rows else "",
            "checked": len(rows), "issues": issues[:6]}


def hx_demo_chain(records):
    """示例身份证的演示链，仅用于前端展示"""
    prev = HX_GENESIS_HASH
    for i, r in enumerate(records, 1):
        prev = hx_sha(f"{i}|{prev}|{hx_sha(hx_record_payload(r))}")
    return {"ok": True, "height": len(records), "head": prev, "demo": True, "checked": len(records)}


# ══════════════════ V1.7 扩展：见证人 / 家庭链 / 遗产 / 提醒 ══════════════════
def hx_identity_brief(user_id):
    """轻量身份卡（供家庭链/见证人列表展示）"""
    row = get_db().execute("SELECT did, mars_name, avatar_seed, public_card "
                           "FROM hx_identity WHERE user_id=?", (user_id,)).fetchone()
    return dict(row) if row else None


def hx_witnesses_for_records(user_id, record_ids):
    """一组记录的见证人列表：record_id -> [见证信息]"""
    if not record_ids:
        return {}
    marks = ",".join("?" * len(record_ids))
    rows = get_db().execute(
        f"SELECT w.*, i.mars_name, i.did, i.avatar_seed FROM hx_witness w "
        f"JOIN hx_identity i ON i.user_id=w.witness_uid "
        f"WHERE w.record_id IN ({marks}) AND w.status!='declined' "
        f"ORDER BY w.id ASC", list(record_ids)).fetchall()
    out = {}
    for r in rows:
        d = dict(r)
        d.pop("witness_uid", None)
        out.setdefault(d["record_id"], []).append(d)
    return out


def hx_witness_inbox(user_id):
    """待我见证的邀请（别人邀请我签名的记录）"""
    rows = get_db().execute(
        "SELECT w.*, r.title, r.category, r.happened_on, i.mars_name AS owner_name, i.did AS owner_did "
        "FROM hx_witness w "
        "JOIN hx_records r ON r.id=w.record_id AND r.deleted=0 "
        "JOIN hx_identity i ON i.user_id=w.owner_uid "
        "WHERE w.witness_uid=? AND w.status='pending' ORDER BY w.id DESC", (user_id,)).fetchall()
    return [dict(r) for r in rows]


def hx_family_for(user_id):
    """家庭链：我发起的 + 对方发起的（已确认的双向可见）"""
    db = get_db()
    rows = db.execute(
        "SELECT * FROM hx_family WHERE user_id=? OR family_uid=? ORDER BY id DESC",
        (user_id, user_id)).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        other_uid = d["family_uid"] if d["user_id"] == user_id else d["user_id"]
        ident = hx_identity_brief(other_uid)
        if not ident:
            continue
        d["other"] = ident
        d["direction"] = "out" if d["user_id"] == user_id else "in"
        if d["status"] == "confirmed":
            d["other_public_count"] = db.execute(
                "SELECT COUNT(*) c FROM hx_records WHERE user_id=? AND deleted=0 "
                "AND visibility='public'", (other_uid,)).fetchone()["c"]
        out.append(d)
    return out


def hx_monthly_nudge(user_id):
    """月度提醒：本月还没有任何记录，且已到下旬（20号之后），提醒收藏本月"""
    today = now()
    if int(today[8:10]) < 20:
        return None
    month = today[:7]
    c = get_db().execute(
        "SELECT COUNT(*) c FROM hx_records WHERE user_id=? AND deleted=0 "
        "AND substr(created_at,1,7)=?", (user_id, month)).fetchone()["c"]
    if c > 0:
        return None
    return {"month": month,
            "text": f"{int(month[5:7])} 月快过完了，这个月有什么值得收藏的？",
            "hint": "一句话也行，AI 记录助手可以帮你整理成完整历程"}


def hx_annual_years(records):
    """有记录的年份列表（供年报入口选择）"""
    years = sorted({str(r.get("happened_on", ""))[:4] for r in records
                    if str(r.get("happened_on", ""))[:4].isdigit()}, reverse=True)
    return years


# ══════════════════ 数据库 ══════════════════
def get_db():
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        nickname      TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'user',
        created_at    TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS wishes (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER,
        product    TEXT NOT NULL,
        contact    TEXT NOT NULL,
        content    TEXT NOT NULL,
        status     TEXT NOT NULL DEFAULT '待评估',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS op_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER,
        action     TEXT NOT NULL,
        detail     TEXT,
        created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_chat (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        user_id    INTEGER,
        role       TEXT NOT NULL,
        content    TEXT NOT NULL,
        page_url   TEXT DEFAULT '',
        intent     TEXT DEFAULT '',
        created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_chat_sid ON agent_chat(session_id, id);
    CREATE TABLE IF NOT EXISTS agent_config (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS hx_identity (
        user_id     INTEGER PRIMARY KEY,
        did         TEXT UNIQUE NOT NULL,
        mars_name   TEXT NOT NULL DEFAULT '',
        bio         TEXT DEFAULT '',
        avatar_seed TEXT DEFAULT '',
        coordinate  TEXT DEFAULT '',
        public_card INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS hx_records (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL,
        category    TEXT NOT NULL,
        happened_on TEXT NOT NULL,
        title       TEXT NOT NULL,
        summary     TEXT DEFAULT '',
        detail      TEXT DEFAULT '',
        mood        TEXT DEFAULT '',
        place       TEXT DEFAULT '',
        visibility  TEXT NOT NULL DEFAULT 'private',
        unlock_at   TEXT DEFAULT '',
        ai_draft    INTEGER NOT NULL DEFAULT 0,
        deleted     INTEGER NOT NULL DEFAULT 0,
        payload_hash TEXT DEFAULT '',
        block_no    INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_hx_records_user ON hx_records(user_id, deleted, happened_on);
    CREATE TABLE IF NOT EXISTS hx_blocks (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      INTEGER NOT NULL,
        block_no     INTEGER NOT NULL,
        action       TEXT NOT NULL,
        record_id    INTEGER,
        payload      TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        prev_hash    TEXT NOT NULL,
        block_hash   TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        UNIQUE(user_id, block_no)
    );
    CREATE INDEX IF NOT EXISTS idx_hx_blocks_user ON hx_blocks(user_id, block_no);
    CREATE TABLE IF NOT EXISTS hx_witness (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        record_id   INTEGER NOT NULL,
        owner_uid   INTEGER NOT NULL,
        witness_uid INTEGER NOT NULL,
        statement   TEXT DEFAULT '',
        status      TEXT NOT NULL DEFAULT 'pending',
        sign_hash   TEXT DEFAULT '',
        block_no    INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        signed_at   TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_hx_witness_w ON hx_witness(witness_uid, status);
    CREATE INDEX IF NOT EXISTS idx_hx_witness_r ON hx_witness(record_id, status);
    CREATE TABLE IF NOT EXISTS hx_family (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      INTEGER NOT NULL,
        family_uid   INTEGER NOT NULL,
        relation     TEXT DEFAULT '家人',
        status       TEXT NOT NULL DEFAULT 'pending',
        created_at   TEXT NOT NULL,
        confirmed_at TEXT DEFAULT '',
        UNIQUE(user_id, family_uid)
    );
    CREATE INDEX IF NOT EXISTS idx_hx_family_u ON hx_family(family_uid, status);
    CREATE TABLE IF NOT EXISTS hx_legacy (
        user_id        INTEGER PRIMARY KEY,
        heir_did       TEXT DEFAULT '',
        heir_name      TEXT DEFAULT '',
        inactive_years INTEGER NOT NULL DEFAULT 3,
        scope          TEXT NOT NULL DEFAULT '纪念',
        note           TEXT DEFAULT '',
        updated_at     TEXT NOT NULL
    );
    """)
    # —— V1.7 兼容迁移：老库补列（新列已在 CREATE TABLE 中，老库走 ALTER） ——
    for col, ddl in (("unlock_at", "TEXT DEFAULT ''"),
                     ("ai_draft", "INTEGER NOT NULL DEFAULT 0")):
        try:
            db.execute(f"ALTER TABLE hx_records ADD COLUMN {col} {ddl}")
        except sqlite3.Error:
            pass  # 列已存在

    # —— V2 推广系统迁移：邀请码/邀请人/实名/合伙人 + 全局配置表 ——
    for col, ddl in (("invite_code", "TEXT"), ("inviter_id", "INTEGER"),
                     ("real_name", "TEXT"), ("real_idcard", "TEXT"),
                     ("realname_at", "TEXT"), ("is_partner", "INTEGER NOT NULL DEFAULT 0")):
        try:
            db.execute(f"ALTER TABLE users ADD COLUMN {col} {ddl}")
        except sqlite3.Error:
            pass  # 列已存在
    db.execute("CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT)")
    # —— V2 统一权益：任意账号 × 任意项目 的 VIP 授权 ——
    db.execute("""CREATE TABLE IF NOT EXISTS app_grants (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL,
        app_key    TEXT    NOT NULL,
        level      TEXT    NOT NULL DEFAULT 'vip',
        expire_at  TEXT    DEFAULT '',
        note       TEXT    DEFAULT '',
        created_at TEXT    NOT NULL,
        UNIQUE(user_id, app_key)
    )""")
    db.commit()
    for r in db.execute("SELECT id FROM users WHERE invite_code IS NULL OR invite_code=''").fetchall():
        db.execute("UPDATE users SET invite_code=? WHERE id=?", ("ECJ%d" % (10000 + r[0]), r[0]))
    db.commit()
    db.commit()
    db.close()


def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def log_op(action, detail="", user_id=None):
    db = get_db()
    db.execute("INSERT INTO op_log(user_id, action, detail, created_at) VALUES(?,?,?,?)",
               (user_id, action, detail, now()))
    db.commit()


def current_user():
    uid = session.get("uid")
    if not uid:
        return None
    row = get_db().execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    return dict(row) if row else None


def login_required(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        if not session.get("uid"):
            return jsonify({"ok": False, "msg": "请先登录"}), 401
        return fn(*a, **kw)
    return wrapper


def admin_required(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        u = current_user()
        if not u:
            return jsonify({"ok": False, "msg": "请先登录"}), 401
        if u["role"] != "admin":
            return jsonify({"ok": False, "msg": "需要管理员权限"}), 403
        return fn(*a, **kw)
    return wrapper


# ══════════════════ 页面路由 ══════════════════
@app.context_processor
def inject_common():
    u = current_user()
    return {"user": u, "version": VERSION, "footer": footer_info()}


def footer_info():
    """程序大小 + 最后保存时间（规则4：界面显示程序信息）"""
    total, latest = 0, 0
    for root, dirs, files in os.walk(BASE_DIR):
        dirs[:] = [d for d in dirs if d not in ("__pycache__", ".git", "venv", "node_modules")]
        for f in files:
            if f.endswith((".py", ".html", ".css")):
                p = os.path.join(root, f)
                try:
                    st = os.stat(p)
                    total += st.st_size
                    latest = max(latest, st.st_mtime)
                except OSError:
                    pass
    size_kb = round(total / 1024, 1)
    saved = datetime.fromtimestamp(latest).strftime("%Y-%m-%d %H:%M") if latest else "—"
    return {"version": VERSION, "size": f"{size_kb} KB", "saved": saved}


@app.route("/")
def index():
    eco = load_ecosystem()
    main = get_main_product()
    return render_template("index.html", products=get_products(),
                           hardware=get_hardware(), apis=eco.get("apis", []),
                           main_product=main, main_url=main.get("url") or MAIN_SITE_URL,
                           main_products=get_main_products())


@app.route("/vault")
def vault_page():
    """数字保险箱（Digital Vault V2.9）· 主打产品2 专属介绍页（含PPT滚动演示）"""
    return render_template("vault.html")


@app.route("/digital/")
@app.route("/digital/<path:_p>")
def digital_path_redirect(_p=""):
    """修复用户常输错的路径：/digital/... → /vault"""
    return redirect("/vault")


@app.route("/wishes")
def wishes_page():
    return render_template("wishes.html", products=get_products())


@app.route("/huoxing")
def huoxing_page():
    """火星平面（huoxingPM）· 火星身份证：身份 + 七类历程 + 链式存证"""
    return render_template("huoxing.html")


def hx_record_out(rec, mask_locked=False):
    """输出给前端的记录：附带内容指纹与短指纹。
    时间胶囊未到期时可遮罩正文（本人总览用），导出护照时不遮罩。"""
    d = dict(rec)
    d["hash"] = hx_sha(hx_record_payload(d))
    d["short_hash"] = d["hash"][:12]
    d["locked"] = hx_capsule_locked(d)
    if mask_locked and d["locked"]:
        d["summary"] = ""
        d["detail"] = ""
        d["mood"] = ""
        d["place"] = ""
    return d


def hx_blocks_out(user_id, limit=10):
    rows = get_db().execute(
        "SELECT block_no, action, record_id, payload_hash, block_hash, created_at "
        "FROM hx_blocks WHERE user_id=? ORDER BY block_no DESC LIMIT ?",
        (user_id, limit)).fetchall()
    return [dict(r) for r in rows]


def hx_days_since(created_at):
    try:
        start = datetime.strptime(created_at[:19], "%Y-%m-%d %H:%M:%S")
        return max(0, (datetime.now() - start).days)
    except (ValueError, TypeError):
        return 0


@app.route("/api/huoxing/overview")
def api_huoxing_overview():
    """火星身份证总览：身份、七类历程、统计、链状态、公开分享地址"""
    u = current_user()
    if not u:
        records = []
        for i, r in enumerate(HX_DEMO_RECORDS, 1):
            d = hx_record_out(r)
            d.update({"block_no": i, "demo": True})
            records.append(d)
        stats = hx_stats(records)
        ident = dict(HX_DEMO_IDENTITY)
        ident.update({"level": stats["level"], "next_level": stats["next_level"],
                      "next_need": stats["next_need"],
                      "days": hx_days_since(ident["created_at"])})
        return jsonify({
            "ok": True, "login": False, "demo": True,
            "identity": ident, "records": records,
            "categories": HX_CATEGORIES, "stats": stats,
            "chain": hx_demo_chain(HX_DEMO_RECORDS), "blocks": [],
            "share_url": "",
        })

    ident = hx_identity_for(u)
    raw = hx_records_for(u["id"])
    records = [hx_record_out(r, mask_locked=True) for r in raw]
    stats = hx_stats(raw)
    chain = hx_verify(u["id"])
    ident_out = dict(ident)
    ident_out.update({"level": stats["level"], "next_level": stats["next_level"],
                      "next_need": stats["next_need"],
                      "days": hx_days_since(ident["created_at"])})
    wit_map = hx_witnesses_for_records(u["id"], [r["id"] for r in raw])
    for r in records:
        r["witnesses"] = wit_map.get(r["id"], [])
    legacy = get_db().execute("SELECT * FROM hx_legacy WHERE user_id=?",
                              (u["id"],)).fetchone()
    return jsonify({
        "ok": True, "login": True, "demo": False,
        "identity": ident_out, "records": records,
        "categories": HX_CATEGORIES, "stats": stats,
        "chain": chain, "blocks": hx_blocks_out(u["id"]),
        "share_url": f"{PUBLIC_BASE}/hx/card/{ident['did']}" if ident.get("public_card") else "",
        "nudge": hx_monthly_nudge(u["id"]),
        "witness_inbox": hx_witness_inbox(u["id"]),
        "family": hx_family_for(u["id"]),
        "legacy": dict(legacy) if legacy else None,
        "annual_years": hx_annual_years(raw),
        "capsule_count": len([r for r in raw if hx_capsule_locked(r)]),
    })


@app.route("/api/huoxing/records")
def api_huoxing_records():
    """历程列表（兼容旧接口）：登录返回自己的，访客返回示例"""
    u = current_user()
    if u:
        records = [hx_record_out(r) for r in hx_records_for(u["id"])]
        note = "个人历程；含内容指纹与链上区块号，支持增删查改"
    else:
        records = [hx_record_out(r) for r in HX_DEMO_RECORDS]
        note = "访客示例数据；登录后可铸造自己的火星身份证"
    return jsonify({"ok": True, "count": len(records), "records": records, "note": note})


def hx_validate_record(rec):
    """校验并返回错误提示（空字符串表示通过）"""
    if rec["category"] not in HX_CATS:
        return "请选择正确的历程分类"
    if not (1 <= len(rec["title"]) <= 60):
        return "标题需 1-60 个字"
    if len(rec["summary"]) > 160:
        return "一句话摘要最多 160 个字"
    if len(rec["detail"]) > 2000:
        return "详细故事最多 2000 个字"
    if len(rec["mood"]) > 16:
        return "心情最多 16 个字"
    if len(rec["place"]) > 40:
        return "地点最多 40 个字"
    if rec["visibility"] not in HX_VISIBILITY:
        return "可见范围不正确"
    import re
    if not re.match(r"^\d{4}(-\d{1,2}){0,2}$", rec["happened_on"]):
        return "时间格式：2008 / 2008-09 / 2026-10-25"
    ua = rec.get("unlock_at") or ""
    if ua:
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", ua):
            return "时间胶囊解锁日期格式：2027-01-01"
        if ua <= now()[:10]:
            return "时间胶囊的解锁日期需要设在未来"
    return ""


def hx_record_form(d, base=None):
    base = base or {}
    unlock = d.get("unlock_at")
    if unlock is None:
        unlock = base.get("unlock_at") or ""
    return {
        "category": (d.get("category") or base.get("category") or "").strip(),
        "happened_on": (d.get("happened_on") or base.get("happened_on") or "").strip(),
        "title": (d.get("title") or base.get("title") or "").strip(),
        "summary": (d.get("summary") if d.get("summary") is not None
                    else base.get("summary") or "").strip(),
        "detail": (d.get("detail") if d.get("detail") is not None
                   else base.get("detail") or "").strip(),
        "mood": (d.get("mood") if d.get("mood") is not None else base.get("mood") or "").strip(),
        "place": (d.get("place") if d.get("place") is not None else base.get("place") or "").strip(),
        "visibility": (d.get("visibility") or base.get("visibility") or "private").strip(),
        "unlock_at": (unlock or "").strip(),
    }


@app.route("/api/huoxing/records", methods=["POST"])
@login_required
def api_hx_record_create():
    """新增一段历程：写入数据库的同时追加一个区块"""
    u = current_user()
    d = request.get_json(silent=True) or {}
    rec = hx_record_form(d)
    err = hx_validate_record(rec)
    if err:
        return jsonify({"ok": False, "msg": err}), 400
    db = get_db()
    hx_identity_for(u)  # 确保首次使用时已铸造身份
    ts = now()
    ai_draft = 1 if d.get("ai_draft") else 0
    cur = db.execute(
        "INSERT INTO hx_records(user_id, category, happened_on, title, summary, detail, "
        "mood, place, visibility, unlock_at, ai_draft, deleted, payload_hash, block_no, "
        "created_at, updated_at) "
        "VALUES(?,?,?,?,?,?,?,?,?,?,?,0,'',0,?,?)",
        (u["id"], rec["category"], rec["happened_on"], rec["title"], rec["summary"],
         rec["detail"], rec["mood"], rec["place"], rec["visibility"],
         rec["unlock_at"], ai_draft, ts, ts))
    rid = cur.lastrowid
    payload = hx_record_payload(rec)
    block = hx_append_block(db, u["id"], "create", rid, payload)
    db.execute("UPDATE hx_records SET payload_hash=?, block_no=? WHERE id=?",
               (block["payload_hash"], block["block_no"], rid))
    db.commit()
    log_op("火星身份证·新增历程", f"{rec['category']}·{rec['title']}", u["id"])
    row = db.execute("SELECT * FROM hx_records WHERE id=?", (rid,)).fetchone()
    return jsonify({"ok": True, "msg": "历程已写入，并生成新的区块",
                    "record": hx_record_out(row, mask_locked=True), "block": block})


@app.route("/api/huoxing/records/<int:rid>", methods=["PUT"])
@login_required
def api_hx_record_update(rid):
    """修改历程：修改后追加新区块，旧内容仍留在链上可追溯"""
    u = current_user()
    db = get_db()
    row = db.execute("SELECT * FROM hx_records WHERE id=? AND deleted=0", (rid,)).fetchone()
    if not row:
        return jsonify({"ok": False, "msg": "历程不存在"}), 404
    if row["user_id"] != u["id"]:
        return jsonify({"ok": False, "msg": "只能修改自己的历程"}), 403
    d = request.get_json(silent=True) or {}
    rec = hx_record_form(d, dict(row))
    err = hx_validate_record(rec)
    if err:
        return jsonify({"ok": False, "msg": err}), 400
    ts = now()
    payload = hx_record_payload(rec)
    block = hx_append_block(db, u["id"], "update", rid, payload)
    ai_draft = row["ai_draft"] if "ai_draft" in row.keys() else 0
    if d.get("ai_draft"):
        ai_draft = 1
    db.execute("UPDATE hx_records SET category=?, happened_on=?, title=?, summary=?, detail=?, "
               "mood=?, place=?, visibility=?, unlock_at=?, ai_draft=?, payload_hash=?, "
               "block_no=?, updated_at=? WHERE id=?",
               (rec["category"], rec["happened_on"], rec["title"], rec["summary"], rec["detail"],
                rec["mood"], rec["place"], rec["visibility"], rec["unlock_at"], ai_draft,
                block["payload_hash"], block["block_no"], ts, rid))
    db.commit()
    log_op("火星身份证·修改历程", f"ID:{rid} {rec['title']}", u["id"])
    row = db.execute("SELECT * FROM hx_records WHERE id=?", (rid,)).fetchone()
    return jsonify({"ok": True, "msg": "修改已存证，旧版本仍可追溯",
                    "record": hx_record_out(row, mask_locked=True), "block": block})


@app.route("/api/huoxing/records/<int:rid>", methods=["DELETE"])
@login_required
def api_hx_record_delete(rid):
    """删除历程：软删除 + 追加一条删除区块，链上保留删除痕迹"""
    u = current_user()
    db = get_db()
    row = db.execute("SELECT * FROM hx_records WHERE id=? AND deleted=0", (rid,)).fetchone()
    if not row:
        return jsonify({"ok": False, "msg": "历程不存在"}), 404
    if row["user_id"] != u["id"]:
        return jsonify({"ok": False, "msg": "只能删除自己的历程"}), 403
    payload = hx_record_payload(dict(row))
    block = hx_append_block(db, u["id"], "delete", rid, payload)
    db.execute("UPDATE hx_records SET deleted=1, updated_at=? WHERE id=?", (now(), rid))
    db.commit()
    log_op("火星身份证·删除历程", f"ID:{rid} {row['title']}", u["id"])
    return jsonify({"ok": True, "msg": "已从时间线移除，删除动作已留痕", "block": block})


@app.route("/api/huoxing/identity", methods=["PUT"])
@login_required
def api_hx_identity_update():
    """编辑身份资料：改名、签名、头像种子、公开身份证开关"""
    u = current_user()
    ident = hx_identity_for(u)
    d = request.get_json(silent=True) or {}
    mars_name = (d.get("mars_name") or ident["mars_name"]).strip()
    bio = (d.get("bio") if d.get("bio") is not None else ident["bio"]).strip()
    seed = (d.get("avatar_seed") or ident["avatar_seed"]).strip()
    if d.get("regen_avatar"):
        seed = os.urandom(6).hex()
    if not (1 <= len(mars_name) <= 20):
        return jsonify({"ok": False, "msg": "火星名需 1-20 个字"}), 400
    if len(bio) > 120:
        return jsonify({"ok": False, "msg": "一句话签名最多 120 个字"}), 400
    if len(seed) > 40:
        return jsonify({"ok": False, "msg": "头像种子最多 40 个字符"}), 400
    public_card = ident["public_card"]
    if "public_card" in d:
        public_card = 1 if d.get("public_card") else 0
    ts = now()
    db = get_db()
    db.execute("UPDATE hx_identity SET mars_name=?, bio=?, avatar_seed=?, public_card=?, "
               "updated_at=? WHERE user_id=?",
               (mars_name, bio, seed, public_card, ts, u["id"]))
    new_ident = dict(ident)
    new_ident.update({"mars_name": mars_name, "bio": bio, "avatar_seed": seed,
                      "public_card": public_card, "updated_at": ts})
    hx_append_block(db, u["id"], "identity", 0, hx_identity_payload(new_ident))
    db.commit()
    log_op("火星身份证·更新身份", mars_name, u["id"])
    stats = hx_stats(hx_records_for(u["id"]))
    new_ident["level"] = stats["level"]
    return jsonify({"ok": True, "msg": "身份资料已更新并存证", "identity": new_ident,
                    "share_url": f"{PUBLIC_BASE}/hx/card/{ident['did']}" if public_card else ""})


@app.route("/api/huoxing/verify")
def api_hx_verify():
    """一键验真：重算全链哈希，检查是否被改动"""
    u = current_user()
    if not u:
        return jsonify({"ok": True, "demo": True, "chain": hx_demo_chain(HX_DEMO_RECORDS)})
    return jsonify({"ok": True, "chain": hx_verify(u["id"])})


@app.route("/api/huoxing/export")
@login_required
def api_hx_export():
    """导出火星护照：身份 + 全部历程 + 区块 + 验真结果，可离线保存与迁移"""
    u = current_user()
    ident = hx_identity_for(u)
    records = []
    for r in hx_records_for(u["id"]):
        d = hx_record_out(r)
        records.append(d)
    blocks = [dict(r) for r in get_db().execute(
        "SELECT * FROM hx_blocks WHERE user_id=? ORDER BY block_no ASC", (u["id"],)).fetchall()]
    witnesses = [dict(r) for r in get_db().execute(
        "SELECT * FROM hx_witness WHERE owner_uid=? OR witness_uid=?",
        (u["id"], u["id"])).fetchall()]
    passport = {
        "schema": "ecojia.marsid.passport/1.1",
        "issuer": "数字生态家园 · ecojia.cn",
        "author": "军哥懂保（微信：xunijiayuan）",
        "exported_at": now(),
        "identity": ident,
        "records": records,
        "witnesses": witnesses,
        "blocks": blocks,
        "chain": hx_verify(u["id"]),
        "verify_rule": "payload_hash = SHA-256(规范化JSON)；block_hash = SHA-256(区块号|前块哈希|动作|记录ID|内容指纹|时间)；设定了 unlock_at 的时间胶囊记录会把 unlock_at 并入指纹",
        "note": "本护照归你所有，可离线保存、备份或迁移到任何兼容系统；平台不锁定你的数据。可在 ecojia.cn/hx/verify 页上传本文件离线验真。",
    }
    data = json.dumps(passport, ensure_ascii=False, indent=2)
    fname = f"mars-passport-{ident['did'].split(':')[-1][:8]}.json"
    return Response(data, mimetype="application/json; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{fname}"'})


@app.route("/hx/card/<path:did>")
def huoxing_public(did):
    """公开火星身份证页：只展示本人设为「公开见证」的历程"""
    db = get_db()
    row = db.execute("SELECT * FROM hx_identity WHERE did=?", (did,)).fetchone()
    if not row or not row["public_card"]:
        return render_template("huoxing_card.html", identity=None, records=[],
                               stats=None, chain=None, reason="这枚火星身份证不存在，或主人已关闭公开见证。"), 404
    ident = dict(row)
    owner = db.execute("SELECT nickname FROM users WHERE id=?", (row["user_id"],)).fetchone()
    # 公开页排除封存中的时间胶囊（到期前连标题都不公开）
    pub_raw = [r for r in hx_records_for(row["user_id"], only_public=True)
               if not hx_capsule_locked(r)]
    records = [hx_record_out(r) for r in pub_raw]
    for r in records:
        r["color"] = HX_COLOR.get(r["category"], "#f472b6")
    wit_map = hx_witnesses_for_records(row["user_id"], [r["id"] for r in pub_raw])
    for r in records:
        r["witnesses"] = [w for w in wit_map.get(r["id"], []) if w["status"] == "signed"]
    stats = hx_stats(records)
    full_stats = hx_stats(hx_records_for(row["user_id"]))
    ident.update({"level": full_stats["level"], "next_level": full_stats["next_level"],
                  "next_need": full_stats["next_need"],
                  "days": hx_days_since(ident["created_at"])})
    chain = hx_verify(row["user_id"])
    return render_template("huoxing_card.html", identity=ident, records=records,
                           stats=stats, chain=chain,
                           owner=owner["nickname"] if owner else "")


# ══════════════════ V1.7 · 见证人机制（自证 → 互证） ══════════════════
HX_WITNESS_CATS = ("荣耀", "重要")  # 只有这两类历程可邀请见证人


def hx_find_user_by_did(did):
    row = get_db().execute("SELECT user_id FROM hx_identity WHERE did=?",
                           ((did or "").strip(),)).fetchone()
    return row["user_id"] if row else None


@app.route("/api/huoxing/records/<int:rid>/witness", methods=["POST"])
@login_required
def api_hx_witness_invite(rid):
    """邀请另一位火星居民做见证人：对方签名后，签名哈希写入对方的链"""
    u = current_user()
    db = get_db()
    row = db.execute("SELECT * FROM hx_records WHERE id=? AND deleted=0", (rid,)).fetchone()
    if not row or row["user_id"] != u["id"]:
        return jsonify({"ok": False, "msg": "历程不存在或不属于你"}), 404
    if row["category"] not in HX_WITNESS_CATS:
        return jsonify({"ok": False, "msg": "只有「荣耀 / 重要」类历程可以邀请见证人"}), 400
    d = request.get_json(silent=True) or {}
    wuid = hx_find_user_by_did(d.get("did"))
    if not wuid:
        return jsonify({"ok": False, "msg": "没有找到这枚身份标识，请核对对方的 DID"}), 404
    if wuid == u["id"]:
        return jsonify({"ok": False, "msg": "不能邀请自己做见证人"}), 400
    statement = (d.get("statement") or "").strip()[:200]
    dup = db.execute("SELECT 1 FROM hx_witness WHERE record_id=? AND witness_uid=? "
                     "AND status!='declined'", (rid, wuid)).fetchone()
    if dup:
        return jsonify({"ok": False, "msg": "已经邀请过这位见证人了"}), 400
    cur = db.execute(
        "INSERT INTO hx_witness(record_id, owner_uid, witness_uid, statement, status, created_at) "
        "VALUES(?,?,?,?, 'pending', ?)", (rid, u["id"], wuid, statement, now()))
    db.commit()
    log_op("火星身份证·邀请见证人", f"记录ID:{rid}", u["id"])
    return jsonify({"ok": True, "msg": "邀请已发出，等待对方签名见证",
                    "witness_id": cur.lastrowid})


@app.route("/api/huoxing/witness/<int:wid>/sign", methods=["POST"])
@login_required
def api_hx_witness_sign(wid):
    """见证人签名：签名哈希 = 记录指纹 + 见证人DID + 见证语，写入见证人自己的链"""
    u = current_user()
    db = get_db()
    w = db.execute("SELECT * FROM hx_witness WHERE id=?", (wid,)).fetchone()
    if not w or w["witness_uid"] != u["id"]:
        return jsonify({"ok": False, "msg": "邀请不存在"}), 404
    if w["status"] != "pending":
        return jsonify({"ok": False, "msg": "该邀请已处理过"}), 400
    rec = db.execute("SELECT * FROM hx_records WHERE id=? AND deleted=0",
                     (w["record_id"],)).fetchone()
    if not rec:
        return jsonify({"ok": False, "msg": "原历程已被删除"}), 404
    d = request.get_json(silent=True) or {}
    statement = (d.get("statement") or w["statement"] or "").strip()[:200]
    wident = hx_identity_for(u)  # 确保见证人已铸造身份
    oident = hx_identity_brief(w["owner_uid"]) or {}
    ts = now()
    sign_hash = hx_sha(f"witness|{rec['payload_hash']}|{wident['did']}|{statement}|{ts}")
    payload = hx_json({"type": "witness", "record_id": rec["id"],
                       "record_hash": rec["payload_hash"], "owner_did": oident.get("did", ""),
                       "witness_did": wident["did"], "statement": statement,
                       "sign_hash": sign_hash})
    block = hx_append_block(db, u["id"], "witness", rec["id"], payload)
    db.execute("UPDATE hx_witness SET status='signed', statement=?, sign_hash=?, block_no=?, "
               "signed_at=? WHERE id=?", (statement, sign_hash, block["block_no"], ts, wid))
    db.commit()
    log_op("火星身份证·签名见证", f"记录ID:{rec['id']}", u["id"])
    return jsonify({"ok": True, "msg": "已签名见证，签名指纹写入你的身份链",
                    "sign_hash": sign_hash, "block": block})


@app.route("/api/huoxing/witness/<int:wid>/decline", methods=["POST"])
@login_required
def api_hx_witness_decline(wid):
    """婉拒见证邀请（不上链，仅更新状态）"""
    u = current_user()
    db = get_db()
    w = db.execute("SELECT * FROM hx_witness WHERE id=?", (wid,)).fetchone()
    if not w or w["witness_uid"] != u["id"]:
        return jsonify({"ok": False, "msg": "邀请不存在"}), 404
    if w["status"] != "pending":
        return jsonify({"ok": False, "msg": "该邀请已处理过"}), 400
    db.execute("UPDATE hx_witness SET status='declined' WHERE id=?", (wid,))
    db.commit()
    return jsonify({"ok": True, "msg": "已婉拒这次见证邀请"})


# ══════════════════ V1.7 · AI 记录助手（口述 → 历程草稿） ══════════════════
HX_AI_PROMPT = (
    "你是「火星身份证」的记录助手。用户口述了一段回忆，请整理成一条历程，"
    "只输出严格 JSON，不要输出任何其他文字：\n"
    '{"category":"历史/成绩/荣耀/难过/开心/纪念/重要 七选一",'
    '"title":"不超过18字的标题",'
    '"summary":"一句话摘要，不超过50字",'
    '"detail":"润色后的完整故事，100-260字，第一人称，温暖克制",'
    '"mood":"开心/幸福/骄傲/感恩/平静/怀念/难过/坚定 选一",'
    '"happened_on":"能推断时间则输出 YYYY 或 YYYY-MM 或 YYYY-MM-DD，否则空字符串"}\n'
    "用户口述："
)


def hx_ai_fallback(text):
    """大模型不可用时的本地启发式草稿：关键词归类 + 简单模板"""
    kw = {"荣耀": ["奖", "表彰", "第一", "冠军", "荣誉", "证书", "认可"],
          "成绩": ["完成", "达成", "通过", "考上", "签约", "突破", "学会"],
          "难过": ["失去", "失败", "离别", "遗憾", "生病", "挫折"],
          "开心": ["开心", "快乐", "旅行", "聚会", "惊喜", "笑"],
          "纪念": ["纪念", "周年", "照片", "遗物", "生日", "怀念"],
          "重要": ["决定", "选择", "转折", "创业", "结婚", "搬家", "入行"]}
    cat = "历史"
    for k, words in kw.items():
        if any(w in text for w in words):
            cat = k
            break
    title = text.strip().replace("\n", " ")[:18] or "一段历程"
    return {"category": cat, "title": title,
            "summary": text.strip()[:50], "detail": text.strip()[:260],
            "mood": "", "happened_on": "", "fallback": True}


@app.route("/api/huoxing/ai_draft", methods=["POST"])
@login_required
def api_hx_ai_draft():
    """AI 记录助手：口述一句话 → 分类/标题/摘要/详情草稿，人工确认后入链"""
    d = request.get_json(silent=True) or {}
    text = (d.get("text") or "").strip()
    if not (4 <= len(text) <= 500):
        return jsonify({"ok": False, "msg": "先说 4-500 个字的一段话"}), 400
    draft, via = None, "local"
    cfg = _agent_cfg()
    if agent_service.llm_enabled(cfg):
        ok, reply = agent_service.call_llm(
            [{"role": "user", "content": HX_AI_PROMPT + text}], cfg, max_tokens=600)
        if ok:
            try:
                i, j = reply.find("{"), reply.rfind("}")
                draft = json.loads(reply[i:j + 1])
                via = "ark"
            except (ValueError, json.JSONDecodeError):
                draft = None
    if not draft:
        draft = hx_ai_fallback(text)
    if draft.get("category") not in HX_CATS:
        draft["category"] = hx_ai_fallback(text)["category"]
    draft["title"] = (draft.get("title") or "")[:60]
    draft["summary"] = (draft.get("summary") or "")[:160]
    draft["detail"] = (draft.get("detail") or "")[:2000]
    log_op("火星身份证·AI草稿", f"来源:{via}", session.get("uid"))
    return jsonify({"ok": True, "draft": draft, "via": via,
                    "msg": "草稿已生成，请核对后保存入链" if via == "ark"
                           else "云端大模型未配置，已用本地智能整理；可在管理后台配置 ARK 提升效果"})


# ══════════════════ V1.7 · 家庭链（家庭记忆链） ══════════════════
@app.route("/api/huoxing/family", methods=["POST"])
@login_required
def api_hx_family_invite():
    """关联家人：输入对方 DID，对方确认后双向入链"""
    u = current_user()
    d = request.get_json(silent=True) or {}
    fuid = hx_find_user_by_did(d.get("did"))
    if not fuid:
        return jsonify({"ok": False, "msg": "没有找到这枚身份标识，请核对家人的 DID"}), 404
    if fuid == u["id"]:
        return jsonify({"ok": False, "msg": "不能关联自己"}), 400
    relation = (d.get("relation") or "家人").strip()[:12]
    db = get_db()
    dup = db.execute("SELECT 1 FROM hx_family WHERE (user_id=? AND family_uid=?) OR "
                     "(user_id=? AND family_uid=?)", (u["id"], fuid, fuid, u["id"])).fetchone()
    if dup:
        return jsonify({"ok": False, "msg": "你们已经在家庭链中了"}), 400
    db.execute("INSERT INTO hx_family(user_id, family_uid, relation, status, created_at) "
               "VALUES(?,?,?,'pending',?)", (u["id"], fuid, relation, now()))
    db.commit()
    log_op("火星身份证·家庭链邀请", f"关系:{relation}", u["id"])
    return jsonify({"ok": True, "msg": "邀请已发出，等家人确认后就挂上家庭记忆链"})


@app.route("/api/huoxing/family/<int:fid>/accept", methods=["POST"])
@login_required
def api_hx_family_accept(fid):
    """家人确认：双向确认，双方链上各写一个 family 区块"""
    u = current_user()
    db = get_db()
    f = db.execute("SELECT * FROM hx_family WHERE id=?", (fid,)).fetchone()
    if not f or f["family_uid"] != u["id"]:
        return jsonify({"ok": False, "msg": "邀请不存在"}), 404
    if f["status"] != "pending":
        return jsonify({"ok": False, "msg": "该邀请已处理过"}), 400
    my = hx_identity_for(u)
    other = hx_identity_brief(f["user_id"]) or {}
    ts = now()
    db.execute("UPDATE hx_family SET status='confirmed', confirmed_at=? WHERE id=?", (ts, fid))
    for uid, me_did, other_did in ((u["id"], my["did"], other.get("did", "")),
                                   (f["user_id"], other.get("did", ""), my["did"])):
        hx_append_block(db, uid, "family", 0, hx_json(
            {"type": "family", "relation": f["relation"],
             "me": me_did, "family": other_did}))
    db.commit()
    log_op("火星身份证·家庭链确认", f"关系:{f['relation']}", u["id"])
    return jsonify({"ok": True, "msg": "家庭记忆链已挂上，双方的链都留下了这一刻"})


@app.route("/api/huoxing/family/<int:fid>", methods=["DELETE"])
@login_required
def api_hx_family_remove(fid):
    """解除家庭链关联（任一方可操作；链上历史不删，仅解除关联）"""
    u = current_user()
    db = get_db()
    f = db.execute("SELECT * FROM hx_family WHERE id=?", (fid,)).fetchone()
    if not f or (f["user_id"] != u["id"] and f["family_uid"] != u["id"]):
        return jsonify({"ok": False, "msg": "关联不存在"}), 404
    db.execute("DELETE FROM hx_family WHERE id=?", (fid,))
    db.commit()
    log_op("火星身份证·解除家庭链", f"ID:{fid}", u["id"])
    return jsonify({"ok": True, "msg": "已解除关联（链上历史仍可追溯）"})


# ══════════════════ V1.7 · 数字遗产约定 ══════════════════
@app.route("/api/huoxing/legacy", methods=["PUT"])
@login_required
def api_hx_legacy_set():
    """设置数字遗产约定：指定继承人 DID；账号多年不活跃时，「纪念」类按约定移交"""
    u = current_user()
    d = request.get_json(silent=True) or {}
    heir_did = (d.get("heir_did") or "").strip()
    heir_name = (d.get("heir_name") or "").strip()[:20]
    note = (d.get("note") or "").strip()[:200]
    try:
        years = int(d.get("inactive_years") or 3)
    except (TypeError, ValueError):
        years = 3
    years = max(1, min(10, years))
    db = get_db()
    if not heir_did:  # 清空约定
        db.execute("DELETE FROM hx_legacy WHERE user_id=?", (u["id"],))
        hx_append_block(db, u["id"], "legacy", 0, hx_json({"type": "legacy", "action": "clear"}))
        db.commit()
        log_op("火星身份证·撤销遗产约定", "", u["id"])
        return jsonify({"ok": True, "msg": "遗产约定已撤销"})
    heir_uid = hx_find_user_by_did(heir_did)
    if not heir_uid:
        return jsonify({"ok": False, "msg": "没有找到继承人 DID，请先让对方铸造火星身份证"}), 404
    if heir_uid == u["id"]:
        return jsonify({"ok": False, "msg": "继承人不能是自己"}), 400
    ts = now()
    db.execute("INSERT INTO hx_legacy(user_id, heir_did, heir_name, inactive_years, scope, note, updated_at) "
               "VALUES(?,?,?,?,?,'纪念',?) "
               "ON CONFLICT(user_id) DO UPDATE SET heir_did=excluded.heir_did, "
               "heir_name=excluded.heir_name, inactive_years=excluded.inactive_years, "
               "note=excluded.note, updated_at=excluded.updated_at",
               (u["id"], heir_did, heir_name, years, note, ts))
    ident = hx_identity_for(u)
    hx_append_block(db, u["id"], "legacy", 0, hx_json(
        {"type": "legacy", "owner_did": ident["did"], "heir_did": heir_did,
         "inactive_years": years, "scope": "纪念"}))
    db.commit()
    log_op("火星身份证·遗产约定", f"继承人:{heir_name or heir_did[:18]}", u["id"])
    return jsonify({"ok": True, "msg": "遗产约定已写入你的身份链"})


# ══════════════════ V1.7 · 护照互认验证器（任何人可离线验真） ══════════════════
@app.route("/hx/verify")
def huoxing_verify_page():
    """护照验证器：上传火星护照 JSON，本地重算指纹验证真伪（无需登录）"""
    return render_template("huoxing_verify.html")


@app.route("/api/huoxing/passport_verify", methods=["POST"])
def api_hx_passport_verify():
    """服务端护照验真（前端 JS 验真的备用通道）：重算区块链 + 记录指纹"""
    d = request.get_json(silent=True) or {}
    p = d.get("passport")
    if not isinstance(p, dict) or "blocks" not in p:
        return jsonify({"ok": False, "msg": "护照文件不完整"}), 400
    issues = []
    prev = HX_GENESIS_HASH
    blocks = sorted(p.get("blocks", []), key=lambda b: b.get("block_no", 0))
    for b in blocks:
        if b.get("prev_hash") != prev:
            issues.append(f"第 {b.get('block_no')} 块与上一块衔接断裂")
        if hx_sha(b.get("payload", "")) != b.get("payload_hash"):
            issues.append(f"第 {b.get('block_no')} 块内容指纹被改动")
        expect = hx_sha(f"{b.get('block_no')}|{b.get('prev_hash')}|{b.get('action')}|"
                        f"{b.get('record_id') or 0}|{b.get('payload_hash')}|{b.get('created_at')}")
        if expect != b.get("block_hash"):
            issues.append(f"第 {b.get('block_no')} 块区块哈希不匹配")
        prev = b.get("block_hash", "")
    latest = {}
    for b in blocks:
        if b.get("action") in ("create", "update") and b.get("record_id"):
            latest[b["record_id"]] = b["payload_hash"]
    for rec in p.get("records", []):
        if latest.get(rec.get("id")) and latest[rec["id"]] != hx_sha(hx_record_payload(rec)):
            issues.append(f"记录「{rec.get('title', '?')}」与链上指纹不一致")
    head = blocks[-1]["block_hash"] if blocks else ""
    chain_head = (p.get("chain") or {}).get("head", "")
    if chain_head and head and chain_head != head:
        issues.append("护照记载的链头与区块重算结果不一致")
    return jsonify({"ok": True, "valid": not issues, "issues": issues[:8],
                    "height": len(blocks), "head": head,
                    "records": len(p.get("records", [])),
                    "mars_name": (p.get("identity") or {}).get("mars_name", ""),
                    "did": (p.get("identity") or {}).get("did", "")})


# ══════════════════ V1.7 · 年度火星年报 ══════════════════
def hx_annual_data(user_id, year, only_public=False):
    """汇总某一年的年报素材：当年历程、分类统计、等级成长"""
    all_recs = hx_records_for(user_id)
    if only_public:
        all_recs = [r for r in all_recs
                    if r.get("visibility") == "public" and not hx_capsule_locked(r)]
    yrecs = [hx_record_out(r) for r in all_recs if str(r["happened_on"]).startswith(str(year))]
    for r in yrecs:
        r["color"] = HX_COLOR.get(r["category"], "#f472b6")
    before = len([r for r in all_recs if str(r["happened_on"])[:4] < str(year)])
    after = before + len(yrecs)
    by = {c: 0 for c in HX_CATS}
    for r in yrecs:
        if r["category"] in by:
            by[r["category"]] += 1
    return {"year": year, "records": sorted(yrecs, key=lambda x: x["happened_on"]),
            "by_category": by, "total": len(yrecs),
            "level_before": hx_level(before)[0], "level_after": hx_level(after)[0],
            "level_grew": hx_level(before)[0] != hx_level(after)[0]}


@app.route("/huoxing/annual/<int:year>")
def huoxing_annual(year):
    """我的年度火星年报（含私密记录，仅本人可见）"""
    u = current_user()
    if not u:
        return redirect(url_for("login_page"))
    ident = hx_identity_for(u)
    data = hx_annual_data(u["id"], year)
    ident = dict(ident)
    ident.update({"level": hx_stats(hx_records_for(u["id"]))["level"]})
    return render_template("huoxing_annual.html", identity=ident, data=data,
                           public_url=f"{PUBLIC_BASE}/hx/annual/{ident['did']}/{year}",
                           categories=HX_CATEGORIES, mine=True)


@app.route("/hx/annual/<path:did>/<int:year>")
def huoxing_annual_public(did, year):
    """公开年报海报页：只展示公开且已解锁的历程，可分享"""
    db = get_db()
    row = db.execute("SELECT * FROM hx_identity WHERE did=?", (did,)).fetchone()
    if not row or not row["public_card"]:
        return render_template("huoxing_card.html", identity=None, records=[],
                               stats=None, chain=None,
                               reason="这份年报不存在，或主人已关闭公开见证。"), 404
    data = hx_annual_data(row["user_id"], year, only_public=True)
    ident = dict(row)
    ident.update({"level": hx_stats(hx_records_for(row["user_id"]))["level"]})
    return render_template("huoxing_annual.html", identity=ident, data=data,
                           public_url="", categories=HX_CATEGORIES, mine=False)


@app.route("/tools")
def tools_page():
    """工具清单与使用说明（GitHub 全部可外部访问内容汇总）"""
    eco = load_ecosystem()
    tools = eco.get("tools", [])
    online = [t for t in tools if t.get("url")]
    return render_template("tools.html", tools=tools,
                           total=len(tools), online=len(online))


@app.route("/login")
def login_page():
    if session.get("uid"):
        return redirect(url_for("index"))
    return render_template("auth.html")


@app.route("/admin")
def admin_page():
    u = current_user()
    if not u:
        return redirect(url_for("login_page"))
    if u["role"] != "admin":
        return render_template("auth.html", deny="该页面需要管理员权限")
    return render_template("admin.html", wish_status=WISH_STATUS,
                           product_status=PRODUCT_STATUS)


# ══════════════════ 统一账号 API（V0.1本地实现，预留打通） ══════════════════
@app.route("/api/auth/register", methods=["POST"])
def api_register():
    d = request.get_json(silent=True) or {}
    username = (d.get("username") or "").strip()
    password = d.get("password") or ""
    nickname = (d.get("nickname") or "").strip() or username
    ref = (d.get("ref") or "").strip().upper()
    if not (3 <= len(username) <= 20):
        return jsonify({"ok": False, "msg": "用户名需3-20个字符"}), 400
    if len(password) < 6:
        return jsonify({"ok": False, "msg": "密码至少6位"}), 400
    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE username=?", (username,)).fetchone():
        return jsonify({"ok": False, "msg": "用户名已存在"}), 400
    inviter_id, inviter_name, ref_msg = None, None, ""
    if ref:
        row = db.execute("SELECT id, nickname FROM users WHERE invite_code=?", (ref,)).fetchone()
        if row:
            inviter_id, inviter_name = row["id"], row["nickname"]
            ref_msg = "\uff0c已关联邀请人「%s」" % inviter_name
        else:
            ref_msg = "\uff0c邀请码无效，已按自然流量登记"
    # 首个注册用户自动成为管理员
    is_first = db.execute("SELECT COUNT(*) c FROM users").fetchone()["c"] == 0
    role = "admin" if is_first else "user"
    cur = db.execute(
        "INSERT INTO users(username, password_hash, nickname, role, inviter_id, created_at) VALUES(?,?,?,?,?,?)",
        (username, generate_password_hash(password), nickname, role, inviter_id, now()))
    uid = cur.lastrowid
    invite_code = "ECJ%d" % (10000 + uid)
    db.execute("UPDATE users SET invite_code=? WHERE id=?", (invite_code, uid))
    db.commit()
    session["uid"] = uid
    log_op("注册账号", f"用户名:{username} 角色:{role} 邀请人:{inviter_id}", uid)
    return jsonify({"ok": True, "msg": "注册成功" + ref_msg, "role": role,
                    "invite_code": invite_code,
                    "nickname": nickname, "redirect": url_for("index")})


@app.route("/api/auth/login", methods=["POST"])
def api_login():
    d = request.get_json(silent=True) or {}
    username = (d.get("username") or "").strip()
    password = d.get("password") or ""
    row = get_db().execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify({"ok": False, "msg": "用户名或密码错误"}), 400
    if row["role"] == "disabled":
        return jsonify({"ok": False, "msg": "账号已被禁用"}), 403
    session["uid"] = row["id"]
    log_op("登录", f"用户名:{username}", row["id"])
    return jsonify({"ok": True, "msg": f"欢迎回来，{row['nickname']}",
                    "role": row["role"], "nickname": row["nickname"],
                    "redirect": url_for("index")})


@app.route("/api/auth/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify({"ok": True, "redirect": url_for("index")})


@app.route("/api/auth/status")
def api_auth_status():
    u = current_user()
    if not u:
        return jsonify({"ok": True, "login": False})
    return jsonify({"ok": True, "login": True, "username": u["username"],
                    "nickname": u["nickname"], "role": u["role"]})


@app.route("/api/auth/bridge")
def api_auth_bridge():
    """预留接口：供子站（资料百事通等）核对统一账号。
    V0.1 仅返回协议说明，V1.0 将实现token互认。"""
    return jsonify({
        "ok": True, "service": "数字生态家园统一账号", "version": VERSION,
        "note": "V0.1预留接口：子站可携带用户token调用本接口完成账号互认",
        "plan": "V1.0实现 HMAC-SHA256 token 互认，打通资料百事通用户库"
    })


# ══════════════════ 生态底座 API（供其他程序调用 / 查找 / 新增 / 修改） ══════════════════
@app.route("/api/ecosystem/manifest")
def api_ecosystem_manifest():
    """底座全量数据：其他程序或网页读取生态信息的单一入口"""
    return jsonify({"ok": True, "manifest": load_ecosystem()})


@app.route("/api/ecosystem/search")
def api_ecosystem_search():
    """在底座中查找：产品 / 硬件 / 子域名 / 接口"""
    q = (request.args.get("q") or "").strip().lower()
    if not q:
        return jsonify({"ok": False, "msg": "请输入查找关键词"}), 400
    eco = load_ecosystem()

    def match(*vals):
        return q in " ".join(str(v) for v in vals).lower()

    hits = []
    for p in eco.get("products", []):
        if match(p.get("no"), p.get("name"), p.get("en"), p.get("scope"),
                 p.get("desc"), p.get("status")):
            hits.append({"type": "product", "item": p})
    for h in eco.get("hardware", []):
        if match(h.get("name"), h.get("desc")):
            hits.append({"type": "hardware", "item": h})
    for s in eco.get("subdomains", []):
        if match(s.get("host"), s.get("target"), s.get("status")):
            hits.append({"type": "subdomain", "item": s})
    for a in eco.get("apis", []):
        if match(a.get("method"), a.get("path"), a.get("desc")):
            hits.append({"type": "api", "item": a})
    return jsonify({"ok": True, "query": q, "count": len(hits), "hits": hits})


@app.route("/api/ecosystem/products", methods=["POST"])
@admin_required
def api_ecosystem_add_product():
    """新增积木：自动编号，始终插在「待添加」之前"""
    d = request.get_json(silent=True) or {}
    name = (d.get("name") or "").strip()
    if not name:
        return jsonify({"ok": False, "msg": "请填写积木名称"}), 400
    eco = load_ecosystem()
    products = eco.get("products", [])
    if any(p.get("name") == name for p in products):
        return jsonify({"ok": False, "msg": "已存在同名积木"}), 400
    item = {
        "name": name,
        "en": (d.get("en") or "").strip(),
        "scope": (d.get("scope") or "").strip(),
        "icon": (d.get("icon") or "🧩").strip(),
        "status": d.get("status") if d.get("status") in PRODUCT_STATUS else "规划中",
        "main": False,
        "url": (d.get("url") or "").strip(),
        "desc": (d.get("desc") or "").strip(),
    }
    idx = next((i for i, p in enumerate(products) if p.get("name") == "待添加"), len(products))
    products.insert(idx, item)
    renumber(products)
    eco["products"] = products
    save_ecosystem(eco)
    log_op("新增积木", name, session.get("uid"))
    return jsonify({"ok": True, "msg": f"积木「{name}」已加入矩阵", "item": item})


@app.route("/api/ecosystem/products/<no>", methods=["PUT"])
@admin_required
def api_ecosystem_update_product(no):
    """修改积木（按编号）"""
    d = request.get_json(silent=True) or {}
    eco = load_ecosystem()
    products = eco.get("products", [])
    target = next((p for p in products if p.get("no") == no), None)
    if not target:
        return jsonify({"ok": False, "msg": f"未找到编号 {no} 的积木"}), 404
    if target.get("name") == "待添加":
        return jsonify({"ok": False, "msg": "「待添加」占位不可修改"}), 400
    for k in ("name", "en", "scope", "icon", "url", "desc"):
        if str(d.get(k, "")).strip():
            target[k] = str(d[k]).strip()
    if d.get("status") in PRODUCT_STATUS:
        target["status"] = d["status"]
    save_ecosystem(eco)
    log_op("修改积木", f"{no} {target.get('name')}", session.get("uid"))
    return jsonify({"ok": True, "msg": "已更新", "item": target})


@app.route("/api/ecosystem/products/<no>", methods=["DELETE"])
@admin_required
def api_ecosystem_delete_product(no):
    """移除积木：编号自动重排，「待添加」保持在末位"""
    eco = load_ecosystem()
    products = eco.get("products", [])
    target = next((p for p in products if p.get("no") == no), None)
    if not target:
        return jsonify({"ok": False, "msg": f"未找到编号 {no} 的积木"}), 404
    if target.get("name") == "待添加":
        return jsonify({"ok": False, "msg": "「待添加」占位不可删除"}), 400
    products.remove(target)
    renumber(products)
    eco["products"] = products
    save_ecosystem(eco)
    log_op("移除积木", f"{no} {target.get('name')}", session.get("uid"))
    return jsonify({"ok": True, "msg": f"积木「{target.get('name')}」已移除"})


@app.route("/api/products")
def api_products():
    return jsonify({"ok": True, "products": get_products()})


@app.route("/api/brands")
def api_brands():
    """生态品牌（带英文名的积木）"""
    return jsonify({"ok": True, "brands": [p for p in get_products() if p.get("en")]})


@app.route("/api/tools")
def api_tools():
    """工具清单（GitHub 全部可外部访问内容的汇总），供其他程序调用"""
    eco = load_ecosystem()
    tools = eco.get("tools", [])
    return jsonify({"ok": True, "count": len(tools), "online": len([t for t in tools if t.get("url")]),
                    "tools": tools})


@app.route("/api/ecosystem/status")
def api_ecosystem_status():
    """生态总览（供其他程序/子站调用）"""
    eco = load_ecosystem()
    meta = eco.get("meta", {})
    db = get_db()
    users = db.execute("SELECT COUNT(*) c FROM users").fetchone()["c"]
    wishes = db.execute("SELECT COUNT(*) c FROM wishes").fetchone()["c"]
    main = get_main_product()
    return jsonify({
        "ok": True,
        "name": meta.get("name", "数字生态家园"),
        "domain": meta.get("domain", "ecojia.cn"),
        "version": VERSION,
        "author": meta.get("author", "军哥懂保"),
        "wechat": meta.get("wechat", "xunijiayuan"),
        "main_product": {"name": main.get("name", ""),
                         "url": main.get("url") or MAIN_SITE_URL,
                         "status": main.get("status", "")},
        "products_count": len(get_products()),
        "hardware": [h.get("name", "") for h in get_hardware()],
        "stats": {"users": users, "wishes": wishes},
        "updated_at": now()
    })


# ══════════════════ 生态智能体「小鸽子」API（悬浮球/浮窗对话） ══════════════════
def _agent_cfg():
    """读取大模型配置：环境变量优先，其次 agent_config 表（管理后台可改）"""
    cfg = {"api_key": os.environ.get("ARK_API_KEY", "").strip(),
           "model": os.environ.get("ARK_MODEL", "").strip(),
           "ollama_url": os.environ.get("OLLAMA_URL", "").strip(),
           "ollama_model": os.environ.get("OLLAMA_MODEL", "").strip()}
    try:
        rows = get_db().execute("SELECT key, value FROM agent_config").fetchall()
        table = {r["key"]: r["value"] for r in rows}
        cfg["api_key"] = cfg["api_key"] or table.get("ark_api_key", "")
        cfg["model"] = cfg["model"] or table.get("ark_model", "")
        cfg["ollama_url"] = cfg["ollama_url"] or table.get("ollama_url", "")
        cfg["ollama_model"] = cfg["ollama_model"] or table.get("ollama_model", "")
    except sqlite3.Error:
        pass
    return cfg


def _agent_sid(d):
    """会话标识：前端传入，缺失则按游客指纹生成"""
    sid = (d.get("session_id") or "").strip()
    if not sid:
        sid = "guest-" + (request.headers.get("User-Agent", "")[-24:] or "anon")
    return sid[:64]


def _agent_log(sid, role, content, page_url="", intent=""):
    db = get_db()
    db.execute("INSERT INTO agent_chat(session_id,user_id,role,content,page_url,intent,created_at) "
               "VALUES(?,?,?,?,?,?,?)",
               (sid, session.get("uid"), role, content[:4000], page_url[:300], intent, now()))
    db.commit()


def _tool_health_check(tool):
    """对单个工具做健康检查；带60秒缓存避免频繁外呼"""
    no = tool.get("no", "")
    cache = getattr(_tool_health_check, "_cache", {})
    ent = cache.get(no)
    if ent and (datetime.now() - ent[0]).total_seconds() < 60:
        return ent[1]
    rep = agent_service.check_url(tool.get("url"))
    if not hasattr(_tool_health_check, "_cache"):
        _tool_health_check._cache = {}
    _tool_health_check._cache = getattr(_tool_health_check, "_cache", {})
    _tool_health_check._cache[no] = (datetime.now(), rep)
    return rep


@app.route("/api/agent/chat", methods=["POST"])
def api_agent_chat():
    """智能体对话：知识库引擎优先 → 大模型兜底（配置后启用）"""
    d = request.get_json(silent=True) or {}
    message = (d.get("message") or "").strip()
    page_url = (d.get("page_url") or "").strip()
    if not (1 <= len(message) <= 500):
        return jsonify({"ok": False, "msg": "消息需1-500字"}), 400
    sid = _agent_sid(d)
    eco = load_ecosystem()

    result = agent_service.agent_answer(
        message, eco, page_url=page_url, health_checker=_tool_health_check)
    if result and result[0]:
        reply, intent, cards, health = result
        # 故障确认异常 → 写运维日志 + 给管理员提个醒（许愿墙机制复用op_log）
        if intent == "health_bad" and health:
            log_op("智能体发现故障",
                   f"{health.get('url')} -> {health.get('error')}", session.get("uid"))
    else:
        # 大模型兜底：火山方舟(已配置) → 本地Ollama → 友好话术
        cfg = _agent_cfg()
        sys_prompt = (
            "你是数字生态家园(ecojia.cn)的网站智能体「小鸽子」，语气亲切专业，用中文回答。"
            "只回答与本网站生态相关的问题：工具在哪、怎么用、故障排查、账号登录、许愿反馈。"
            "回答控制在200字内，涉及工具时给出具体链接。\n\n"
            + agent_service.knowledge_text(eco))
        ok, reply = agent_service.call_llm(
            [{"role": "system", "content": sys_prompt},
             {"role": "user", "content": message}], cfg)
        if not ok:
            reply = agent_service.FALLBACK_REPLY
        intent, cards, health = "llm" if ok else "fallback", [], None

    _agent_log(sid, "user", message, page_url, "")
    _agent_log(sid, "assistant", reply, page_url, intent)
    return jsonify({"ok": True, "reply": reply, "intent": intent, "cards": cards,
                    "health": health, "session_id": sid,
                    "suggestions": agent_service.SUGGESTIONS})


@app.route("/api/agent/history")
def api_agent_history():
    """对话记忆：按会话取最近30条（前端打开浮窗时回填）"""
    sid = (request.args.get("session_id") or "").strip()[:64]
    if not sid:
        return jsonify({"ok": True, "messages": []})
    rows = get_db().execute(
        "SELECT role, content, intent, created_at FROM agent_chat "
        "WHERE session_id=? ORDER BY id DESC LIMIT 30", (sid,)).fetchall()
    return jsonify({"ok": True, "messages": [dict(r) for r in reversed(rows)]})


@app.route("/api/agent/history", methods=["DELETE"])
def api_agent_history_clear():
    """清空本会话对话记录（增删查改的删）"""
    d = request.get_json(silent=True) or {}
    sid = (d.get("session_id") or "").strip()[:64]
    if not sid:
        return jsonify({"ok": False, "msg": "缺少会话标识"}), 400
    db = get_db()
    db.execute("DELETE FROM agent_chat WHERE session_id=?", (sid,))
    db.commit()
    return jsonify({"ok": True, "msg": "对话记录已清空"})


@app.route("/api/agent/config", methods=["GET", "POST"])
@admin_required
def api_agent_config():
    """大模型配置（仅管理员）：填入火山方舟接入点即启用大模型增强"""
    db = get_db()
    if request.method == "POST":
        d = request.get_json(silent=True) or {}
        for k in ("ark_api_key", "ark_model", "ollama_url", "ollama_model"):
            v = (d.get(k) or "").strip()
            if v:
                db.execute("INSERT INTO agent_config(key,value,updated_at) VALUES(?,?,?) "
                           "ON CONFLICT(key) DO UPDATE SET value=excluded.value, "
                           "updated_at=excluded.updated_at", (k, v, now()))
        db.commit()
        log_op("更新智能体配置", "ark_model=" + (d.get("ark_model") or ""), session.get("uid"))
        return jsonify({"ok": True, "msg": "已保存"})
    cfg = _agent_cfg()
    return jsonify({"ok": True,
                    "config": {"ark_model": cfg.get("model", ""),
                               "ark_api_key": ("已配置" if cfg.get("api_key") else ""),
                               "llm_enabled": agent_service.llm_enabled(cfg)}})


@app.route("/api/tools/health")
def api_tools_health():
    """全部在线工具健康检查（并发，供智能体与监控调用）"""
    eco = load_ecosystem()
    items = [(t.get("no"), t.get("name"), t.get("url"))
             for t in eco.get("tools", []) if t.get("url")]
    reports = agent_service.check_tools_parallel(items)
    ok_n = sum(1 for r in reports.values() if r.get("ok"))
    return jsonify({"ok": True, "total": len(reports), "healthy": ok_n,
                    "checked_at": now(),
                    "reports": sorted(reports.values(), key=lambda r: r.get("no") or "")})


@app.route("/api/tools/health/<no>")
def api_tool_health_one(no):
    """单个工具健康检查（智能体「先检查再回答」的底层能力）"""
    eco = load_ecosystem()
    tool = next((t for t in eco.get("tools", []) if t.get("no") == no), None)
    if not tool:
        return jsonify({"ok": False, "msg": f"未找到工具 {no}"}), 404
    rep = _tool_health_check(tool)
    rep["name"], rep["no"] = tool.get("name"), no
    return jsonify({"ok": True, "report": rep})


# ══════════════════ 许愿墙 API（增删查改 + 操作记忆） ══════════════════
@app.route("/api/wishes", methods=["GET"])
def api_wishes_list():
    kw = (request.args.get("kw") or "").strip()
    product = (request.args.get("product") or "").strip()
    sql = ("SELECT w.*, u.nickname FROM wishes w "
           "LEFT JOIN users u ON u.id=w.user_id WHERE 1=1")
    args = []
    if kw:
        sql += " AND (w.content LIKE ? OR w.contact LIKE ? OR w.product LIKE ?)"
        args += [f"%{kw}%"] * 3
    if product:
        sql += " AND w.product=?"
        args.append(product)
    sql += " ORDER BY w.id DESC LIMIT 200"
    rows = get_db().execute(sql, args).fetchall()
    wishes = []
    for r in rows:
        w = dict(r)
        w["mine"] = bool(session.get("uid") and w["user_id"] == session["uid"])
        w["can_manage"] = w["mine"] or (current_user() or {}).get("role") == "admin"
        # 隐私：联系方式仅本人和管理员可见，游客/他人看不到
        if not w["can_manage"]:
            w.pop("contact", None)
        wishes.append(w)
    return jsonify({"ok": True, "wishes": wishes,
                    "status_options": WISH_STATUS})


@app.route("/api/wishes", methods=["POST"])
def api_wishes_create():
    d = request.get_json(silent=True) or {}
    product = (d.get("product") or "").strip()
    contact = (d.get("contact") or "").strip()
    content = (d.get("content") or "").strip()
    if not product:
        return jsonify({"ok": False, "msg": "请选择许愿产品"}), 400
    if not (5 <= len(contact) <= 100):
        return jsonify({"ok": False, "msg": "联系方式需5-100个字符"}), 400
    if not (5 <= len(content) <= 300):
        return jsonify({"ok": False, "msg": "愿望内容需5-300个字"}), 400
    uid = session.get("uid")
    db = get_db()
    db.execute("INSERT INTO wishes(user_id, product, contact, content, status, created_at, updated_at) "
               "VALUES(?,?,?,?,?,?,?)",
               (uid, product, contact, content, "待评估", now(), now()))
    db.commit()
    log_op("提交许愿", f"产品:{product}", uid)
    return jsonify({"ok": True, "msg": "愿望已收录，感谢您的共创！"})


@app.route("/api/wishes/<int:wid>", methods=["PUT"])
def api_wishes_update(wid):
    u = current_user()
    if not u:
        return jsonify({"ok": False, "msg": "请先登录"}), 401
    row = get_db().execute("SELECT * FROM wishes WHERE id=?", (wid,)).fetchone()
    if not row:
        return jsonify({"ok": False, "msg": "许愿不存在"}), 404
    d = request.get_json(silent=True) or {}
    new_content = (d.get("content") or "").strip()
    new_status = (d.get("status") or "").strip()
    is_admin = u["role"] == "admin"
    is_owner = row["user_id"] == u["id"]
    if not is_admin and not is_owner:
        return jsonify({"ok": False, "msg": "只能修改自己的许愿"}), 403
    content = new_content.strip() if new_content else row["content"]
    status = new_status if (new_status in WISH_STATUS and is_admin) else row["status"]
    if new_content and not (5 <= len(content) <= 300):
        return jsonify({"ok": False, "msg": "愿望内容需5-300个字"}), 400
    db = get_db()
    db.execute("UPDATE wishes SET content=?, status=?, updated_at=? WHERE id=?",
               (content, status, now(), wid))
    db.commit()
    log_op("修改许愿" if not is_admin else "管理许愿", f"ID:{wid}", u["id"])
    return jsonify({"ok": True, "msg": "已更新"})


@app.route("/api/wishes/<int:wid>", methods=["DELETE"])
def api_wishes_delete(wid):
    u = current_user()
    if not u:
        return jsonify({"ok": False, "msg": "请先登录"}), 401
    row = get_db().execute("SELECT * FROM wishes WHERE id=?", (wid,)).fetchone()
    if not row:
        return jsonify({"ok": False, "msg": "许愿不存在"}), 404
    if u["role"] != "admin" and row["user_id"] != u["id"]:
        return jsonify({"ok": False, "msg": "只能删除自己的许愿"}), 403
    db = get_db()
    db.execute("DELETE FROM wishes WHERE id=?", (wid,))
    db.commit()
    log_op("删除许愿", f"ID:{wid}", u["id"])
    return jsonify({"ok": True, "msg": "已删除"})


@app.route("/api/my/wishes")
@login_required
def api_my_wishes():
    """操作记忆：快速调取自己之前提交的许愿记录"""
    rows = get_db().execute(
        "SELECT * FROM wishes WHERE user_id=? ORDER BY id DESC", (session["uid"],)).fetchall()
    return jsonify({"ok": True, "wishes": [dict(r) for r in rows]})


# ══════════════════ 管理后台 API ══════════════════
@app.route("/api/admin/overview")
@admin_required
def api_admin_overview():
    db = get_db()
    stats = {
        "users": db.execute("SELECT COUNT(*) c FROM users").fetchone()["c"],
        "wishes": db.execute("SELECT COUNT(*) c FROM wishes").fetchone()["c"],
        "pending": db.execute("SELECT COUNT(*) c FROM wishes WHERE status='待评估'").fetchone()["c"],
        "accepted": db.execute("SELECT COUNT(*) c FROM wishes WHERE status IN ('已纳入规划','开发中','已上线')").fetchone()["c"],
    }
    return jsonify({"ok": True, "stats": stats})


@app.route("/api/admin/logs")
@admin_required
def api_admin_logs():
    rows = get_db().execute(
        "SELECT l.*, u.nickname FROM op_log l LEFT JOIN users u ON u.id=l.user_id "
        "ORDER BY l.id DESC LIMIT 100").fetchall()
    return jsonify({"ok": True, "logs": [dict(r) for r in rows]})


# ══════════════════ 统一后台中枢（各子站后台总入口） ══════════════════
import urllib.request

HUB_TIMEOUT = 2.5
HUB_FILE = os.path.join(BASE_DIR, "admin_centers.json")
_hub_cache = {"mtime": None, "data": []}


def load_hub_centers():
    """统一后台注册表（独立文件，避免 ecosystem.json 被自动化同步覆盖）"""
    try:
        mtime = os.path.getmtime(HUB_FILE)
    except OSError:
        return []
    if _hub_cache["mtime"] != mtime:
        try:
            with open(HUB_FILE, "r", encoding="utf-8") as f:
                _hub_cache["data"] = json.load(f)
            _hub_cache["mtime"] = mtime
        except (OSError, ValueError) as e:
            print(f"[中枢] admin_centers.json 读取失败：{e}")
    return _hub_cache["data"]


def save_hub_centers(data):
    with open(HUB_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    _hub_cache["mtime"] = None


def _pick(data, path):
    cur = data
    for k in (path or "").split("."):
        if not k:
            continue
        if not isinstance(cur, dict):
            return None
        cur = cur.get(k)
    return cur


def probe_center(c):
    """服务端探测子站状态与指标（仅允许本机回环地址，避免 SSRF）"""
    url = (c.get("probe") or "").strip()
    if not url:
        return "static", {}
    if not (url.startswith("http://127.0.0.1:") or url.startswith("http://localhost:")):
        return "unknown", {}
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "EcoJia-Hub/1.0"})
        with urllib.request.urlopen(req, timeout=HUB_TIMEOUT) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        metrics = {}
        for m in c.get("metrics", []):
            v = _pick(payload, m.get("path"))
            if v is not None:
                metrics[m.get("label") or ""] = v
        return "online", metrics
    except Exception:
        return "offline", {}


@app.route("/console")
def console_page():
    u = current_user()
    if not u:
        return redirect(url_for("login_page"))
    if u["role"] != "admin":
        return render_template("auth.html", deny="该页面需要管理员权限")
    return render_template("console.html")


@app.route("/api/admin/hub")
@admin_required
def api_admin_hub():
    items = []
    online = 0
    static = 0
    for c in load_hub_centers():
        status, metrics = probe_center(c)
        if status == "online":
            online += 1
        elif status == "static":
            static += 1
        item = dict(c)
        item["status"] = status
        item["metrics"] = metrics
        items.append(item)
    return jsonify({"ok": True, "centers": items,
                    "summary": {"total": len(items), "online": online, "static": static}})


@app.route("/api/admin/hub/register", methods=["POST"])
@admin_required
def api_admin_hub_register():
    d = request.get_json(silent=True) or {}
    cid = (d.get("id") or "").strip()
    name = (d.get("name") or "").strip()
    if not cid or not name:
        return jsonify({"ok": False, "msg": "id 与 name 必填"}), 400
    centers = list(load_hub_centers())
    item = {
        "id": cid,
        "name": name,
        "desc": (d.get("desc") or "").strip(),
        "icon": (d.get("icon") or "🧩").strip(),
        "public_url": (d.get("public_url") or "").strip(),
        "admin_url": (d.get("admin_url") or "").strip(),
        "probe": (d.get("probe") or "").strip(),
        "metrics": d.get("metrics") or [],
        "auth": (d.get("auth") or "").strip(),
        "note": (d.get("note") or "").strip(),
    }
    idx = next((i for i, c in enumerate(centers) if c.get("id") == cid), -1)
    if idx >= 0:
        centers[idx] = item
    else:
        centers.append(item)
    save_hub_centers(centers)
    log_op("登记统一后台", f"{cid} {name}", session.get("uid"))
    return jsonify({"ok": True, "msg": f"已登记「{name}」", "item": item})


@app.route("/api/admin/hub/<cid>", methods=["DELETE"])
@admin_required
def api_admin_hub_delete(cid):
    centers = list(load_hub_centers())
    target = next((c for c in centers if c.get("id") == cid), None)
    if not target:
        return jsonify({"ok": False, "msg": "未找到该后台"}), 404
    centers.remove(target)
    save_hub_centers(centers)
    log_op("移除统一后台", cid, session.get("uid"))
    return jsonify({"ok": True, "msg": "已移除"})


# ══════════════════ 密钥与模型健康监控（V1.7 追加） ══════════════════
import key_check


@app.route("/keys")
def keys_page():
    """密钥健康看板：仅管理员可见，密钥只显示打码指纹"""
    u = current_user()
    if not u:
        return redirect(url_for("login_page"))
    if u["role"] != "admin":
        return render_template("auth.html", deny="该页面需要管理员权限")
    return render_template("keys.html")


@app.route("/api/keys/status")
@admin_required
def api_keys_status():
    force = request.args.get("refresh") == "1"
    return jsonify({"ok": True, "status": key_check.get_status(force=force)})


# ══════════════════ 悬浮计时器静态页（网页端） ══════════════════
@app.route("/timer")
@app.route("/timer/")
@app.route("/timer/<path:filename>")
def timer_static(filename="index.html"):
    """悬浮计时器网页端：www.ecojia.cn/timer/ 直接打开，version.json 供三端检查更新"""
    return send_from_directory(os.path.join(app.root_path, "static", "timer"), filename)


# ══════════════════ 推广系统 V2：专属邀请码 · 实名认证 · 关系链 ══════════════════
def _get_setting(key, default=""):
    row = get_db().execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return row["value"] if row else default


@app.route("/api/promo/config")
def api_promo_config():
    """公开：推广弹窗所需配置（微信群二维码、合伙人支付二维码、联系方式）"""
    return jsonify({"ok": True,
                    "group_qr": _get_setting("promo_group_qr"),
                    "pay_qr": _get_setting("promo_pay_qr"),
                    "pay_price": _get_setting("promo_pay_price", "999"),
                    "wechat": "xunijiayuan",
                    "site": "www.ecojia.cn"})


@app.route("/api/promo/me")
def api_promo_me():
    """登录后：我的专属邀请码 + 已邀请人数 + 实名状态 + 合伙人状态"""
    u = current_user()
    if not u:
        return jsonify({"ok": False, "login": False, "msg": "未登录"}), 401
    db = get_db()
    code = u.get("invite_code") or ("ECJ%d" % (10000 + u["id"]))
    if not u.get("invite_code"):
        db.execute("UPDATE users SET invite_code=? WHERE id=?", (code, u["id"]))
        db.commit()
    cnt = db.execute("SELECT COUNT(*) c FROM users WHERE inviter_id=?", (u["id"],)).fetchone()["c"]
    return jsonify({"ok": True, "login": True,
                    "invite_code": code,
                    "invite_url": "https://ecojia.cn/login?ref=" + code,
                    "invited": cnt,
                    "verified": bool(u.get("realname_at")),
                    "real_name": u.get("real_name") or "",
                    "is_partner": bool(u.get("is_partner")),
                    "nickname": u["nickname"]})


@app.route("/api/promo/realname", methods=["POST"])
@login_required
def api_promo_realname():
    """实名认证（姓名+身份证号），认证后即可参与推广"""
    d = request.get_json(silent=True) or {}
    name = (d.get("real_name") or "").strip()
    idcard = (d.get("real_idcard") or "").strip().upper()
    if not (2 <= len(name) <= 8):
        return jsonify({"ok": False, "msg": "请输入真实姓名（2-8字）"}), 400
    if not re.fullmatch(r"\d{15}|\d{17}[\dX]", idcard):
        return jsonify({"ok": False, "msg": "身份证号格式不正确（15位或18位）"}), 400
    uid = session["uid"]
    db = get_db()
    db.execute("UPDATE users SET real_name=?, real_idcard=?, realname_at=? WHERE id=?",
               (name, idcard, now(), uid))
    db.commit()
    log_op("实名认证", "姓名:%s" % name, uid)
    return jsonify({"ok": True, "msg": "实名认证成功，专属邀请码已激活"})


@app.route("/api/admin/promo/qr", methods=["POST"])
@admin_required
def api_admin_promo_qr():
    """后台设置二维码：kind=group(推广微信群) / pay(合伙人999元支付)"""
    d = request.get_json(silent=True) or {}
    kind = d.get("kind")
    data_url = d.get("data_url") or ""
    if kind not in ("group", "pay"):
        return jsonify({"ok": False, "msg": "kind 只能是 group / pay"}), 400
    m = re.match(r"^data:image/(png|jpeg|jpg|webp);base64,(.+)$", data_url, re.S)
    if not m:
        return jsonify({"ok": False, "msg": "请上传 PNG/JPG/WEBP 图片"}), 400
    ext = "jpg" if m.group(1) in ("jpeg", "jpg") else m.group(1)
    raw = base64.b64decode(m.group(2))
    if len(raw) > 2 * 1024 * 1024:
        return jsonify({"ok": False, "msg": "图片不能超过 2MB"}), 400
    updir = os.path.join(app.root_path, "static", "uploads")
    os.makedirs(updir, exist_ok=True)
    fname = "promo_%s.%s" % (kind, ext)
    with open(os.path.join(updir, fname), "wb") as f:
        f.write(raw)
    url = "/static/uploads/" + fname
    db = get_db()
    db.execute("INSERT INTO settings(key, value) VALUES(?, ?) "
               "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
               ("promo_%s_qr" % kind, url))
    db.commit()
    log_op("设置推广二维码", "类型:%s" % kind, session.get("uid"))
    return jsonify({"ok": True, "msg": "二维码已更新", "url": url})


@app.route("/api/admin/promo/tree")
@admin_required
def api_admin_promo_tree():
    """推广关系总览：谁推广了谁（管理员）"""
    db = get_db()
    rows = db.execute("""
        SELECT u.id, u.username, u.nickname, u.invite_code, u.real_name,
               u.realname_at, u.is_partner, u.created_at, u.inviter_id,
               i.nickname AS inviter_name, i.invite_code AS inviter_code,
               (SELECT COUNT(*) FROM users x WHERE x.inviter_id = u.id) AS invited
        FROM users u LEFT JOIN users i ON i.id = u.inviter_id
        ORDER BY u.id DESC
    """).fetchall()
    return jsonify({"ok": True, "users": [dict(r) for r in rows]})


# ══════════════════ 启动 ══════════════════
# ══════════════════ 统一账号 · 跨项目权益 · 统一物料（V2） ══════════════════
UNIFIED_ACCOUNT_SALT = "ecojia-unified-account"
APP_KEYS = {
    "screenpen": "鼠标画笔",
    "ziliao": "资料百事通",
    "huoxing": "火星计划",
    "bigbox": "会员盲盒",
    "portal": "数字生态家园",
}
APP_LEVELS = {"trial": "试用", "vip": "VIP", "svip": "SVIP", "partner": "合伙人"}


def _set_setting(key, value):
    db = get_db()
    db.execute("INSERT INTO settings(key, value) VALUES(?,?) "
               "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, value))
    db.commit()


def _secret_str():
    """secret_key 可能是 bytes（来自 secret_key.txt），统一转成字符串"""
    sk = app.secret_key
    if isinstance(sk, bytes):
        return sk.decode("utf-8", "ignore")
    return str(sk or "ecojia")


def _sign_token(uid, days=30):
    """给桌面/手机等非网页端签发长期登录 token（HMAC-SHA256，不依赖 cookie）"""
    expire = int(time.time()) + int(days) * 86400
    raw = "%d.%d" % (int(uid), expire)
    key = _secret_str() + "|" + UNIFIED_ACCOUNT_SALT
    sig = hmac.new(key.encode("utf-8"), raw.encode("utf-8"), hashlib.sha256).hexdigest()[:32]
    return base64.urlsafe_b64encode(("%s.%s" % (raw, sig)).encode("utf-8")).decode("utf-8")


def _read_token(token):
    try:
        raw = base64.urlsafe_b64decode(token.encode("utf-8")).decode("utf-8")
        uid_s, exp_s, sig = raw.split(".")
        uid, expire = int(uid_s), int(exp_s)
        key = _secret_str() + "|" + UNIFIED_ACCOUNT_SALT
        good = hmac.new(key.encode("utf-8"), ("%d.%d" % (uid, expire)).encode("utf-8"),
                        hashlib.sha256).hexdigest()[:32]
        if not hmac.compare_digest(sig, good) or expire < int(time.time()):
            return None
        return uid
    except Exception:
        return None


def _token_user():
    """统一取账号：优先 token（X-Auth-Token 头或 ?token=），其次网页 session"""
    token = (request.headers.get("X-Auth-Token") or request.args.get("token") or "").strip()
    uid = _read_token(token) if token else None
    if not uid:
        uid = session.get("uid")
    if not uid:
        return None
    row = get_db().execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    return dict(row) if row else None


def _grants_for(uid):
    rows = get_db().execute(
        "SELECT app_key, level, expire_at, note, created_at FROM app_grants "
        "WHERE user_id=? ORDER BY id DESC", (uid,)).fetchall()
    out = []
    for r in rows:
        item = dict(r)
        item["app_name"] = APP_KEYS.get(item["app_key"], item["app_key"])
        item["active"] = bool(item["expire_at"]) and item["expire_at"] >= now()
        out.append(item)
    return out


def _account_payload(u):
    grants = _grants_for(u["id"])
    return {
        "uid": u["id"], "username": u["username"], "nickname": u["nickname"],
        "role": u["role"],
        "invite_code": u.get("invite_code") or ("ECJ%d" % (10000 + u["id"])),
        "grants": grants,
        "vip": {g["app_key"]: {"level": g["level"], "expire_at": g["expire_at"],
                               "active": g["active"]} for g in grants},
    }


@app.route("/api/account/register", methods=["POST"])
def api_account_register():
    """统一注册：网页/桌面/手机共用，注册的即数字生态家园账号"""
    d = request.get_json(silent=True) or {}
    username = (d.get("username") or "").strip()
    password = d.get("password") or ""
    nickname = (d.get("nickname") or "").strip() or username
    ref = (d.get("ref") or "").strip().upper()
    if not (3 <= len(username) <= 20):
        return jsonify({"ok": False, "msg": "用户名需 3-20 个字符"}), 400
    if len(password) < 6:
        return jsonify({"ok": False, "msg": "密码至少 6 位"}), 400
    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE username=?", (username,)).fetchone():
        return jsonify({"ok": False, "msg": "用户名已存在，请直接登录"}), 400
    inviter_id = None
    if ref:
        row = db.execute("SELECT id FROM users WHERE invite_code=?", (ref,)).fetchone()
        inviter_id = row["id"] if row else None
    is_first = db.execute("SELECT COUNT(*) c FROM users").fetchone()["c"] == 0
    role = "admin" if is_first else "user"
    cur = db.execute(
        "INSERT INTO users(username, password_hash, nickname, role, inviter_id, created_at) "
        "VALUES(?,?,?,?,?,?)",
        (username, generate_password_hash(password), nickname, role, inviter_id, now()))
    uid = cur.lastrowid
    invite_code = "ECJ%d" % (10000 + uid)
    db.execute("UPDATE users SET invite_code=? WHERE id=?", (invite_code, uid))
    db.commit()
    log_op("统一注册", "用户名:%s 来源:%s" % (username, d.get("app") or "web"), uid)
    u = dict(db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone())
    return jsonify({"ok": True, "msg": "注册成功，该账号可登录 ecojia.cn 及全部子工具",
                    "token": _sign_token(uid), "account": _account_payload(u)})


@app.route("/api/account/login", methods=["POST"])
def api_account_login():
    d = request.get_json(silent=True) or {}
    username = (d.get("username") or "").strip()
    password = d.get("password") or ""
    row = get_db().execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify({"ok": False, "msg": "用户名或密码错误"}), 400
    if row["role"] == "disabled":
        return jsonify({"ok": False, "msg": "账号已被禁用"}), 403
    log_op("统一登录", "用户名:%s 来源:%s" % (username, d.get("app") or "web"), row["id"])
    return jsonify({"ok": True, "msg": "登录成功", "token": _sign_token(row["id"]),
                    "account": _account_payload(dict(row))})


@app.route("/api/account/me")
def api_account_me():
    u = _token_user()
    if not u:
        return jsonify({"ok": False, "login": False, "msg": "未登录"}), 401
    data = _account_payload(u)
    app_key = (request.args.get("app") or "").strip()
    if app_key:
        g = data["vip"].get(app_key)
        data["current_app"] = {"app": app_key, "app_name": APP_KEYS.get(app_key, app_key),
                               "grant": g, "active": bool(g and g["active"])}
    return jsonify({"ok": True, "login": True, "account": data})


@app.route("/api/app/config")
def api_app_config():
    """统一物料下发：各项目、各端都从这里取二维码、收款码、宣传视频"""
    app_key = (request.args.get("app") or "default").strip()
    return jsonify({
        "ok": True,
        "app": app_key,
        "app_name": APP_KEYS.get(app_key, app_key),
        "site": "https://ecojia.cn",
        "account_base": "https://ecojia.cn",
        "register_url": "https://ecojia.cn/login",
        "promo": {
            "group_qr": _get_setting("promo_group_qr"),
            "pay_qr": _get_setting("promo_pay_qr"),
            "pay_price": _get_setting("promo_pay_price", "999"),
            "wechat": "xunijiayuan",
            "invite_base": "https://ecojia.cn/login?ref=",
            "video_url": _get_setting("promo_video_url", ""),
        },
        "apps": APP_KEYS,
        "levels": APP_LEVELS,
    })


@app.route("/api/admin/grants", methods=["GET", "POST", "DELETE"])
@admin_required
def api_admin_grants():
    """后台：给任意账号开通任意项目的 VIP（盲盒发放、手动开通、续期、撤销）"""
    db = get_db()
    if request.method == "GET":
        kw = (request.args.get("username") or "").strip()
        if kw:
            u = db.execute("SELECT id, username FROM users WHERE username=?", (kw,)).fetchone()
            if not u:
                return jsonify({"ok": False, "msg": "账号不存在"}), 404
            rows = db.execute(
                "SELECT g.*, u.username, u.nickname FROM app_grants g JOIN users u ON u.id=g.user_id "
                "WHERE g.user_id=? ORDER BY g.id DESC", (u["id"],)).fetchall()
        else:
            rows = db.execute(
                "SELECT g.*, u.username, u.nickname FROM app_grants g JOIN users u ON u.id=g.user_id "
                "ORDER BY g.id DESC LIMIT 200").fetchall()
        rows_out = []
        for r in rows:
            item = dict(r)
            item["active"] = bool(item.get("expire_at")) and item["expire_at"] >= now()
            item["app_name"] = APP_KEYS.get(item["app_key"], item["app_key"])
            rows_out.append(item)
        return jsonify({"ok": True, "apps": APP_KEYS, "levels": APP_LEVELS, "grants": rows_out})

    d = request.get_json(silent=True) or {}
    username = (d.get("username") or "").strip()
    app_key = (d.get("app_key") or "").strip()
    u = db.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
    if not u:
        return jsonify({"ok": False, "msg": "账号不存在"}), 404

    if request.method == "DELETE" or d.get("revoke"):
        db.execute("DELETE FROM app_grants WHERE user_id=? AND app_key=?", (u["id"], app_key))
        db.commit()
        log_op("撤销权益", "账号:%s 项目:%s" % (username, app_key), u["id"])
        return jsonify({"ok": True, "msg": "已撤销 %s 的 %s 权益" % (username, app_key)})

    if not app_key:
        return jsonify({"ok": False, "msg": "请选择项目"}), 400
    level = (d.get("level") or "vip").strip()
    days = int(d.get("days") or 30)
    expire_at = (d.get("expire_at") or "").strip()
    if not expire_at:
        expire_at = datetime.fromtimestamp(time.time() + days * 86400).strftime("%Y-%m-%d %H:%M:%S")
    db.execute(
        "INSERT INTO app_grants(user_id, app_key, level, expire_at, note, created_at) "
        "VALUES(?,?,?,?,?,?) ON CONFLICT(user_id, app_key) DO UPDATE SET "
        "level=excluded.level, expire_at=excluded.expire_at, note=excluded.note",
        (u["id"], app_key, level, expire_at, (d.get("note") or "").strip(), now()))
    db.commit()
    log_op("开通权益", "账号:%s 项目:%s 等级:%s 到期:%s" % (username, app_key, level, expire_at), u["id"])
    return jsonify({"ok": True, "msg": "%s 的 %s 已开通至 %s" % (username, app_key, expire_at)})


@app.route("/api/admin/promo/video", methods=["GET", "POST"])
@admin_required
def api_admin_promo_video():
    """后台：设置全站宣传视频（外链或在线上传 mp4/webm）"""
    if request.method == "GET":
        return jsonify({"ok": True, "video_url": _get_setting("promo_video_url", ""),
                        "group_qr": _get_setting("promo_group_qr"),
                        "pay_qr": _get_setting("promo_pay_qr"),
                        "pay_price": _get_setting("promo_pay_price", "999")})
    d = request.get_json(silent=True) or {}
    url = (d.get("url") or "").strip()
    if url:
        if not re.match(r"^(https?://|/static/)", url):
            return jsonify({"ok": False, "msg": "视频地址需以 http(s):// 或 /static/ 开头"}), 400
        _set_setting("promo_video_url", url)
        log_op("设置宣传视频", url)
        return jsonify({"ok": True, "msg": "宣传视频已更新", "video_url": url})
    m = re.match(r"^data:video/(mp4|webm);base64,(.+)$", d.get("data_url") or "", re.S)
    if not m:
        return jsonify({"ok": False, "msg": "请上传 mp4/webm 视频，或直接填视频外链"}), 400
    raw = base64.b64decode(m.group(2))
    if len(raw) > 80 * 1024 * 1024:
        return jsonify({"ok": False, "msg": "视频不能超过 80MB"}), 400
    updir = os.path.join(app.root_path, "static", "uploads")
    os.makedirs(updir, exist_ok=True)
    fname = "promo_video." + m.group(1)
    with open(os.path.join(updir, fname), "wb") as f:
        f.write(raw)
    url = "/static/uploads/" + fname
    _set_setting("promo_video_url", url)
    log_op("上传宣传视频", "%d 字节" % len(raw))
    return jsonify({"ok": True, "msg": "宣传视频已上传，全站立即生效", "video_url": url})


init_db()

if __name__ == "__main__":
    host = os.environ.get("ZSTJ_HOST", "0.0.0.0")
    port = int(os.environ.get("ZSTJ_PORT", "8400"))
    print(f"═══ 数字生态家园 {VERSION} ═══")
    print(f"作者：军哥懂保（微信：xunijiayuan）")
    print(f"访问：http://127.0.0.1:{port}")
    app.run(host=host, port=port, debug=False)
