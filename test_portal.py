# -*- coding: utf-8 -*-
"""数字生态家园 V0.1 自动化自测脚本（运行前需服务已在8400端口启动）"""
import io
import json
import sys
import urllib.request
import urllib.error
import http.cookiejar

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE = "http://127.0.0.1:8400"
passed, failed = 0, 0


def check(name, cond, extra=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ✓ {name}")
    else:
        failed += 1
        print(f"  ✗ {name}  {extra}")


def client():
    """独立会话（带cookie）"""
    jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def req(op, method, path, data=None):
    r = urllib.request.Request(BASE + path, method=method)
    if data is not None:
        r.add_header("Content-Type", "application/json")
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    else:
        body = None
    try:
        resp = op.open(r, body, timeout=10)
        return resp.getcode(), resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")


print("═══ 一、页面可访问性 ═══")
admin, user, guest = client(), client(), client()

code, html = req(admin, "GET", "/")
check("首页 200", code == 200)
check("首页含品牌名", "数字生态家园" in html)
check("首页含主打产品", "资料百事通" in html)
check("首页含产品矩阵01-10", "01" in html and "10" in html)
check("首页含硬件探讨区", "无人机" in html and "AI眼镜" in html)
check("页脚含作者信息", "军哥懂保" in html and "xunijiayuan" in html)
check("页脚含版本V1.3", "V1.3" in html)

code, css = req(guest, "GET", "/static/css/style.css")
check("样式表 200", code == 200 and "黑金" in css)

code, html = req(guest, "GET", "/wishes")
check("许愿页 200", code == 200 and "许愿墙" in html)
code, html = req(guest, "GET", "/login")
check("登录页 200", code == 200)

code, html = req(guest, "GET", "/tools")
check("工具清单页 200", code == 200 and "工具清单与使用说明" in html and "资料百事通" in html)
check("工具清单含使用说明", "使用说明" in html and "立即打开" in html)

code, html = req(guest, "GET", "/huoxing")
check("火星平面羽毛页 200", code == 200 and "huoxingPM" in html and "绒毛" in html)

print("═══ 二、统一账号 ═══")
code, body = req(admin, "POST", "/api/auth/register",
                 {"username": "junge", "password": "test123456", "nickname": "军哥"})
d = json.loads(body)
check("注册管理员成功", code == 200 and d.get("ok") and d.get("role") == "admin")
check("首个用户自动成为管理员", d.get("role") == "admin")

code, body = req(user, "POST", "/api/auth/register",
                 {"username": "ceshi01", "password": "test123456", "nickname": "测试用户"})
d = json.loads(body)
check("注册普通用户成功", code == 200 and d.get("ok") and d.get("role") == "user")

code, body = req(guest, "POST", "/api/auth/register",
                 {"username": "junge", "password": "test123456"})
check("重复用户名被拦截", code == 400)

code, body = req(guest, "POST", "/api/auth/register", {"username": "x", "password": "123456"})
check("过短用户名被拦截", code == 400)

code, body = req(client(), "POST", "/api/auth/login",
                 {"username": "ceshi01", "password": "wrong-password"})
check("错误密码登录被拒", code == 400)

code, body = req(client(), "POST", "/api/auth/login",
                 {"username": "ceshi01", "password": "test123456"})
d = json.loads(body)
check("正确密码登录成功", code == 200 and d.get("ok"))

code, body = req(user, "GET", "/api/auth/status")
d = json.loads(body)
check("登录状态接口", d.get("login") and d.get("nickname") == "测试用户")

code, body = req(guest, "GET", "/api/auth/bridge")
d = json.loads(body)
check("账号桥接预留接口", d.get("ok") and "统一账号" in d.get("service", ""))

print("═══ 三、许愿墙 增删查改 ═══")
code, body = req(user, "POST", "/api/wishes",
                 {"product": "资料百事通", "contact": "微信 test001",
                  "content": "希望增加按医院名称筛选和收藏功能"})
check("登录用户提交许愿", code == 200 and json.loads(body).get("ok"))

code, body = req(guest, "POST", "/api/wishes",
                 {"product": "其他", "contact": "电话 13800000000",
                  "content": "想要一个家庭账本小程序"})
check("游客提交许愿（需留联系方式）", code == 200 and json.loads(body).get("ok"))

code, body = req(admin, "POST", "/api/wishes",
                 {"product": "数字保险箱", "contact": "微信 xunijiayuan",
                  "content": "希望支持保单到期提醒"})
d = json.loads(body)
check("管理员提交许愿", code == 200 and d.get("ok"))
admin_wish_id = None

code, body = req(user, "POST", "/api/wishes",
                 {"product": "其他", "contact": "微信 a", "content": "短"})
check("过短内容被拦截", code == 400)

code, body = req(guest, "GET", "/api/wishes")
d = json.loads(body)
wishes = d.get("wishes", [])
check("公开列表可见全部许愿(3条)", len(wishes) == 3, f"实际{len(wishes)}条")
check("游客视角无修改权限", all(not w.get("can_manage") for w in wishes))
check("列表含状态选项", d.get("status_options") == ["待评估", "已纳入规划", "开发中", "已上线", "暂不规划"])

code, body = req(guest, "GET", "/api/wishes?kw=" + urllib.request.quote("医院"))
d = json.loads(body)
check("关键词搜索许愿", len(d.get("wishes", [])) == 1)

code, body = req(guest, "GET", "/api/wishes?product=" + urllib.request.quote("数字保险箱"))
d = json.loads(body)
check("按产品筛选许愿", len(d.get("wishes", [])) == 1)
if d.get("wishes"):
    admin_wish_id = d["wishes"][0]["id"]

mine_id = None
code, body = req(user, "GET", "/api/my/wishes")
d = json.loads(body)
if d.get("wishes"):
    mine_id = d["wishes"][0]["id"]
check("我的许愿（操作记忆）", d.get("ok") and len(d.get("wishes", [])) == 1)

if mine_id:
    code, body = req(user, "PUT", f"/api/wishes/{mine_id}",
                     {"content": "希望增加按医院名称筛选、收藏和数据导出功能"})
    check("用户修改自己的许愿", code == 200 and json.loads(body).get("ok"))

if admin_wish_id:
    code, body = req(user, "DELETE", f"/api/wishes/{admin_wish_id}")
    check("用户删除他人许愿被拒(403)", code == 403)
    code, body = req(user, "PUT", f"/api/wishes/{admin_wish_id}", {"status": "已纳入规划"})
    check("普通用户改状态被拒(403)", code == 403)

print("═══ 四、管理后台 ═══")
code, body = req(user, "GET", "/api/admin/overview")
check("非管理员访问管理接口被拒(403)", code == 403)

code, body = req(admin, "GET", "/api/admin/overview")
d = json.loads(body)
check("管理员查看统计", d.get("ok") and d["stats"]["users"] == 2 and d["stats"]["wishes"] == 3)

code, body = req(admin, "GET", "/api/admin/logs")
d = json.loads(body)
actions = [l["action"] for l in d.get("logs", [])]
check("操作日志留痕（注册/登录/许愿）",
      "注册账号" in actions and "提交许愿" in actions)

if admin_wish_id:
    code, body = req(admin, "PUT", f"/api/wishes/{admin_wish_id}", {"status": "已纳入规划"})
    check("管理员更新愿望状态", code == 200 and json.loads(body).get("ok"))
    code, body = req(guest, "GET", "/api/wishes?product=" + urllib.request.quote("数字保险箱"))
    d = json.loads(body)
    check("状态修改已生效", d["wishes"][0]["status"] == "已纳入规划")

code, html = req(admin, "GET", "/admin")
check("管理员进入后台页面", code == 200 and "管理后台" in html)
code, html = req(user, "GET", "/admin")
check("普通用户进后台被拦截", "管理员权限" in html)

code, html = req(admin, "GET", "/admin")
check("后台含积木管理区(V1.2)", "积木管理" in html and "新增积木" in html and "bf-name" in html)

print("═══ 五、删除与登出 ═══")
if mine_id:
    code, body = req(user, "DELETE", f"/api/wishes/{mine_id}")
    check("用户删除自己的许愿", code == 200 and json.loads(body).get("ok"))

if admin_wish_id:
    code, body = req(admin, "DELETE", f"/api/wishes/{admin_wish_id}")
    check("管理员删除愿望", code == 200 and json.loads(body).get("ok"))

code, body = req(guest, "GET", "/api/wishes")
d = json.loads(body)
check("删除后列表仅剩游客愿望", len(d.get("wishes", [])) == 1)

code, body = req(user, "POST", "/api/auth/logout")
check("登出成功", code == 200)

code, body = req(user, "GET", "/api/my/wishes")
check("登出后访问我的许愿被拒(401)", code == 401)

print("═══ 六、开放生态API ═══")
code, body = req(guest, "GET", "/api/products")
d = json.loads(body)
check("产品矩阵接口(13位积木)", d.get("ok") and len(d["products"]) == 13)

code, body = req(guest, "GET", "/api/ecosystem/status")
d = json.loads(body)
check("生态总览接口", d.get("ok") and d.get("domain") == "ecojia.cn"
      and d["stats"]["users"] == 2)

code, body = req(guest, "GET", "/api/tools")
d = json.loads(body)
check("工具清单接口", d.get("ok") and d.get("count") >= 15)
check("工具清单含在线入口", d.get("online", 0) >= 10)

code, body = req(guest, "GET", "/api/huoxing/records")
d = json.loads(body)
check("火星平面羽毛记录接口", d.get("ok") and d.get("count") >= 1)

print("═══ 七、积木底座（ecosystem.json 单一数据源） ═══")
code, body = req(guest, "GET", "/api/ecosystem/manifest")
d = json.loads(body)
m = d.get("manifest", {})
check("底座全量清单接口", d.get("ok") and m.get("meta", {}).get("domain") == "ecojia.cn")
check("清单含13位积木", len(m.get("products", [])) == 13)
check("清单含硬件探讨区", len(m.get("hardware", [])) == 6)
check("清单含子域名规划", len(m.get("subdomains", [])) >= 5)
check("清单含接口目录", len(m.get("apis", [])) >= 15)
check("清单未写入密钥字段",
      "password" not in json.dumps(m, ensure_ascii=False).lower())

code, body = req(guest, "GET", "/api/ecosystem/search?q=" + urllib.request.quote("羽毛"))
d = json.loads(body)
check("底座查找：羽毛 → 火星平面",
      d.get("count", 0) >= 1 and d["hits"][0]["item"].get("en") == "huoxingPM")

code, body = req(guest, "GET", "/api/ecosystem/search?q=BIGBOX")
d = json.loads(body)
check("底座查找：英文品牌名可命中",
      any(h["item"].get("en") == "BIGBOX" for h in d.get("hits", [])))

code, body = req(guest, "GET", "/api/ecosystem/search?q=" + urllib.request.quote("无人机"))
d = json.loads(body)
check("底座查找：硬件区可查", any(h["type"] == "hardware" for h in d.get("hits", [])))

code, body = req(guest, "GET", "/api/ecosystem/search")
check("空关键词被拦截(400)", code == 400)

req(user, "POST", "/api/auth/login", {"username": "ceshi01", "password": "test123456"})
code, body = req(user, "POST", "/api/ecosystem/products", {"name": "测试积木"})
check("非管理员新增积木被拒(403)", code == 403)

code, body = req(admin, "POST", "/api/ecosystem/products",
                 {"name": "测试积木", "en": "testBrick", "scope": "测试", "icon": "🧪",
                  "desc": "自动化测试用积木", "status": "规划中"})
d = json.loads(body)
check("管理员新增积木", code == 200 and d.get("ok"))
check("新增积木自动编号并插在「待添加」之前", d.get("item", {}).get("no") == "13")

code, body = req(guest, "GET", "/api/products")
d = json.loads(body)
check("新增后矩阵变14位", len(d["products"]) == 14)
check("「待添加」始终在末位", d["products"][-1]["name"] == "待添加")

code, body = req(admin, "PUT", "/api/ecosystem/products/13",
                 {"desc": "已修改说明", "status": "开发中"})
d = json.loads(body)
check("管理员修改积木", code == 200 and d.get("item", {}).get("status") == "开发中")

code, body = req(admin, "PUT", "/api/ecosystem/products/14", {"name": "改待添加"})
check("「待添加」占位不可修改(400)", code == 400)

code, body = req(admin, "POST", "/api/ecosystem/products", {"name": "测试积木"})
check("同名积木被拦截(400)", code == 400)

code, body = req(admin, "DELETE", "/api/ecosystem/products/13")
check("管理员移除积木", code == 200)

code, body = req(guest, "GET", "/api/products")
d = json.loads(body)
check("移除后矩阵恢复13位", len(d["products"]) == 13 and d["products"][-1]["name"] == "待添加")

code, body = req(admin, "GET", "/api/admin/logs")
d = json.loads(body)
actions = [l["action"] for l in d.get("logs", [])]
check("积木增删操作写入日志", "新增积木" in actions and "移除积木" in actions)

print()
print(f"═══════ 测试结果：{passed} 通过 / {failed} 失败 ═══════")
sys.exit(1 if failed else 0)
