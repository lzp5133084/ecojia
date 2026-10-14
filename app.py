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
import os
import sqlite3
from datetime import datetime
from functools import wraps

from flask import (Flask, g, session, request, jsonify,
                   render_template, redirect, url_for)
from werkzeug.security import generate_password_hash, check_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "ecojia.db")
VERSION = "V0.1"

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


# ══════════════════ 产品矩阵数据 ══════════════════
PRODUCTS = [
    {"no": "01", "name": "数字保险箱", "scope": "个人 · 家庭", "icon": "🔐",
     "status": "规划中", "main": False, "url": "",
     "desc": "家庭重要证件、保单、合同、房产资料的加密数字保管箱，一人保管全家共享。"},
    {"no": "02", "name": "语料收集器", "scope": "个人 · 特定", "icon": "📦",
     "status": "规划中", "main": False, "url": "",
     "desc": "面向AI训练的语料收集与整理工具，让每个人的经验沉淀为可用数据。"},
    {"no": "03", "name": "资料百事通", "scope": "个人 · 共创 · 大众", "icon": "🗂️",
     "status": "已上线", "main": True, "url": MAIN_SITE_URL,
     "desc": "全民共创式资料共享与智能查询平台——查资料、传资料、赚积分，AI帮您找。"},
    {"no": "04", "name": "AI资产管理", "scope": "个人 · 家庭 · 公司", "icon": "💎",
     "status": "规划中", "main": False, "url": "",
     "desc": "个人与家庭资产的AI盘点与管理，看得清、管得住、传得下。"},
    {"no": "05", "name": "AI宝贝助手", "scope": "个人 · 家庭 · 学校", "icon": "🧒",
     "status": "规划中", "main": False, "url": "",
     "desc": "孩子的成长记录、学习陪伴与安全教育，AI宝贝成长好伙伴。"},
    {"no": "06", "name": "共享租赁柜", "scope": "未来硬件", "icon": "🗄️",
     "status": "敬请期待", "main": False, "url": "",
     "desc": "社区共享智能租赁柜，让闲置物品流动起来。"},
    {"no": "07", "name": "残障AI助手", "scope": "个人 · 特定机构", "icon": "🤝",
     "status": "规划中", "main": False, "url": "",
     "desc": "视障、听障、肢障朋友的AI生活助手，科技向善，人人平等。"},
    {"no": "08", "name": "理赔AI助手", "scope": "个人 · 团体 · 公司", "icon": "⚖️",
     "status": "规划中", "main": False, "url": "",
     "desc": "保险理赔材料智能整理与进度跟踪，理赔不再跑断腿。"},
    {"no": "09", "name": "直播间工具", "scope": "粉丝 · 主播", "icon": "📡",
     "status": "规划中", "main": False, "url": "",
     "desc": "直播间数据、话术、素材一站式工具箱，主播的好帮手。"},
    {"no": "10", "name": "大盒子", "en": "BIGBOX", "scope": "个人 · 家庭 · 企业", "icon": "🗃️",
     "status": "规划中", "main": False, "url": "",
     "desc": "承载数字资产的盒子产品，定位为工具平台——保单、合同、证件收进一个盒子，随身携带、随时取用。"},
    {"no": "11", "name": "鸽子AI", "en": "geziAI", "scope": "个人专属 · 私人助手", "icon": "🕊️",
     "status": "规划中", "main": False, "url": "",
     "desc": "属于个人的私人AI助手，像信鸽一样替您传递、查找、记事，只服务主人一人。"},
    {"no": "12", "name": "火星平面", "en": "huoxingPM", "scope": "个人 · 一生历程", "icon": "🪶",
     "status": "规划中", "main": False, "url": "",
     "desc": "以羽毛为形象的历程记录器：每一根绒毛都是一段历程或一条记录，越长越丰盈，像一张会生长的身份证。"},
    {"no": "13", "name": "待添加", "scope": "您的想法", "icon": "✨",
     "status": "虚位以待", "main": False, "url": "/wishes",
     "desc": "这里预留给你——下一个改变生活的产品，由你的愿望开启。"},
]

HARDWARE = [
    {"name": "无人机", "icon": "🛸", "desc": "低空采集与配送"},
    {"name": "3D打印", "icon": "🖨️", "desc": "个性化制造"},
    {"name": "AI眼镜", "icon": "🕶️", "desc": "第一视角智能"},
    {"name": "高效喷码器", "icon": "🔫", "desc": "标识与溯源"},
    {"name": "AI硬件", "icon": "🧠", "desc": "端侧智能设备"},
    {"name": "手表平台", "icon": "⌚", "desc": "腕上生态入口"},
]

WISH_STATUS = ["待评估", "已纳入规划", "开发中", "已上线", "暂不规划"]


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
    return render_template("index.html", products=PRODUCTS, hardware=HARDWARE,
                           main_url=MAIN_SITE_URL)


@app.route("/wishes")
def wishes_page():
    return render_template("wishes.html", products=PRODUCTS)


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
    return render_template("admin.html", wish_status=WISH_STATUS)


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


# ══════════════════ 产品与生态 API ══════════════════
@app.route("/api/products")
def api_products():
    return jsonify({"ok": True, "products": PRODUCTS})


@app.route("/api/brands")
def api_brands():
    """生态品牌（梦境三品牌，已编号进产品矩阵 10/11/12）"""
    return jsonify({"ok": True, "brands": [p for p in PRODUCTS if p.get("en")]})


@app.route("/api/ecosystem/status")
def api_ecosystem_status():
    """预留接口：供其他程序/子站调用的生态总览"""
    db = get_db()
    users = db.execute("SELECT COUNT(*) c FROM users").fetchone()["c"]
    wishes = db.execute("SELECT COUNT(*) c FROM wishes").fetchone()["c"]
    return jsonify({
        "ok": True,
        "name": "数字生态家园",
        "domain": "ecojia.cn",
        "version": VERSION,
        "author": "军哥懂保",
        "wechat": "xunijiayuan",
        "main_product": {"name": "资料百事通", "url": MAIN_SITE_URL, "status": "已上线"},
        "products_count": len(PRODUCTS),
        "hardware": [h["name"] for h in HARDWARE],
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
