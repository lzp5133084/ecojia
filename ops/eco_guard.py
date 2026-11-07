#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ecosystem.json 部署守卫：按“内容版本”判定新旧，不按文件时间。

背景：2026-11-07 发现数据文件的“新旧”判定只靠时间戳/部署顺序，
旧副本或漏改的本地镜像可以直接覆盖线上，导致条目静默回退。
本守卫以 _meta.rev 为唯一版本依据：

  incoming.rev > live.rev                       → 允许（正常升级）
  incoming.rev == live.rev 且内容哈希相同        → 允许（无变化）
  incoming.rev == live.rev 且内容哈希不同        → 拒绝（改了内容却没升版本）
  incoming.rev < live.rev                       → 拒绝（旧文件覆盖线上）
  缺 _meta.rev                                  → 拒绝（无版本号，来源不明）

用法：
  python3 eco_guard.py <incoming.json> <live.json>
退出码：0=允许，2=拒绝，3=参数/文件错误
"""
import hashlib
import json
import sys


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def digest(d):
    body = {k: v for k, v in d.items() if k != "_meta"}
    return hashlib.sha256(
        json.dumps(body, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def main():
    if len(sys.argv) != 3:
        print("用法: eco_guard.py <incoming.json> <live.json>")
        return 3
    inc_p, live_p = sys.argv[1], sys.argv[2]
    try:
        inc = load(inc_p)
    except Exception as e:
        print("[guard] 读取待安装文件失败: %s" % e)
        return 3
    try:
        live = load(live_p)
    except Exception:
        print("[guard] 线上文件读取失败，视为首次安装，放行")
        return 0

    ir = (inc.get("_meta") or {}).get("rev")
    lr = (live.get("_meta") or {}).get("rev", 0)
    if not isinstance(ir, int):
        print("[guard] 拒绝：待安装文件缺 _meta.rev（来源不明，可能来自旧副本）")
        return 2

    if ir < lr:
        print("[guard] 拒绝：待安装 rev=%s 低于线上 rev=%s，会覆盖较新数据" % (ir, lr))
        return 2
    if ir == lr and digest(inc) != digest(live):
        print("[guard] 拒绝：rev 同为 %s 但内容不同，请先把 rev 升到 %s" % (ir, ir + 1))
        return 2

    ic = len(inc.get("tools") or [])
    lc = len(live.get("tools") or [])
    if ic < lc:
        print("[guard] 允许安装，但工具数由 %d 减为 %d（rev %s→%s，属有意删减）" % (lc, ic, lr, ir))
    elif ic > lc:
        print("[guard] 允许安装，工具数 %d → %d（rev %s→%s）" % (lc, ic, lr, ir))
    else:
        print("[guard] 允许安装，工具数不变 %d（rev %s→%s）" % (ic, lr, ir))
    return 0


if __name__ == "__main__":
    sys.exit(main())
