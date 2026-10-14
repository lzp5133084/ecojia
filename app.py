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
import json
import os
import sqlite3
from datetime import datetime
from functools import wraps

from flask import (Flask, g, session, request, jsonify,
                   render_template, redirect, url_for)
from werkzeug.security import generate_password_hash, check_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "ecojia.db")
VERSION = "V1.2"

# 资料百事通公网入口（当前 cpolar 隧道，服务器部署后切换为 ziliao.ecojia.cn）
MAIN_SITE_URL = "https://72d51d79.r9.vip.cpolar.cn"

app = Flask(__name__)
app.config["JSON_AS_ASCII"] = False

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
    """当前主打产品（矩阵中 main=true 的那位）"""
    for p in get_products():
        if p.get("main"):
            return p
    return {"name": "资料百事通", "url": MAIN_SITE_URL, "status": "已上线"}


def renumber(products):
    """重排编号为 01..N，并保证「待添加」始终在末位"""
    products.sort(key=lambda p: p.get("name") == "待添加")
    for i, p in enumerate(products, 1):
        p["no"] = f"{i:02d}"

WISH_STATUS = ["待评估", "已纳入规划", "开发中", "已上线", "暂不规划"]
PRODUCT_STATUS = ["已上线", "开发中", "规划中", "敬请期待", "虚位以待"]

# ══════════════════ 火星平面（huoxingPM）羽毛原型数据 ══════════════════
# 原型阶段内置示例记录：每一根绒毛 = 一条历程/记录。
# 正式版将由用户自己录入并由后端持久化（预留 /api/huoxing/records）。
HUOXING_RECORDS = [
    {"id": "r01", "date": "2008", "type": "求学", "title": "走出小城",
     "summary": "背上行囊，第一次看见更大的世界。",
     "detail": "第一次离开家乡去远方读书，学会独立，也第一次知道世界有多大。"},
    {"id": "r02", "date": "2014", "type": "事业", "title": "入行保险",
     "summary": "从零开始，服务第一位客户。",
     "detail": "带着一腔热忱进入保险行业，把每一份保单都当成一份托付。"},
    {"id": "r03", "date": "2016", "type": "家庭", "title": "迎来新生命",
     "summary": "生命里多了一个最重要的人。",
     "detail": "孩子的到来让生活有了新的重心，也更懂得责任的重量。"},
    {"id": "r04", "date": "2020", "type": "成长", "title": "第100例理赔",
     "summary": "明白保险是雪中送炭。",
     "detail": "经手第100例理赔，看着一个个家庭渡过难关，坚定了从业的意义。"},
    {"id": "r05", "date": "2024", "type": "荣誉", "title": "年度服务之星",
     "summary": "十年坚持被看见。",
     "detail": "连续多年服务客户1000+，获得年度服务之星，感谢每一位信任。"},
    {"id": "r06", "date": "2026", "type": "新生", "title": "数字生态启航",
     "summary": "梦想开始生长。",
     "detail": "启动数字生态家园，希望用科技把温暖带给更多家庭。"},
]


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
    """)
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
                           main_product=main, main_url=main.get("url") or MAIN_SITE_URL)


@app.route("/wishes")
def wishes_page():
    return render_template("wishes.html", products=get_products())


@app.route("/huoxing")
def huoxing_page():
    """火星平面（huoxingPM）羽毛历程记录 —— 原型：每根绒毛=一条记录"""
    return render_template("huoxing.html", records=HUOXING_RECORDS)


@app.route("/api/huoxing/records")
def api_huoxing_records():
    """预留接口：羽毛记录（每根绒毛=一条记录），供其他程序读取"""
    return jsonify({"ok": True, "count": len(HUOXING_RECORDS),
                    "records": HUOXING_RECORDS,
                    "note": "原型数据；正式版将由用户录入并持久化，支持增删查改"})


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
    if not (3 <= len(username) <= 20):
        return jsonify({"ok": False, "msg": "用户名需3-20个字符"}), 400
    if len(password) < 6:
        return jsonify({"ok": False, "msg": "密码至少6位"}), 400
    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE username=?", (username,)).fetchone():
        return jsonify({"ok": False, "msg": "用户名已存在"}), 400
    # 首个注册用户自动成为管理员
    is_first = db.execute("SELECT COUNT(*) c FROM users").fetchone()["c"] == 0
    role = "admin" if is_first else "user"
    cur = db.execute(
        "INSERT INTO users(username, password_hash, nickname, role, created_at) VALUES(?,?,?,?,?)",
        (username, generate_password_hash(password), nickname, role, now()))
    db.commit()
    session["uid"] = cur.lastrowid
    log_op("注册账号", f"用户名:{username} 角色:{role}", cur.lastrowid)
    return jsonify({"ok": True, "msg": "注册成功", "role": role,
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


# ══════════════════ 启动 ══════════════════
init_db()

if __name__ == "__main__":
    host = os.environ.get("ZSTJ_HOST", "0.0.0.0")
    port = int(os.environ.get("ZSTJ_PORT", "8400"))
    print(f"═══ 数字生态家园 {VERSION} ═══")
    print(f"作者：军哥懂保（微信：xunijiayuan）")
    print(f"访问：http://127.0.0.1:{port}")
    app.run(host=host, port=port, debug=False)
