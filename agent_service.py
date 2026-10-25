# -*- coding: utf-8 -*-
"""
════════════════════════════════════════════════════════════
 生态智能体「小禾」服务模块 V1.0
 作者：军哥懂保（微信：xunijiayuan）
════════════════════════════════════════════════════════════
 职责：
 - 网站内容问答（找工具 / 看状态 / 使用指引）——本地知识库引擎，100%可用
 - 故障自查：用户反馈「打不开」时，先对目标做健康检查，再回答
 - 大模型增强（预留）：火山方舟接入点配置后自动启用，配置入口在管理后台
 安全：API Key 仅存服务器环境变量 / agent_config 表，绝不进前端与 ecosystem.json
════════════════════════════════════════════════════════════
"""
import json
import os
import re
import socket
import ssl
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

# ---- 大模型配置（预留增强；endpoint 在管理后台配置后启用） ----
ARK_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions"
# 本地大模型（Ollama 兼容接口）：方舟未配置/不可用时自动兜底
# 服务器环境变量 OLLAMA_URL 可覆盖，默认本机 11434；模型名 OLLAMA_MODEL
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:0.5b")


def _now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# ══════════════════ 工具别名与知识库 ══════════════════
def build_alias_map(tools):
    """为每个工具生成检索别名（用户口语叫法 → 工具编号）"""
    alias = {}
    extra = {
        "T25": ["视频转ppt", "视频做ppt", "录屏转ppt", "课程转ppt", "帧提取ppt", "视频ppt", "转ppt", "ppt工具"],
        "T20": ["视频提帧", "提取视频帧", "视频截图", "单帧提取", "视频抽帧"],
        "T21": ["高清提帧", "原画质提帧", "vip提帧"],
        "T23": ["虚拟家园", "混元生图", "混元", "ai画图", "ai绘图", "生图", "腾讯混元"],
        "T01": ["门户", "首页", "官网", "主站", "生态家园"],
        "T02": ["资料", "查资料", "资料百事通", "百事通"],
        "T03": ["客户管理", "小区客户", "智汇管家", "客户系统"],
        "T04": ["保险管理", "保单", "保险资料"],
        "T08": ["ai资产", "模型速查", "api速查", "aihub", "hub"],
        "T10": ["二维码", "qr", "黑金二维码"],
        "T13": ["重命名", "批量改名", "改名"],
        "T15": ["灵魂拷问", "pk直播", "pk工具", "违禁词"],
        "T22": ["程序目录", "开发档案", "ai程序"],
        "T24": ["修复网络", "网络修复", "断网", "dns"],
        "T29": ["互传", "传文件", "局域网", "灵犀"],
        "T30": ["理赔", "理赔资料", "ocr"],
        "T09": ["问卷", "九页", "调查"],
        "T14": ["嘉宾", "直播看板", "大屏"],
        "T07": ["宗亲", "任氏", "族谱"],
        "T26": ["生态家", "接单", "服务费"],
        "T05": ["军哥懂保", "个人门户", "个人网站"],
        "T06": ["保险专家", "品牌站"],
        "T11": ["霓虹边框", "图片特效", "边框"],
        "T12": ["描边", "发光轮廓", "轮廓"],
        "T28": ["数字生态", "导航站"],
    }
    for t in tools:
        no = t.get("no", "")
        names = [t.get("name", ""), t.get("en", ""), t.get("repo", "")]
        names += extra.get(no, [])
        # 名字按分隔符再拆词
        for n in list(names):
            for part in re.split(r"[·\s\-—→/（）()]+", str(n)):
                part = part.strip()
                if len(part) >= 2:
                    names.append(part)
        for n in names:
            n = str(n).strip().lower()
            if len(n) >= 2:
                alias.setdefault(n, no)
    return alias


