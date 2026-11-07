#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ecojia 部署脚本（带强制约束）
================================
强制规则（写在代码里，不靠注释）：
  R1 任何部署前必须成功创建时间戳快照，否则立即退出（EXIT_NO_SNAPSHOT）。
  R2 只允许“快进”部署：目标提交必须是当前 HEAD 的后代（或内容指纹相同）。
     目标为 HEAD 祖先（旧提交）→ 拒绝（EXIT_TARGET_OLDER），除非显式 --allow-old。
  R3 工作区有未提交改动 → 拒绝（EXIT_DIRTY），防止覆盖线上未提交改动。
  R4 分叉 → 拒绝并列出差异文件（EXIT_DIVERGED）。
  R5 部署后健康检查失败 → 自动回落到本次快照并重启（AUTO_ROLLBACK）。

用法：
  python3 ecojia_deploy.py --repo /opt/ecojia/portal --ref github/main
  python3 ecojia_deploy.py --repo /opt/ecojia/portal --allow-old --ref 3a6f4c6   # 不推荐
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ecojia_lib as L

EXIT_OK = 0
EXIT_NO_SNAPSHOT = 4
EXIT_TARGET_OLDER = 5
EXIT_DIRTY = 6
EXIT_DIVERGED = 7
EXIT_HEALTH = 8


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--ref", default="HEAD")
    ap.add_argument("--no-restart", action="store_true")
    ap.add_argument("--allow-old", action="store_true")
    a = ap.parse_args()

    repo = os.path.abspath(a.repo)
    if not os.path.isdir(os.path.join(repo, ".git")):
        L.log("✗ 不是 git 仓库：%s" % repo)
        return 9

    head = L.git(repo, "rev-parse", "HEAD")
    head_fp, _ = L.fingerprint(repo)
    target = L.git(repo, "rev-parse", "--verify", a.ref + "^{commit}")
    target_fp, _ = L.fingerprint(repo, target)

    L.log("部署目标 %s (%s)  指纹 %s" % (a.ref, target[:7], target_fp[:12]))
    L.log("当前线上 %s          指纹 %s" % (head[:7], head_fp[:12]))

    if target_fp == head_fp:
        L.log("✓ 内容指纹一致，无需部署")
        L.write_stamp(repo, source="deploy")
        return EXIT_OK

    dirty = L.git(repo, "status", "--porcelain", "--untracked-files=no")
    if dirty and target != head:
        L.log("✗ 工作区存在未提交改动，拒绝部署：")
        for l in dirty.splitlines()[:15]:
            L.log("    " + l)
        return EXIT_DIRTY

    if L.is_ancestor(repo, target, head):
        if not a.allow_old:
            L.log("✗ 拒绝：目标 %s 是线上 %s 的祖先（旧提交），上线会覆盖线上更新文件。"
                  % (target[:7], head[:7]))
            L.log("  如需强制，请改用 rollback.py 恢复到带时间戳快照，或显式 --allow-old。")
            return EXIT_TARGET_OLDER
        L.log("⚠ 已显式 --allow-old，允许用旧提交部署（仍会先做快照）")

    if not L.is_ancestor(repo, head, target) and not L.is_ancestor(repo, target, head):
        L.log("✗ 分叉，拒绝自动部署。差异文件：")
        for f in L.diverged_files(repo, head, target)[:20]:
            L.log("    " + f)
        return EXIT_DIVERGED

    # R1：强制快照
    try:
        snap = L.snapshot(repo, tag="pre_deploy")
    except Exception as e:  # noqa: BLE001
        L.log("✗ 快照创建失败，部署终止：%s" % e)
        return EXIT_NO_SNAPSHOT
    if not L.valid_snapshot(snap):
        L.log("✗ 快照校验失败，部署终止")
        return EXIT_NO_SNAPSHOT

    if a.allow_old and L.is_ancestor(repo, target, head):
        ok, _, err = L.try_git(repo, "reset", "--hard", target, timeout=60)
        if not ok:
            L.log("✗ 部署失败：%s" % err)
            L.restore(repo, snap)
            return 1
    else:
        ok, out, err = L.try_git(repo, "merge", "--ff-only", target, timeout=60)
        if not ok:
            L.log("✗ 快进失败：%s" % err)
            L.restore(repo, snap)
            return 1

    stamp = L.write_stamp(repo, source="deploy", extra={"last_deploy_snapshot": snap})
    L.log("✓ 部署完成 → %s（%s）" % (stamp["version"], stamp["commit"]))

    if not a.no_restart:
        if not L.restart(repo) or not L.health(repo)[0]:
            L.log("✗ 健康检查失败，自动回落到快照：%s" % snap)
            L.restore(repo, snap)
            L.restart(repo)
            return EXIT_HEALTH
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
