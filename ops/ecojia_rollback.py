#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ecojia 回滚脚本（只允许回滚到带时间戳快照）
================================
硬约束（代码强制，不靠注释）：
  C1 只接受 --snapshot <目录> 或 --latest；任何 commit / 分支 / tag 形态的参数一律拒绝。
  C2 快照必须位于 /opt/ecojia/backups/ 且包含 files.tar.gz + SNAPSHOT.json，否则拒绝。
  C3 恢复后重写版本戳（source=rollback），重启并做健康检查。

用法：
  python3 ecojia_rollback.py --repo /opt/ecojia/portal --list
  python3 ecojia_rollback.py --repo /opt/ecojia/portal --latest
  python3 ecojia_rollback.py --repo /opt/ecojia/portal --snapshot /opt/ecojia/backups/pre_deploy_20261107_140000_portal
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ecojia_lib as L

BACKUP_ROOT = "/opt/ecojia/backups"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--latest", action="store_true")
    ap.add_argument("--snapshot", default=None)
    ap.add_argument("--no-restart", action="store_true")
    a = ap.parse_args()

    repo = os.path.abspath(a.repo)
    snaps = L.list_snapshots(repo)

    if a.list or (not a.latest and not a.snapshot):
        print("可用快照（%s）：" % repo)
        if not snaps:
            print("  （无）")
        for name, created, head in snaps:
            print("  %-52s %s  HEAD %s" % (name, created, head))
        return 0

    if a.snapshot:
        # C1：拒绝任何非快照路径（commit/分支/tag）
        p = a.snapshot if os.path.isabs(a.snapshot) else os.path.join(BACKUP_ROOT, a.snapshot)
        if not os.path.isdir(p):
            L.log("✗ 拒绝：%s 不是快照目录。回滚只接受带时间戳快照，不接受 commit/分支（如 3a6f4c6）。" % a.snapshot)
            return 2
        if os.path.dirname(os.path.abspath(p)) != BACKUP_ROOT:
            L.log("✗ 拒绝：快照必须位于 %s 下" % BACKUP_ROOT)
            return 2
        if not L.valid_snapshot(p):
            L.log("✗ 拒绝：快照不完整或未经时间戳登记：%s" % p)
            return 2
        snap = p
    else:
        if not snaps:
            L.log("✗ 没有可用快照，无法回滚")
            return 3
        snap = os.path.join(BACKUP_ROOT, snaps[-1][0])
        L.log("使用最新快照：%s" % snap)

    L.log("当前 HEAD：%s" % L.git(repo, "rev-parse", "HEAD")[:7])
    L.restore(repo, snap)
    stamp = L.write_stamp(repo, source="rollback", extra={"rolled_back_from_snapshot": snap})
    L.log("✓ 已回滚 → %s（%s）" % (stamp["version"], stamp["commit"]))
    if not a.no_restart:
        L.restart(repo)
        ok, code = L.health(repo)
        if not ok:
            L.log("⚠ 回滚后健康检查未通过（HTTP %s），请人工检查" % code)
            return 8
    return 0


if __name__ == "__main__":
    sys.exit(main())
