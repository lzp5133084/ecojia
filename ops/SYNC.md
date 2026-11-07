# ecojia 双端同步与部署规则（哪端新用哪端）

作者：军哥懂保（微信：xunijiayuan） · 版本：2026-11-07

本文件是**规则来源**：脚本行为与本文一一对应，若两者不一致，以本文为判定依据并修正脚本。

---

## 1. 为什么以前会被"回滚"

服务器 root crontab 曾有一条每 5 分钟执行的任务：

```
*/5 * * * * sudo -u ubuntu bash -c 'cd /opt/ecojia/portal && git fetch gitee main && git reset --hard FETCH_HEAD'
```

`git reset --hard` 会**丢弃工作区所有改动**，只要服务器上的优化没来得及提交/推送，5 分钟内必然被 Gitee 旧提交覆盖。这就是"线上改好了又被改回旧版"的根因。

处理：**该任务已停用**（原配置备份在 `/opt/ecojia/backups/cron/root_crontab_before_*.txt`），替换为本文第 4 节的只读判定 + 快进同步。

---

## 2. 唯一"新旧"判定标准：内容指纹 + 祖先关系

### 2.1 内容指纹（content_sha256）

```
git ls-tree -r <commit>          → 每行 "mode type blob_sha \t path"
按行字典序排序                   → sha256(join("\n", lines))
```

- `blob_sha` 只由文件内容决定，因此**同一套内容在服务器 / GitHub / Gitee 上指纹完全相同**。
- 指纹相同 = 同一版本，无论提交历史是否不同。

### 2.2 判定表

| 情况 | 判定 | 动作 |
|---|---|---|
| 指纹相同 | `SAME` | 不动作 |
| 远端提交是本地祖先 | `LOCAL_NEWER` | 推送本地 → 双远端 |
| 本地提交是远端祖先 | `REMOTE_NEWER` | 先做时间戳快照 → `git merge --ff-only` |
| 互不包含 | `DIVERGED` | **停止**，列出差异文件，人工/脚本按文件合并 |

判定只使用上面两条客观依据（`git merge-base --is-ancestor` 与 `sha256`），**不使用文件修改时间、不使用"看起来比较新"**。

### 2.3 分叉（DIVERGED）的处理

分叉意味着两端各自新增了不同内容，任何"整端覆盖"都会丢东西。处理顺序：

1. `python3 ops/ecojia_sync.py status` 查看矩阵与差异文件。
2. 逐文件比对；数据文件（如 `ecosystem.json`）按 JSON 内容归并（只增不减）。
3. `git merge -X ours origin/<branch>` 保留对方提交历史、内容以线上基线为准。
4. 复跑 `status`，确认变 `SAME` 后再推。

本次（2026-11-07）即按此处理：GitHub 独有的 T36–T39 保险工具先验证线上四个 URL 均返回 200，再把数据归并进线上 `ecosystem.json`。

---

## 3. 版本戳 BUILD.json

位置：`<repo>/BUILD.json`（**不入库**，`.gitignore` 已登记），由 `ops/build_stamp.py` 生成：

```json
{
  "version": "V1.6.1",             // 基线版本 + 构建序号
  "commit": "a39d245",
  "build_time": "2026-11-07T13:5x:xx+08:00",
  "build_epoch": 1794xxxxx,
  "content_sha256": "94450dbe...",  // 内容指纹（跨端可比）
  "content_files": 120,
  "source": "live|git|sync|deploy|rollback",
  "worktree_dirty": false,
  "last_deploy_snapshot": "/opt/ecojia/backups/..."
}
```

内容未变时 `build_time` 与 `version` 保持不变（不制造无意义版本号）。

---

## 4. 三个脚本

### 4.1 `ops/ecojia_sync.py`（哪端新用哪端）

```bash
python3 ops/ecojia_sync.py status        # 只打印矩阵
python3 ops/ecojia_sync.py sync          # 按判定推进（推送或快进拉取）
python3 ops/ecojia_sync.py sync --dry-run
```

安全约束：

- 工作区有未提交改动 → 拒绝自动拉取（`BLOCKED_DIRTY`），避免覆盖线上未提交改动。
- 分叉 → 拒绝自动推进（`DIVERGED`）。
- 拉取前强制创建时间戳快照；拉取后健康检查失败 → **自动回落到该快照**。
- 远端分支名自动识别 `main` / `master`（子站 Gitee 为 `master`）。

定时任务（ubuntu 用户，每 10 分钟）：

```
*/10 * * * * /usr/bin/python3 /opt/ecojia/scripts/ecojia_sync.py sync >> /opt/ecojia/sync.log 2>&1
```

### 4.2 `ops/ecojia_deploy.py`（部署）

```bash
python3 ops/ecojia_deploy.py --repo /opt/ecojia/portal --ref github/main
```

代码内强制（不是注释）：

| 规则 | 行为 | 退出码 |
|---|---|---|
| R1 | 快照必须成功且校验通过，否则终止 | 4 |
| R2 | 目标提交为当前 HEAD 祖先（旧提交）→ 拒绝 | 5 |
| R3 | 工作区有未提交改动 → 拒绝 | 6 |
| R4 | 分叉 → 拒绝并列出差异文件 | 7 |
| R5 | 部署后健康检查失败 → 自动回落到本次快照并重启 | 8 |

即：**仓库里的过期 commit 永远无法覆盖线上更新的文件**。

### 4.3 `ops/ecojia_rollback.py`（回滚）

```bash
python3 ops/ecojia_rollback.py --repo /opt/ecojia/portal --list
python3 ops/ecojia_rollback.py --repo /opt/ecojia/portal --latest
python3 ops/ecojia_rollback.py --repo /opt/ecojia/portal --snapshot /opt/ecojia/backups/pre_deploy_20261107_140000_portal
```

代码内强制：

| 规则 | 行为 |
|---|---|
| C1 | 只接受 `--snapshot` / `--latest`；传入 commit、分支、tag（如 `3a6f4c6`）→ 直接拒绝 |
| C2 | 快照必须位于 `/opt/ecojia/backups/`，且含 `files.tar.gz` + `SNAPSHOT.json` |
| C3 | 恢复后重写版本戳（`source=rollback`）、重启、健康检查 |

---

## 5. 快照规范

- 目录：`/opt/ecojia/backups/<标签>_<YYYYmmdd_HHMMSS>_<仓库名>/`
- 内容：`files.tar.gz`（受 git 管理的文件，即线上真实工作区内容）+ `BUILD.json` + `HEAD` + `SNAPSHOT.json`
- 标签：`pre_deploy`（部署前） / `pre_sync`（拉取前）
- 保留策略：按需清理，但**任何一次部署/拉取都会新建一份**，不覆盖旧快照。

---

## 6. 本次基线对齐结果（2026-11-07）

| 仓库 | 本地 | Gitee | GitHub | 指纹 |
|---|---|---|---|---|
| portal | a39d245 | a39d245 | a39d245 | `94450dbe…` |
| ziliao | 2fb3fea | 2fb3fea（master） | 2fb3fea | `287dfa48…` |

- 线上内容变更：`ecosystem.json` 工具 35 → 39（补入 T36 保单整理 / T37 保障检视 / T38 理赔协助 / T39 案件分析），产品 17 → 18。
- 四个工具线上实测均 `HTTP 200`。
- 曾导致回滚的 5 分钟 `git reset --hard` 定时任务已停用。
