#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ecojia 运维脚本公共库：内容指纹 / 快照 / 校验 / 重启 / 版本戳"""
import datetime
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tarfile
import time

TZ = datetime.timezone(datetime.timedelta(hours=8))
BACKUP_ROOT = "/opt/ecojia/backups"
SCRIPTS_DIR = "/opt/ecojia/scripts"
SERVICE_MAP = {
    "portal": "ecojia-portal.service",
    "ziliao": "ecojia-ziliao.service",
}
HEALTH_URL = {
    "portal": "http://127.0.0.1:8400/",
    "ziliao": "http://127.0.0.1:8300/",
}

def now_iso():
    return datetime.datetime.now(TZ).isoformat(timespec="seconds")

def ts():
    return datetime.datetime.now(TZ).strftime("%Y%m%d_%H%M%S")

def log(msg, fp=sys.stdout):
    print(f"[{now_iso()}] {msg}", file=fp, flush=True)

def git(repo, *args, check=True, timeout=60):
    try:
        p = subprocess.run(["git", "-C", repo] + list(args),
                           capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"git {' '.join(args)} 超时({timeout}s)")
    if check and p.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} 失败: {(p.stderr or p.stdout).strip()}")
    return p.stdout.strip()

def try_git(repo, *args, timeout=60):
    """网络操作可能卡住，超时按失败返回，不抛异常（否则整份判定矩阵会崩掉）"""
    try:
        p = subprocess.run(["git", "-C", repo] + list(args),
                           capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return False, "", f"超时({timeout}s)"
    return p.returncode == 0, (p.stdout or "").strip(), (p.stderr or "").strip()

# ── 内容指纹（唯一可比标准）──────────────────────────────────────────
def fingerprint(repo, ref="HEAD"):
    """sha256 over sorted `git ls-tree -r <ref>` lines；blob sha 由内容决定，跨仓库可比"""
    out = git(repo, "ls-tree", "-r", ref)
    lines = sorted(l for l in out.splitlines() if l.strip())
    return hashlib.sha256("\n".join(lines).encode()).hexdigest(), len(lines)

def commit_info(repo, ref):
    ok, out, _ = try_git(repo, "log", "-1", "--format=%H|%ct|%ci|%s", ref)
    if not ok or not out:
        return None
    sha, epoch, ctime, subject = out.split("|", 3)
    return {"commit_full": sha, "commit": sha[:7], "commit_epoch": int(epoch),
            "commit_time": ctime, "subject": subject}

def ref_exists(repo, ref):
    ok, _, _ = try_git(repo, "rev-parse", "--verify", "--quiet", ref + "^{commit}")
    return ok

def is_ancestor(repo, a, b):
    """a 是否为 b 的祖先（a 更旧）"""
    ok, _, _ = try_git(repo, "merge-base", "--is-ancestor", a, b)
    return ok

def diverged_files(repo, a, b):
    ok, out, _ = try_git(repo, "diff", "--name-only", a, b)
    return out.splitlines() if ok and out else []

# ── 版本戳 BUILD.json（本地文件，不纳入 git）────────────────────────
def stamp_path(repo):
    return os.path.join(repo, "BUILD.json")

def read_stamp(repo):
    try:
        with open(stamp_path(repo), "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}

def write_stamp(repo, source="live", extra=None):
    """重新生成版本戳；内容未变时保留原 build_time/version"""
    full = git(repo, "rev-parse", "HEAD")
    fp, n = fingerprint(repo)
    dirty = bool(git(repo, "status", "--porcelain", "--untracked-files=no"))
    old = read_stamp(repo)
    if old.get("content_sha256") == fp and old.get("commit_full") == full:
        version = old.get("version", "V1.6")
        build_time = old.get("build_time", now_iso())
        build_epoch = old.get("build_epoch", int(time.time()))
    else:
        version = bump_version(old.get("version"))
        build_time = now_iso()
        build_epoch = int(time.time())
    data = {
        "version": version,
        "commit": full[:7],
        "commit_full": full,
        "branch": git(repo, "rev-parse", "--abbrev-ref", "HEAD"),
        "build_time": build_time,
        "build_epoch": build_epoch,
        "content_sha256": fp,
        "content_files": n,
        "source": source,
        "worktree_dirty": dirty,
        "paused_auto_sync": bool(old.get("paused_auto_sync")),
        "last_synced_at": old.get("last_synced_at"),
        "last_deploy_snapshot": old.get("last_deploy_snapshot"),
        "generator": "build_stamp.py v2",
        "updated_at": now_iso(),
    }
    if extra:
        data.update(extra)
    with open(stamp_path(repo), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return data

def bump_version(old_ver):
    if not old_ver:
        return "V1.6"
    nums = []
    for p in str(old_ver).lstrip("Vv").split("."):
        if p.isdigit():
            nums.append(int(p))
        else:
            break
    if not nums:
        return "V1.6"
    if len(nums) >= 3:
        nums = nums[:3]
        nums[2] += 1
        return "V" + ".".join(map(str, nums))
    if len(nums) == 2:
        return "V%d.%d.1" % (nums[0], nums[1])
    return "V%d.1" % nums[0]

# ── 快照（唯一合法的回滚源）────────────────────────────────────────
def snapshot(repo, tag="deploy"):
    name = "%s_%s_%s" % (tag, ts(), os.path.basename(repo))
    path = os.path.join(BACKUP_ROOT, name)
    os.makedirs(path, exist_ok=True)
    # 1) 受版本控制的文件（线上真实工作区状态）
    files = git(repo, "ls-files", "-z")
    lst = os.path.join(path, ".filelist")
    with open(lst, "w", encoding="utf-8") as f:
        f.write(files.replace("\0", "\n"))
    subprocess.run(["git", "-C", repo, "ls-files", "-z"], check=True,
                   stdout=open(lst, "wb"))
    subprocess.run(
        "cd %s && tr '\\0' '\\n' < %s | tar -czf %s/files.tar.gz -T -" % (repo, lst, path),
        shell=True, check=True)
    # 2) 版本戳与提交指针
    if os.path.exists(stamp_path(repo)):
        shutil.copy2(stamp_path(repo), os.path.join(path, "BUILD.json"))
    with open(os.path.join(path, "HEAD"), "w", encoding="utf-8") as f:
        f.write(git(repo, "rev-parse", "HEAD") + "\n")
    # 3) 快照自校验（缺文件清单或归档即视为无效）
    if not os.path.exists(os.path.join(path, "files.tar.gz")):
        raise RuntimeError("快照创建失败：缺少 files.tar.gz")
    with open(os.path.join(path, "SNAPSHOT.json"), "w", encoding="utf-8") as f:
        json.dump({"repo": repo, "created_at": now_iso(), "head": git(repo, "rev-parse", "HEAD")},
                  f, ensure_ascii=False, indent=2)
    log("快照已创建：%s（%d 个受管文件）" % (path, len([l for l in files.split("\0") if l])))
    return path

def valid_snapshot(path):
    return (os.path.isdir(path) and
            os.path.exists(os.path.join(path, "files.tar.gz")) and
            os.path.exists(os.path.join(path, "SNAPSHOT.json")))

def list_snapshots(repo):
    out = []
    if not os.path.isdir(BACKUP_ROOT):
        return out
    base = os.path.basename(repo)
    for n in sorted(os.listdir(BACKUP_ROOT)):
        p = os.path.join(BACKUP_ROOT, n)
        if os.path.isdir(p) and valid_snapshot(p):
            try:
                with open(os.path.join(p, "SNAPSHOT.json"), encoding="utf-8") as f:
                    meta = json.load(f)
            except (OSError, ValueError):
                continue
            if os.path.basename(meta.get("repo", "")) == base:
                out.append((n, meta.get("created_at", ""), meta.get("head", "")[:7]))
    return out

def restore(repo, path):
    """从时间戳快照恢复工作区受管文件"""
    if not valid_snapshot(path):
        raise RuntimeError("拒绝恢复：%s 不是合法的带时间戳快照" % path)
    with tarfile.open(os.path.join(path, "files.tar.gz")) as tf:
        tf.extractall(repo)
    shutil.copy2(os.path.join(path, "BUILD.json"), stamp_path(repo))
    log("已从快照恢复：%s" % path)

# ── 服务与健康检查 ────────────────────────────────────────────────
def service_name(repo):
    return SERVICE_MAP.get(os.path.basename(repo))

def restart(repo):
    svc = service_name(repo)
    if not svc:
        return True
    p = subprocess.run(["sudo", "-n", "systemctl", "restart", svc],
                       capture_output=True, text=True)
    if p.returncode != 0:
        # 兼容无免密 sudo 的场景：由调用方以 root 执行
        p = subprocess.run(["systemctl", "restart", svc], capture_output=True, text=True)
    ok = p.returncode == 0
    log("%s %s" % ("已重启" if ok else "重启失败", svc),)
    time.sleep(2)
    return ok

def health(repo):
    url = HEALTH_URL.get(os.path.basename(repo))
    if not url:
        return True, ""
    p = subprocess.run(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}",
                        "-m", "10", url], capture_output=True, text=True)
    code = p.stdout.strip()
    ok = code.startswith("2") or code.startswith("3")
    log("健康检查 %s → HTTP %s %s" % (url, code, "通过" if ok else "失败"))
    return ok, code
