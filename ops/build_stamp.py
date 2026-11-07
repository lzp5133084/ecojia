#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ecojia 版本戳生成器（构建戳）
================================
输出文件：<repo>/BUILD.json

判定“哪端新”的唯一可比标准 = content_sha256（内容指纹），
不是 commit hash，也不是文件修改时间。

内容指纹算法（确定性、可跨仓库复现）：
    git ls-tree -r <commit>  →  每行 "mode type blob_sha\\tpath"
    按行字典序排序  →  sha256("\\n".join(lines))  →  十六进制

因为 blob_sha 只由文件内容决定，所以：
    同一套文件内容 → 无论来自服务器、GitHub、Gitee，指纹完全相同。

用法：
    python3 build_stamp.py [--repo DIR] [--ref REF] [--source live|git|rollback|snapshot]
                           [--version V] [--allow-dirty]
"""
import argparse
import datetime
import hashlib
import json
import os
import subprocess
import sys

TZ = datetime.timezone(datetime.timedelta(hours=8))


def git(repo, *args, check=True):
    p = subprocess.run(["git", "-C", repo] + list(args),
                       capture_output=True, text=True)
    if check and p.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} 失败: {p.stderr.strip()}")
    return p.stdout


def fingerprint(repo, ref):
    """内容指纹：对 ls-tree 输出排序后做 sha256"""
    out = git(repo, "ls-tree", "-r", ref)
    lines = sorted(l for l in out.splitlines() if l.strip())
    h = hashlib.sha256("\n".join(lines).encode("utf-8")).hexdigest()
    return h, len(lines)


def is_dirty(repo):
    out = git(repo, "status", "--porcelain", "--untracked-files=no")
    return bool(out.strip()), [l for l in out.splitlines() if l.strip()]


def bump_version(old_ver):
    """V1.5 → V1.5.1；V1.5.1 → V1.5.2；无法解析则返回 V1.6"""
    if not old_ver:
        return "V1.6"
    parts = old_ver.lstrip("Vv").split(".")
    nums = []
    for p in parts:
        if p.isdigit():
            nums.append(int(p))
        else:
            break
    if len(nums) == 0:
        return "V1.6"
    if len(nums) >= 3:
        nums[2] += 1
        return "V" + ".".join(str(n) for n in nums[:3])
    if len(nums) == 2:
        return "V%d.%d.1" % (nums[0], nums[1])
    return "V%d.1" % nums[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=os.getcwd())
    ap.add_argument("--ref", default="HEAD")
    ap.add_argument("--source", default="live",
                    choices=["live", "git", "rollback", "snapshot"])
    ap.add_argument("--version", default=None)
    ap.add_argument("--allow-dirty", action="store_true")
    a = ap.parse_args()

    repo = os.path.abspath(a.repo)
    if not os.path.isdir(os.path.join(repo, ".git")):
        print(f"[build_stamp] 不是 git 仓库: {repo}", file=sys.stderr)
        return 2

    full = git(repo, "rev-parse", a.ref).strip()
    short = full[:7]
    branch = git(repo, "rev-parse", "--abbrev-ref", a.ref).strip()
    fp, nfiles = fingerprint(repo, a.ref)
    dirty, dirty_list = is_dirty(repo)
    if dirty and not a.allow_dirty:
        print("[build_stamp] ⚠ 工作区存在未提交改动（BUILD.json 仍按 commit 生成）：",
              file=sys.stderr)
        for l in dirty_list[:12]:
            print("   " + l, file=sys.stderr)

    stamp_path = os.path.join(repo, "BUILD.json")
    old = {}
    try:
        with open(stamp_path, "r", encoding="utf-8") as f:
            old = json.load(f)
    except (OSError, ValueError):
        pass

    same = old.get("content_sha256") == fp and old.get("commit_full") == full
    if a.version:
        version = a.version
    elif same and old.get("version"):
        version = old["version"]
    else:
        version = bump_version(old.get("version"))

    now = datetime.datetime.now(TZ)
    data = {
        "version": version,
        "commit": short,
        "commit_full": full,
        "branch": branch,
        "build_time": old["build_time"] if same and old.get("build_time") else now.isoformat(timespec="seconds"),
        "build_epoch": old["build_epoch"] if same and old.get("build_epoch") else int(now.timestamp()),
        "content_sha256": fp,
        "content_files": nfiles,
        "source": a.source,
        "worktree_dirty": dirty,
        "generator": "build_stamp.py v1",
        "updated_at": now.isoformat(timespec="seconds"),
    }
    with open(stamp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(json.dumps(data, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
