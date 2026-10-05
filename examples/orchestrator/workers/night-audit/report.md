# 夜班文档健康审计报告 — dsh-muse

- **审计时间**：2026-10-06 00:01 (+08:00)
- **审计对象**：`/Users/douba/Projects/dsh-muse`（工作树 HEAD = `9c5a85d docs: journal`，`git status` 干净）
- **审计范围**：仓库内全部 56 个 `.md`（含 `docs/` 37 个、包 README、根 README 对、`AGENTS.md`、worker 产出），零改动的只读审计
- **审计方式**：解析所有 markdown 内联/引用式链接与 HTML 链接，按「所在文件目录」解析相对路径并校验存在性；用 `git log --diff-filter=DR` 检出历史删除/重命名；对反引号引用的路径做二次解析；对根 README 对做章节结构与链接集合对比
- **结论**：`docs/` 的内部链接**全部有效**（37/37）；问题集中根 README 双语不同步、两处 `.zh` 包 README 失效外链、以及一处被 `.gitignore` 吞掉的示例文件引用

## 严重度定义

| 级别 | 含义 |
|---|---|
| 🔴 High | 明确的失效引用 / 指向不存在的文件，读者按文档操作会直接卡住 |
| 🟠 Medium | 内容不同步、路由指向缺失文档、过时路径引用（非直接断链） |
| 🟡 Low | 历史记录瑕疵、标签与目标不一致等可读性/一致性问题 |
| ✅ 非问题 | 经验证为预期行为或解析假阳性，仅记录以排除误报 |

---

## 问题列表（按严重度排序）

### 🔴 High

#### H1. `examples/gate/README.md:65` 引用的示例文件未纳入版本控制
- **位置**：`examples/gate/README.md:65` → 参考 `local-rules.example.json`
- **事实**：该文件当前存在于磁盘，但 `.gitignore:10` 明确忽略 `examples/gate/local-rules.example.json`，且 `git log --all -- examples/gate/local-rules.example.json` 无任何记录 → **从未入库**。新克隆者按 README 找不到范例模板。
- **建议**：二选一——(a) 从 `.gitignore` 移除该条并把示例模板提交入库（推荐，示例文件本应入库）；(b) 把 README 该处改为内联 JSON 片段或指向真实入库文件。

#### H2. `tool-muse/README.zh.md:29` 相对链接失效
- **位置**：`tool-muse/README.zh.md:29` —— `[工具目录](../../../docs/tool-catalog.md)`
- **事实**：`../../../` 解析到 `/Users/douba/Projects/docs/tool-catalog.md`，该路径不存在（`docs/tool-catalog.md` 在仓库内也不存在，属上游生成物）。英文版 `tool-muse/README.md:29` 用的是上游 GitHub URL `https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-catalog.md`。
- **建议**：中文版改用与英文版一致的上游 URL。

#### H3. `muse/README.zh.md:7` 相对链接失效
- **位置**：`muse/README.zh.md:7` —— `[goal-round-driver](../../goal/goal-round-driver/README.md)`
- **事实**：`../../` 解析到 `/Users/douba/Projects/goal/goal-round-driver/README.md`，不存在。英文版 `muse/README.md:7` 用上游 GitHub tree URL。
- **建议**：中文版改用与英文版一致的上游 URL，或删除该相对链接。

### 🟠 Medium

#### M1. 根 `README.md` 与 `README.zh-CN.md` 章节结构对齐、章节内容不同步
- **结构层面**：两份均为 6 个 `##` 章节，顺序 1:1 映射，**结构是同步的**——
  `What is this / 这是什么`、`Install / 安装`、`Experience it / 体验三步`、`Docs / 文档`、`Status / 状态`、`License / 许可`。
  （H1 仅差「（中文说明）」标注；两份都有一个被解析器误当作标题的代码块内注释 `# in your profile directory…`，两边对称，不影响结论。）
- **内容层面存在实际漂移**：
  1. **文档清单（Docs / 文档）条目数不一致**：EN `README.md:50-62` 共 **13** 条，ZH `README.zh-CN.md:39-46` 共 **8** 条。
     - ZH 完全缺失：`docs/today-app-notes.md`、`docs/release-checklist.md`（这两条在英文版链接集合中为 EN-only）。
     - `docs/install-notes.md`、`docs/heartbeat-recipes.md`、`examples/gate/` 在中文版其他章节（安装 / 体验三步）出现，但**不在「文档」清单**里。
     - 条目顺序也不一致（EN：gaps→install-notes→FAQ→capability…；ZH：FAQ→capability→habits→gaps）。
  2. **体验三步第 3 步指向不同文档**：
     - EN `README.md:46` → `docs/experience-guide.md` + `docs/proactivity-design.md`
     - ZH `README.zh-CN.md:35` → `docs/heartbeat-recipes.md` + `examples/gate/`
  3. **安装章节**：EN `README.md:37` 多一句 `A ready-made composition example lives at [\`muse.cordis.yml\`-style bundles](docs/install-notes.md).`，ZH 无独立对应句（在 `README.zh-CN.md:29` 以行内链接覆盖了 install-notes）。