def find_tools(query, tools, alias):
    """在工具库中查找：返回 [(tool, score)] 按相关度排序"""
    q = query.lower().strip()
    hits = {}

    def add(no, score):
        hits[no] = max(hits.get(no, 0), score)

    # 别名命中（长词优先）
    for word in sorted(alias, key=len, reverse=True):
        if word in q:
            add(alias[word], 100 + len(word))
    # 直接包含名字/描述/编号
    for t in tools:
        no = t.get("no", "")
        name = (t.get("name") or "").lower()
        desc = (t.get("desc") or "").lower()
        if no.lower() in q:
            add(no, 120)
        if name and name in q:
            add(no, 110)
        # 关键词拆词匹配
        for kw in re.findall(r"[一-龥a-z0-9]{2,}", q):
            if kw in name:
                add(no, 30 + len(kw))
            elif kw in desc:
                add(no, 10 + len(kw))
    by_no = {t.get("no"): t for t in tools}
    out = [(by_no[no], s) for no, s in hits.items() if no in by_no]
    out.sort(key=lambda x: -x[1])
    return out


# ══════════════════ 健康检查 ══════════════════
_UA = {"User-Agent": "EcoJia-Agent/1.0 (+https://ecojia.cn/health)"}
_ssl_ctx = ssl.create_default_context()


def check_url(url, timeout=8):
    """对单个URL做健康检查，返回结构化报告"""
    r = {"url": url, "ok": False, "code": None, "latency_ms": None,
         "error": "", "checked_at": _now()}
    if not url:
        r["error"] = "该工具未部署在线地址（本地软件/未上线）"
        return r
    t0 = time.time()
    try:
        req = urllib.request.Request(url, headers=_UA, method="GET")
        with urllib.request.urlopen(req, timeout=timeout, context=_ssl_ctx) as resp:
            body = resp.read(2048)
            r["code"] = resp.status
            r["latency_ms"] = int((time.time() - t0) * 1000)
            r["ok"] = 200 <= resp.status < 400
            if r["ok"] and len(body) < 60:
                r["ok"] = False
                r["error"] = "页面内容为空或异常"
    except urllib.error.HTTPError as e:
        r["code"] = e.code
        r["latency_ms"] = int((time.time() - t0) * 1000)
        r["error"] = {404: "页面不存在（404），可能未部署或路径变更",
                      502: "后端服务无响应（502）", 503: "服务暂不可用（503）",
                      500: "服务器内部错误（500）"}.get(e.code, f"HTTP错误 {e.code}")
    except urllib.error.URLError as e:
        r["latency_ms"] = int((time.time() - t0) * 1000)
        reason = str(e.reason)
        if isinstance(e.reason, socket.timeout) or "timed out" in reason:
            r["error"] = f"连接超时（>{timeout}秒），服务可能未启动或网络不通"
        elif "refused" in reason:
            r["error"] = "连接被拒绝，服务未在运行"
        elif "SSL" in reason or "certificate" in reason.lower():
            r["error"] = "HTTPS证书异常"
        else:
            r["error"] = f"网络错误：{reason[:80]}"
    except Exception as e:
        r["latency_ms"] = int((time.time() - t0) * 1000)
        r["error"] = f"检查异常：{str(e)[:80]}"
    return r


def check_tools_parallel(items, timeout=8, workers=8):
    """并发检查 [(no, name, url)] → {no: report}"""
    out = {}

    def job(it):
        no, name, url = it
        out[no] = check_url(url, timeout)
        out[no]["name"] = name
        out[no]["no"] = no
    with ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(job, items))
    return out


# ══════════════════ 大模型增强（预留） ══════════════════
def llm_enabled(cfg):
    return bool(cfg.get("api_key") and cfg.get("model"))


