# -*- coding: utf-8 -*-
"""V1.7 全功能 API 冒烟测试：两个账号互测时间胶囊/见证人/AI/家庭链/遗产/年报/验真"""
import json, sys, requests

BASE = "http://127.0.0.1:8401"
A = requests.Session()  # 账号甲（记录主人）
B = requests.Session()  # 账号乙（见证人/家人/继承人）
ok_list, fail_list = [], []

# 测试前清理历史测试数据（幂等：可重复跑）
import sqlite3, os
_db = sqlite3.connect(os.path.join(os.path.dirname(os.path.abspath(__file__)), "ecojia.db"))
_uids = [r[0] for r in _db.execute(
    "SELECT id FROM users WHERE username IN ('hxa17','hxb17')").fetchall()]
if _uids:
    _ph = ",".join("?" * len(_uids))
    for _t in ("hx_records", "hx_blocks", "hx_identity", "hx_witness", "hx_family", "hx_legacy"):
        _col = "user_id" if _t != "hx_witness" else "owner_uid"
        _db.execute("DELETE FROM {} WHERE {} IN ({})".format(_t, _col, _ph), _uids)
        if _t == "hx_witness":
            _db.execute("DELETE FROM hx_witness WHERE witness_uid IN ({})".format(_ph), _uids)
_db.commit(); _db.close()

def chk(name, cond, extra=""):
    (ok_list if cond else fail_list).append(name)
    print(("PASS " if cond else "FAIL ") + name + (" | " + str(extra)[:120] if extra else ""))

def reg_or_login(s, username, pw, nick):
    r = s.post(BASE + "/api/auth/login", json={"username": username, "password": pw})
    if r.json().get("ok"):
        return True
    r = s.post(BASE + "/api/auth/register",
               json={"username": username, "password": pw, "nickname": nick})
    return r.json().get("ok")

# 0. 准备两个账号
chk("登录/注册账号A", reg_or_login(A, "hxa17", "test123456", "胶囊甲"))
chk("登录/注册账号B", reg_or_login(B, "hxb17", "test123456", "见证乙"))

ov_a = A.get(BASE + "/api/huoxing/overview").json()
ov_b = B.get(BASE + "/api/huoxing/overview").json()
did_a, did_b = ov_a["identity"]["did"], ov_b["identity"]["did"]
chk("A/B 身份已铸造", did_a.startswith("did:mars:") and did_b.startswith("did:mars:"))

# 1. 时间胶囊
r = A.post(BASE + "/api/huoxing/records", json={
    "category": "纪念", "happened_on": "2026-10-26", "title": "给十年后的自己",
    "summary": "保密", "detail": "十年后的我，你还好吗？", "visibility": "private",
    "unlock_at": "2036-10-26"})
cap = r.json()
chk("创建时间胶囊", cap.get("ok") and cap["record"]["locked"] is True, cap.get("msg"))
chk("胶囊遮罩正文", cap["record"]["detail"] == "", cap["record"].get("detail"))
cap_id = cap["record"]["id"]

r = A.post(BASE + "/api/huoxing/records", json={
    "category": "历史", "happened_on": "2020-01", "title": "过去的日子",
    "unlock_at": "2020-01-01"})
chk("解锁日期必须在未来被拒绝", not r.json().get("ok"))

# 2. 普通荣耀记录 + 见证人
r = A.post(BASE + "/api/huoxing/records", json={
    "category": "荣耀", "happened_on": "2026-10", "title": "年度服务之星",
    "summary": "被看见的一年", "visibility": "public"})
rec_id = r.json()["record"]["id"]
chk("创建荣耀记录", r.json().get("ok"))

r = A.post(BASE + f"/api/huoxing/records/{rec_id}/witness",
           json={"did": did_b, "statement": "我见证这一刻"})
chk("A 邀请 B 见证", r.json().get("ok"), r.json().get("msg"))
wid = r.json().get("witness_id")

r = A.post(BASE + "/api/huoxing/records/" + str(cap_id) + "/witness",
           json={"did": did_b})
chk("纪念类不可邀请见证", not r.json().get("ok"))

ov_b2 = B.get(BASE + "/api/huoxing/overview").json()
inbox = ov_b2.get("witness_inbox", [])
chk("B 收件箱有见证邀请", len(inbox) >= 1 and inbox[0]["title"] == "年度服务之星")

h_b_before = B.get(BASE + "/api/huoxing/verify").json()["chain"]["height"]
r = B.post(BASE + f"/api/huoxing/witness/{wid}/sign", json={"statement": "实至名归"})
chk("B 签名见证", r.json().get("ok"), r.json().get("msg"))
h_b_after = B.get(BASE + "/api/huoxing/verify").json()["chain"]["height"]
chk("签名写入 B 的链", h_b_after == h_b_before + 1, f"{h_b_before}->{h_b_after}")