- **建议**：以英文版为基准补齐中文版「文档」清单至同一条目集与顺序；统一体验三步第 3 步的推荐文档；安装章节对齐。

#### M2. `AGENTS.md` 路由指向缺失的 `tool-memory/README.md`
- **位置**：`AGENTS.md:17` —— 「改 `tool-muse/` 或 `tool-memory/`（模型工具）| 对应包的 README.md」
- **事实**：`tool-muse/` 有 `README.md` + `README.zh.md`；`tool-memory/` 目录下**没有任何 `.md`**（只有 `src/ lib/ tests/ package.json cordis.patch.yml tsconfig.json tsdown.config.ts`）。按该路由执行的 agent 会找不到文档。
- **建议**：为 `tool-memory` 补一份包 README；或把路由措辞改为「`tool-muse/README.md`；`tool-memory` 见 `docs/` 相关页」以免指向不存在的文件。

#### M3. 重命名后遗留的过时路径引用（`docs/evolution/trial-counting.md`）
- **事实**：commit `8d04759 evolution: evidence path must live under rounds/` 将 `docs/evolution/trial-counting.md` **R100 重命名**为 `docs/evolution/rounds/2026-10-05-trial-counting.md`。旧路径已不存在，但下列位置仍在引用旧路径：
  - `docs/evolution/rounds/2026-10-05-b01-prep.md:11`（“建立计数表模板 `docs/evolution/trial-counting.md`”）
  - `docs/evolution/rounds/2026-10-05-b01-prep.md:22`（“- `docs/evolution/trial-counting.md`（计数表）”）
  - `docs/evolution/rounds/2026-10-05-b01-waiting.md:11`（“`docs/evolution/trial-counting.md` 仍把试运行窗口起点记为…”）
- **说明**：这三处都在**历史轮次记录**中，属于时点事实。直接改成新路径会篡改历史记录，更稳妥的做法是加一行替代注记（如「（该表已移至 `rounds/2026-10-05-trial-counting.md`）」）。
- **建议**：加注记；若项目倾向「文档始终可点」，则统一改为当前真实路径。

### 🟡 Low

#### L1. `docs/f4-authorization-matrix.md` 以旧名引用计数表
- **位置**：`docs/f4-authorization-matrix.md:8`（“trial-counting E2 行”）、`:23`（“trial-counting 硬门槛行”）
- **事实**：以旧文件名缩写引用已改名文件，读者无法据此定位。建议改为新文件名或加上 `rounds/2026-10-05-trial-counting.md` 的指向。

#### L2. 根 `README.md:37` 链接标签与目标不一致
- **位置**：`README.md:37` —— `[\`muse.cordis.yml\`-style bundles](docs/install-notes.md)`
- **事实**：标签暗示 `muse.cordis.yml`，但实际文件是 `examples/muse.cordis.yml`，链接目标却是 `docs/install-notes.md`。不属断链，但易误导。建议标签与目标语义对齐。

#### L3. 历史轮次文档的修复方式提醒
- `docs/evolution/rounds/*` 是已发生事实记录。修复其中的过时路径时，优先「注明取代关系」而非改写原文，以保留追溯价值（与项目「冲突时保留旧证据并写明替代关系」的约定一致）。

---

## 分项检查结果

### 检查 1：`docs/` 全部 md 的内部链接有效性 — ✅ 通过
- `docs/` 下 37 个 markdown 文件中的 **37 个相对链接全部解析成功**，目标均真实存在（含指向 `../examples/`、`../../muse/`、`../../artifacts/`、`state.json` 等跨目录引用）。
- `docs/` 内**无 `#fragment` 锚点链接**，故不存在锚点失效问题。
- 全仓库（56 md）仅有 **2 个失效相对链接**，均在包 README 的 `.zh` 版本：H2、H3。
- 未发现 HTML `<a href>`/`<img src>`、wiki `[[...]]`、引用式链接定义等其它链接形态。

### 检查 2：`README.md` vs `README.zh-CN.md` 同步性 — ⚠️ 结构同步、内容漂移
- 6 个顶级章节 1:1 对齐（详见 M1）；链接集合对比：EN-only 链接 3 个（`README.zh-CN.md` 语言切换器 + `docs/today-app-notes.md` + `docs/release-checklist.md`），ZH-only 链接 1 个（`README.md` 语言切换器）。语言切换器差异属预期，**真实缺口是 today-app-notes 与 release-checklist 两篇在中文版完全未出现**。
- 详见 M1。