def call_llm(messages, cfg, max_tokens=700):
    """大模型调用：火山方舟(已配置) → 本地Ollama兜底；失败返回 (False, 原因)"""
    # 第一路：火山方舟
    if llm_enabled(cfg):
        payload = {"model": cfg["model"], "messages": messages,
                   "max_tokens": max_tokens, "temperature": 0.3}
        req = urllib.request.Request(
            ARK_URL, data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json",
                     "Authorization": "Bearer " + cfg["api_key"]}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=25, context=_ssl_ctx) as r:
                d = json.loads(r.read().decode("utf-8"))
                return True, d["choices"][0]["message"]["content"]
        except Exception:
            pass  # 方舟失败 → 落到本地模型
    # 第二路：本地 Ollama（OpenAI 兼容接口，8秒超时）
    # 失败冷却300秒：Ollama未部署时不拖慢每次问答
    now_ts = time.time()
    if getattr(call_llm, "_oll_down_until", 0) > now_ts:
        return False, "云端大模型不可用，本地模型冷却中"
    model = cfg.get("ollama_model") or OLLAMA_MODEL
    base = (cfg.get("ollama_url") or OLLAMA_URL).rstrip("/")
    payload = {"model": model, "messages": messages, "stream": False,
               "options": {"num_predict": max_tokens, "temperature": 0.3}}
    for path in ("/api/chat", "/v1/chat/completions"):
        try:
            req = urllib.request.Request(
                base + path, data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}, method="POST")
            ctx = _ssl_ctx if base.startswith("https") else None
            with urllib.request.urlopen(req, timeout=6, context=ctx) as r:
                d = json.loads(r.read().decode("utf-8"))
                if "choices" in d:
                    return True, d["choices"][0]["message"]["content"]
                if "message" in d and d["message"].get("content"):
                    return True, d["message"]["content"]
        except Exception:
            continue
    call_llm._oll_down_until = now_ts + 300
    return False, "云端与本地大模型均不可用"


# ══════════════════ 意图识别与回答引擎 ══════════════════
RE_BAD = re.compile(r"(打不开|进不去|无法访问|用不了|不能用|坏了|崩溃|白屏|报错|失败|超时|很慢|卡|挂了|不显示|加载不出)")
RE_ASK_WHERE = re.compile(r"(在哪|哪里|怎么找|如何找|有没有|地址|链接|入口|怎么用|如何用|使用)")
RE_LIST = re.compile(r"(全部工具|所有工具|工具列表|有哪些工具|几个工具|工具清单)")
RE_GREET = re.compile(r"^\s*(你好|您好|hi|hello|在吗|嗨|哈喽)[!！~。\s]*$", re.I)
RE_WHO = re.compile(r"(你是谁|你是哪个|介绍.*你|你的名字)")
RE_AUTHOR = re.compile(r"(作者|军哥|联系方式|微信|是谁做|谁开发)")

SUGGESTIONS = ["视频转PPT工具在哪？", "虚拟家园·混元生图打不开", "一共有哪些工具？", "怎么联系军哥？"]


def _tool_line(t):
    url = t.get("url") or ""
    return {"no": t.get("no"), "name": t.get("name"), "url": url,
            "status": t.get("status", ""), "desc": (t.get("desc") or "")[:80]}


def reply_link(t):
    """生成带链接的回答片段"""
    if t.get("url"):
        return f"[{t['name']}]({t['url']})"
    return f"**{t['name']}**（{t.get('status','暂未上线')}）"