ov_a2 = A.get(BASE + "/api/huoxing/overview").json()
rec_w = [x for x in ov_a2["records"] if x["id"] == rec_id][0]
chk("A 看到见证人已签名", rec_w["witnesses"] and rec_w["witnesses"][0]["status"] == "signed")

# 3. AI 记录助手
r = A.post(BASE + "/api/huoxing/ai_draft", json={"text": "去年冬天我第一次拿到理赔锦旗，特别激动"})
d = r.json()
chk("AI 草稿生成", d.get("ok") and d["draft"]["category"] in
    ["历史","成绩","荣耀","难过","开心","纪念","重要"], d.get("via"))
chk("AI 草稿含标题", bool(d["draft"]["title"]))

# 4. 家庭链
r = A.post(BASE + "/api/huoxing/family", json={"did": did_b, "relation": "兄弟"})
chk("A 邀请 B 加入家庭链", r.json().get("ok"), r.json().get("msg"))
fam_b = B.get(BASE + "/api/huoxing/overview").json()["family"]
pend = [f for f in fam_b if f["status"] == "pending" and f["direction"] == "in"]
chk("B 收到家庭链邀请", len(pend) == 1)
r = B.post(BASE + f"/api/huoxing/family/{pend[0]['id']}/accept")
chk("B 确认家庭链", r.json().get("ok"), r.json().get("msg"))
fam_a = A.get(BASE + "/api/huoxing/overview").json()["family"]
chk("A 看到已确认家人", fam_a and fam_a[0]["status"] == "confirmed"
    and fam_a[0]["other"]["mars_name"] == "见证乙", fam_a)

# 5. 数字遗产约定
r = A.put(BASE + "/api/huoxing/legacy",
          json={"heir_did": did_b, "heir_name": "见证乙", "inactive_years": 3, "note": "留给我弟"})
chk("A 设置遗产约定", r.json().get("ok"), r.json().get("msg"))
lg = A.get(BASE + "/api/huoxing/overview").json()["legacy"]
chk("遗产约定已生效", lg and lg["heir_did"] == did_b)

# 6. 护照导出 + 互认验证（服务端通道）
exp = A.get(BASE + "/api/huoxing/export")
chk("导出护照", exp.status_code == 200 and "blocks" in exp.text)
passport = exp.json()
r = requests.post(BASE + "/api/huoxing/passport_verify", json={"passport": passport})
v = r.json()
chk("护照验真通过", v.get("ok") and v["valid"], v.get("issues"))
# 篡改检测
bad = json.loads(json.dumps(passport))
bad_id = bad["records"][0]["id"]
for b in bad["blocks"]:
    if b["action"] in ("create","update") and b["record_id"] == bad_id:
        last_payload = b["payload"]
bad["records"][0]["title"] = "被篡改的标题"
r2 = requests.post(BASE + "/api/huoxing/passport_verify", json={"passport": bad})
chk("篡改可被检测", r2.json().get("valid") is False, r2.json().get("issues"))

# 7. 年报
r = A.get(BASE + "/huoxing/annual/2026")
chk("我的年报页 200", r.status_code == 200 and "2026" in r.text)
r = requests.get(BASE + f"/hx/annual/{did_a}/2026")
chk("公开年报页 200", r.status_code == 200)
chk("公开年报不含时间胶囊", "给十年后的自己" not in r.text)

# 8. 公开身份证页排除胶囊
r = requests.get(BASE + f"/hx/card/{did_a}")
chk("公开身份证 200 且排除胶囊", r.status_code == 200 and "给十年后的自己" not in r.text)
chk("公开页展示见证人", "见证乙" in r.text)

# 9. 护照验证器页面
r = requests.get(BASE + "/hx/verify")
chk("护照验证器页 200", r.status_code == 200)

# 10. 验真 & 删除链完整
v = A.get(BASE + "/api/huoxing/verify").json()["chain"]
chk("A 全链验真通过", v["ok"], v.get("issues"))
r = A.delete(BASE + f"/api/huoxing/records/{cap_id}")
v2 = A.get(BASE + "/api/huoxing/verify").json()["chain"]
chk("删除胶囊后验真仍通过", r.json().get("ok") and v2["ok"])

print("\n===== 结果: %d PASS / %d FAIL =====" % (len(ok_list), len(fail_list)))
if fail_list:
    print("失败项:", fail_list)
    sys.exit(1)
