#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ecojia 双端同步器：哪端新用哪端
================================
判定顺序（全部可判定，禁止“看起来比较新”）：
  1) content_sha256 相同               → SAME（视为同一版本，无需动作）
  2) 远端是本地祖先                     → LOCAL_NEWER（本地新，推送）
  3) 本地是远端祖先                     → REMOTE_NEWER（远端新，快进拉取）
  4) 两者互不包含                       → DIVERGED（分叉，停止并列出差异文件，人工/脚本按文件合并）

拉取前强制创建时间戳快照；拉取后校验健康，失败自动回落该快照。
用法：
  python3 ecojia_sync.py status            # 只打印矩阵，不改动
  python3 ecojia_sync.py sync             # 按判定自动推进
  python3 ecojia_sync.py sync --dry-run    # 演练
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ecojia_lib as L

REPOS = ["/opt/ecojia/portal", "/opt/ecojia/ziliao"]


def remote_names(repo):
    out = L.try_git(repo, "remote", "-v")[1]
    names = {"github": None, "gitee": None}
    for line in out.splitlines():
        parts = line.split()
        if len(parts) < 2:
            continue
        name, url = parts[0], parts[1]
        if "github.com" in url:
            names["github"] = name
        elif "gitee.com" in url:
            names["gitee"] = name
    return names


def inspect(repo):
    """采集本地与各远端的版本矩阵"""
    branch = L.git(repo, "rev-parse", "--abbrev-ref", "HEAD")
    local_commit = L.git(repo, "rev-parse", "HEAD")
    local_fp, n = L.fingerprint(repo)
    dirty = bool(L.git(repo, "status", "--porcelain", "--untracked-files=no"))
    stamp = L.read_stamp(repo)
    info = {
        "repo": repo,
        "branch": branch,
        "local": {"commit": local_commit[:7], "commit_full": local_commit,
                  "content_sha256": local_fp, "files": n,
                  "stamp_version": stamp.get("version"),
                  "stamp_build_time": stamp.get("build_time"),
                  "dirty": dirty},
        "remotes": {},
    }
    names = remote_names(repo)
    for kind, name in names.items():
        if not name:
            info["remotes"][kind] = {"error": "未配置远端"}
            continue
        ok, _, err = L.try_git(repo, "fetch", name, branch, timeout=120)
        ref = "%s/%s" % (name, branch)
        if not ok or not L.ref_exists(repo, ref):
            info["remotes"][kind] = {"error": "拉取失败或分支不存在: %s" % err[:80]}
            continue
        rcommit = L.git(repo, "rev-parse", ref)
        rfp, rn = L.fingerprint(repo, ref)
        ci = L.commit_info(repo, ref) or {}
        info["remotes"][kind] = {
            "name": name, "ref": ref,
            "commit": rcommit[:7], "commit_full": rcommit,
            "content_sha256": rfp, "files": rn,
            "commit_time": ci.get("commit_time"), "subject": ci.get("subject"),
        }
    return info


def verdict(info, kind):
    r = info["remotes"].get(kind, {})
    if "error" in r:
        return "UNREACHABLE"
    if r["content_sha256"] == info["local"]["content_sha256"]:
        return "SAME"
    lc, rc = info["local"]["commit_full"], r["commit_full"]
    repo = info["repo"]
    if L.is_ancestor(repo, rc, lc):
        return "LOCAL_NEWER"
    if L.is_ancestor(repo, lc, rc):
        return "REMOTE_NEWER"
    return "DIVERGED"