def agent_answer(message, eco, page_url="", health_checker=None):
    """
    本地知识库引擎：返回 (reply_markdown, intent, cards, health_report)
    cards: 前端可渲染的工具卡片列表
    """
    msg = (message or "").strip()
    tools = eco.get("tools", [])
    products = eco.get("products", [])
    alias = build_alias_map(tools)
    meta = eco.get("meta", {})

    # 1) 打招呼
    if RE_GREET.search(msg):
        return (f"您好呀！我是生态智能体「小禾」🌱\n\n"
                f"我熟悉 **{meta.get('name','数字生态家园')}** 的全部 {len(tools)} 个工具和 {len(products)} 位生态成员，可以帮您：\n"
                f"- 🔍 找工具：比如「视频转PPT在哪」\n"
                f"- 🩺 查故障：比如「混元生图打不开」，我会先去检查再回答\n"
                f"- 📖 讲用法：每个工具的使用说明与名词解释\n\n"
                f"您想问点什么？"), "greet", [], None

    # 2) 问智能体自己
    if RE_WHO.search(msg):
        return ("我是「小禾」，数字生态家园的网站智能体 🌱\n\n"
                "我住在每个页面的右下角，负责帮您找工具、查状态、答疑问。"
                "我的知识来自生态底座 ecosystem.json，由军哥懂保持续维护。"), "who", [], None

    # 3) 问作者/联系方式
    if RE_AUTHOR.search(msg):
        return (f"本站由 **{meta.get('author','军哥懂保')}** 开发维护\n\n"
                f"- 微信号：**{meta.get('wechat','xunijiayuan')}**\n"
                f"- 官网：[ecojia.cn](https://ecojia.cn)\n"
                f"- 有想法还可以去 [许愿墙](https://ecojia.cn/wishes) 许愿催更 ✨"), "author", [], None

    # 4) 列全部工具
    if RE_LIST.search(msg):
        online = [t for t in tools if t.get("url")]
        local = [t for t in tools if not t.get("url")]
        lines = [f"目前生态共登记 **{len(tools)}** 个工具，其中 **{len(online)}** 个可在线打开：\n"]
        for t in online:
            lines.append(f"- {reply_link(t)} — {re.sub(r'[🎬✓✨🔥💡📌🎯🚀📖💼🧰🌐📡🛠️🎨📊🗂️🔐🤖👤🏠📹🎤💬📝🗄️📦]+', '', (t.get('desc') or ''))[:36]}…")
        if local:
            lines.append(f"\n另有 {len(local)} 个本地软件/未部署：" + "、".join(t["name"] for t in local))
        lines.append("\n完整清单见 [工具清单页](https://ecojia.cn/tools)。")
        return ("\n".join(lines), "list_tools",
                [_tool_line(t) for t in online[:8]], None)

    # 5) 故障类：先检查再回答（核心场景）
    if RE_BAD.search(msg):
        hits = find_tools(msg, tools, alias)
        # 没点名工具 → 结合用户所在页面判断
        target = None
        if hits:
            target = hits[0][0]
        elif page_url:
            for t in tools:
                u = (t.get("url") or "").rstrip("/")
                if u and page_url.startswith(u):
                    target = t
                    break
        if not target:
            return ("收到，您遇到了访问问题。请告诉我是**哪个工具**打不开？\n\n"
                    "比如直接说：「混元生图打不开」「二维码工坊进不去」——\n"
                    "我会立刻去服务器上实际访问检查一遍，再把结果告诉您。🩺"), "ask_which", [], None

        report = health_checker(target) if health_checker else check_url(target.get("url"))
        name = target["name"]
        if report.get("ok"):
            lat = report.get("latency_ms") or 0
            reply = (f"我刚从服务器实际访问检查了 **{name}** 🩺\n\n"
                     f"- 地址：{target.get('url')}\n"
                     f"- 状态：**正常可访问**（HTTP {report.get('code')}，响应 {lat}ms）\n"
                     f"- 检查时间：{report.get('checked_at')}\n\n")
            if lat > 5000:
                reply += (f"不过它的响应用了 **{lat/1000:.1f} 秒**，确实偏慢。"
                          "如果您那边一直转圈，建议：\n"
                          "1. 耐心等待完全加载（首次加载较慢）\n"
                          "2. 按 Ctrl+F5 强制刷新\n"
                          "3. 换个网络（如手机流量）再试\n")
            else:
                reply += ("服务器端是正常的。您那边打不开，常见原因：\n"
                          "1. 浏览器缓存旧了 → 按 **Ctrl+F5** 强制刷新\n"
                          "2. 网络对目标资源访问慢 → 切换 WiFi/手机流量 试试\n"
                          "3. 浏览器拦截了第三方内容 → 换 Chrome/Edge 最新版\n")
            if "混元" in name or "hunyuan" in (target.get("url") or ""):
                reply += ("\n补充：「虚拟家园」是内嵌腾讯混元官网的窗口，**需要先微信扫码登录腾讯混元**才能作画；"
                          "如内嵌窗口异常，可直接访问 [腾讯混元官网](https://hunyuan.tencent.com/realtimeImage?from=/visual) 使用。")
            reply += "\n如果按上面操作还是不行，告诉我您看到的具体画面，我继续帮您查！"
            return (reply, "health_ok", [_tool_line(target)], report)
        else:
            reply = (f"我刚从服务器实际访问检查了 **{name}** 🩺\n\n"
                     f"- 地址：{target.get('url') or '（无在线地址）'}\n"
                     f"- 状态：**异常** — {report.get('error')}\n"
                     f"- HTTP状态码：{report.get('code') or '无响应'}\n"
                     f"- 检查时间：report.get('checked_at')\n\n")
            reply = reply.replace("report.get('checked_at')", report.get('checked_at', ''))
            reply += ("已为您做以下处理：\n"
                      "1. ✅ 故障已记录进运维日志，军哥会收到提醒\n"
                      "2. 🔧 若为我方可控服务，系统将尝试自动重启恢复\n\n"
                      "您可以：稍等 1~2 分钟后刷新重试；或先用其他工具，"
                      "也可到 [许愿墙](https://ecojia.cn/wishes) 留言催修。"
                      f"急事可直接联系军哥（微信：**xunijiayuan**）。")
            return (reply, "health_bad", [_tool_line(target)], report)

    # 6) 找工具 / 问用途 / 问入口
    hits = find_tools(msg, tools, alias)
    if hits and (RE_ASK_WHERE.search(msg) or hits[0][1] >= 30):
        top = hits[:3]
        if len(top) == 1 or top[0][1] >= 60:
            t = top[0][0]
            lines = [f"您要找的应该是 {reply_link(t)} 👇\n"]
            lines.append(f"- 状态：{t.get('status')}")
            desc = re.sub(r"\s+", " ", (t.get("desc") or "")).strip()
            if desc:
                lines.append(f"- 简介：{desc[:90]}")
            steps = t.get("steps") or []
            if steps:
                lines.append("- 用法：" + "；".join(steps[:3]))
            if t.get("url"):
                lines.append(f"\n👉 直达地址：{t['url']}")
            if t.get("note"):
                lines.append(f"📌 备注：{t['note']}")
            if len(top) > 1:
                lines.append("\n相关工具还有：" + "、".join(reply_link(x[0]) for x in top[1:]))
            return ("\n".join(lines), "find_tool", [_tool_line(x[0]) for x in top], None)
        else:
            lines = ["找到几个可能相关的工具，您看看是哪个：\n"]
            for t, s in top:
                lines.append(f"- {reply_link(t)} — {(t.get('desc') or '')[:40]}…")
            lines.append("\n说全名我可以给您更详细的介绍～")
            return ("\n".join(lines), "find_ambiguous", [_tool_line(x[0]) for x in top], None)

    # 7) 许愿/反馈
    if re.search(r"(许愿|建议|反馈|想要.*功能|催更)", msg):
        return ("好想法值得被听见 ✨\n\n请到 [许愿墙](https://ecojia.cn/wishes) 提交您的愿望："
                "选择产品 → 留联系方式 → 描述需求。军哥会定期评估，"
                "被采纳的愿望会进入开发排期，上线后第一时间通知您！"), "wish", [], None

    # 8) 登录/账号
    if re.search(r"(登录|注册|账号|密码)", msg):
        return ("关于账号 👤\n\n"
                "- 登录/注册入口：页面右上角「登录 / 注册」，或直达 [登录页](https://ecojia.cn/login)\n"
                "- 一个账号通行整个生态（门户、资料百事通及后续所有产品）\n"
                "- 首个注册的账号自动成为管理员\n"
                "- 忘记密码：目前可联系军哥（微信 xunijiayuan）人工重置"), "account", [], None

    return None  # 交给大模型兜底；未配置时由调用方给友好话术


FALLBACK_REPLY = (
    "这个问题我还在学习中 🌱\n\n"
    "我目前最擅长这些：\n"
    "- 🔍 **找工具**：「视频转PPT在哪」「二维码工具怎么用》\n"
    "- 🩺 **查故障**：「混元生图打不开」（我会实际检查后再回答）\n"
    "- 📋 **看清单**：「一共有哪些工具」\n"
    "- 👤 **找军哥**：「怎么联系作者」\n\n"
    "您换个问法试试？或到 [许愿墙](https://ecojia.cn/wishes) 留下需求，军哥会来解答。"
).replace("》", "」")


def knowledge_text(eco):
    """喂给大模型的生态知识摘要（启用大模型时使用）"""
    tools = eco.get("tools", [])
    lines = ["【数字生态家园工具库】"]
    for t in tools:
        lines.append(f"- {t.get('no')} {t.get('name')}：{(t.get('desc') or '')[:60]} "
                     f"地址:{t.get('url') or '无(本地/未上线)'} 状态:{t.get('status')}")
    return "\n".join(lines)