### 检查 3：是否引用已删除文件的过时引用 — ⚠️ 有 1 组真实过时引用
- **历史删除/重命名清单**（`git log --diff-filter=DR`）：
  - 重命名：`docs/evolution/trial-counting.md` → `docs/evolution/rounds/2026-10-05-trial-counting.md`（R100）→ M3/L1。
  - 删除：`examples/gate/local-config.env`、`examples/gate/local-rules.json`、`examples/gate/gate-decisions.log`、`examples/reflect/reflect-decisions.log`、`gate-decisions.log`。经核验，这些是 `.gitignore` 管理的**运行时文件**，当前磁盘上均存在，文档引用它们属预期 → **非问题**（见下）。
- **额外发现的「未入库但被引用」文件**：`examples/gate/local-rules.example.json`（示例模板，被 `.gitignore` 忽略且从未提交）→ H1。
- **额外发现的「被引用但不存在」文档**：`tool-memory/README.md`（AGENTS.md 路由引用）→ M2。

---

## ✅ 非问题（已排除的误报，供后续审计参考）

1. `local-config.env` / `local-rules.json` / `gate-decisions.log` / `reflect-decisions.log` 在 git 历史中显示为「删除」，实为 `.gitignore` 的运行时产物，磁盘存在；文档引用属预期。
2. `docs/evolution/rounds/2026-10-05-b04-status-tool.md` 中的 `lib/client.js`、`tool-muse/client.js` 是构建产物/浏览器加载路径，属时点记录，非仓库静态文件引用。
3. `docs/gaps.md:21` 的 `mcp-client/connection.ts` 指向上游 DSH 源码，非本仓库文件。
4. `demo-journal.md` 中 `muse/ideas.json` 是 `~/.dsh/muse/ideas.json` 的运行时简写（由 `examples/reflect/reflect.mjs:95`、`examples/gate/gate.mjs:178` 实际写入 `~/.dsh/muse/ideas.json`），非仓库内路径。
5. `examples/orchestrator/workers/19389c6a/docs-inventory.md` 中形如 `evolution/loop.md` 的路径以其表格声明的 `docs/` 为基准，属该报告内部相对口径。

---

## 建议处理顺序

1. **先修 3 个 High**（改动小、收益直接）：
   - H2、H3：把两个 `.zh` 包 README 的失效相对链接对齐英文版的上游 URL。
   - H1：决定 `local-rules.example.json` 入库（推荐）或改写 README 引用。
2. **同步根 README 双语**（M1）：以英文版为准补齐中文版「文档」清单、统一体验三步第 3 步指向、对齐安装章节。
3. **补 `tool-memory` README 或调整 `AGENTS.md:17` 路由措辞**（M2）。
4. **为历史轮次记录加替代注记**（M3/L1/L3），保留史实。
5. **加一道文档链接健康检查**：把本次的检查逻辑（相对路径解析 + 反引号路径解析 + git 重命名交叉核对）脚本化并纳入 `pnpm evolution:check` 或 CI，防止回归。可复现命令见下。

---

## 附录：复现与证据

```bash
cd /Users/douba/Projects/dsh-muse

# 1) 全仓相对链接校验（按所在目录解析）——输出 MISSING 行即失效链接
#    本次结果：56 md / 109 相对链接 / 2 失效（均 .zh 包 README）
# 2) docs/ 专项校验——本次结果：37/37 全部 OK
# 3) 反引号路径二次解析——本次结果：docs/evolution/trial-counting.md ×3
# 4) 重命名溯源
git log --diff-filter=DR --name-status --pretty=format: | sort -u
git log --follow --name-status -- docs/evolution/rounds/2026-10-05-trial-counting.md
# 5) 被引用文件的入库状态
git ls-files --error-unmatch examples/gate/local-rules.example.json   # 失败 => 从未入库
git log --all -- examples/gate/local-rules.example.json               # 空 => 从未入库
# 6) 双语章节/链接集合对比（Python difflib 式逐项比对，见审计脚本）
```

审计过程中生成并使用的临时脚本（`/tmp/check_links.py`、`/tmp/docs_links.py`、`/tmp/backtick.py`、`/tmp/plainpaths.py`、`/tmp/readme_cmp.py`、`/tmp/labelcheck.py`）均为只读分析，未修改仓库任何文件。

> 本报告仅为审计发现与建议；按任务要求**未做任何修改**。

NIGHT-AUDIT-COMPLETE