def print_matrix(info):
    print("\n═══ %s ═══" % info["repo"])
    l = info["local"]
    print("  本地      %s  指纹 %s  %d 文件  %s%s" % (
        l["commit"], l["content_sha256"][:12], l["files"],
        l["stamp_version"] or "无版本戳", "  ⚠工作区有未提交改动" if l["dirty"] else ""))
    for kind in ("gitee", "github"):
        r = info["remotes"].get(kind, {})
        v = verdict(info, kind)
        if "error" in r:
            print("  %-8s  ✗ %s" % (kind, r["error"]))
        else:
            print("  %-8s  %s  指纹 %s  %d 文件  提交时间 %s  → %s" % (
                kind, r["commit"], r["content_sha256"][:12], r["files"],
                r["commit_time"], v))
    return {k: verdict(info, k) for k in ("gitee", "github")}


def write_status(repo, payload):
    p = os.path.join(repo, "static", ".sync_status.json")
    if not os.path.isdir(os.path.dirname(p)):
        return
    try:
        with open(p, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    except OSError:
        pass


def do_sync(info, dry=False):
    repo = info["repo"]
    vs = {k: verdict(info, k) for k in ("gitee", "github")}
    if info["local"]["dirty"]:
        L.log("✗ 工作区有未提交改动，禁止自动拉取/覆盖；请先提交基线")
        return "BLOCKED_DIRTY"
    if "DIVERGED" in vs.values():
        L.log("✗ 存在分叉，停止自动推进。差异文件：")
        for k, v in vs.items():
            if v == "DIVERGED":
                ref = info["remotes"][k]["ref"]
                for f in L.diverged_files(repo, "HEAD", ref)[:20]:
                    L.log("    [%s] %s" % (k, f))
        return "DIVERGED"
    newer = [k for k, v in vs.items() if v == "REMOTE_NEWER"]
    older = [k for k, v in vs.items() if v == "LOCAL_NEWER"]
    if newer:
        src = info["remotes"][newer[0]]["ref"]
        L.log("→ 判定：%s 更新（%s），执行快进拉取" % (newer[0], src))
        if dry:
            L.log("  [dry-run] 跳过实际拉取")
            return "WOULD_PULL"
        snap = L.snapshot(repo, tag="pre_sync")
        ok, out, err = L.try_git(repo, "merge", "--ff-only", src, timeout=60)
        if not ok:
            L.log("✗ 快进拉取失败：%s" % err)
            return "PULL_FAILED"
        stamp = L.write_stamp(repo, source="sync")
        L.log("✓ 拉取完成 → %s" % stamp["version"])
        if not L.restart(repo) or not L.health(repo)[0]:
            L.log("✗ 健康检查未通过，自动回落到快照 %s" % snap)
            L.restore(repo, snap)
            L.restart(repo)
            return "AUTO_ROLLBACK"
        L.log("✓ 同步拉取成功，快照留存：%s" % snap)
    if older:
        for k in older:
            name = info["remotes"][k]["name"]
            L.log("→ 判定：本地更新，推送到 %s" % k)
            if dry:
                L.log("  [dry-run] 跳过实际推送")
                continue
            ok, out, err = L.try_git(repo, "push", name, "HEAD:refs/heads/%s" % info["branch"],
                                     timeout=180)
            if ok:
                L.log("✓ 已推送 %s" % k)
            else:
                L.log("✗ 推送 %s 失败：%s" % (k, err[:160]))
    if not newer and not older:
        L.log("✓ 两端内容一致，无需动作")
        return "SAME"
    L.write_stamp(repo, source="sync")
    return "OK"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["status", "sync"], nargs="?", default="status")
    ap.add_argument("--repo", default=None)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    repos = [a.repo] if a.repo else REPOS
    results = {}
    for repo in repos:
        if not os.path.isdir(os.path.join(repo, ".git")):
            L.log("跳过（非 git 仓库）：%s" % repo)
            continue
        info = inspect(repo)
        vs = print_matrix(info)
        if a.mode == "sync":
            results[repo] = do_sync(info, dry=a.dry_run)
        write_status(repo, {"checked_at": L.now_iso(), "verdicts": vs,
                            "local": info["local"], "remotes": info["remotes"],
                            "action": results.get(repo)})
    print("\n完成。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
