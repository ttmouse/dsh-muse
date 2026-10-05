# 夜班双语质量审校报告 — dsh-muse

- **审校时间**：2026-10-06 02:20 (+08:00)
- **审校对象**：`/Users/douba/Projects/dsh-muse`，工作树 HEAD = `0bbfd16 docs: journal`（`git status` 仅有 `reflect-decisions.log` 这一非文档改动）
- **审校范围**：根 `README.md` ↔ `README.zh-CN.md` 的章节/内容一致性；`muse/README.zh.md`、`tool-muse/README.zh.md` 的翻译质量（术语一致、无死链、无过时引用）
- **审校方式**：只读。逐节对照中英两侧；用 `git log/show` 追溯两侧最后一次内容变更；对反引号里的路径/事件名/配置键回到源码（`muse/src/*.ts`、`tool-muse/src/*.ts`）与 `docs/timer-first.md` 核对；用 `git hash-object` 校验 `README.i18n.yaml` 记录；解析全部 markdown 相对链接并校验存在性；用 `curl` 探测外链 HTTP 状态
- **结论**：两份包中文 README **均停留在英文版上一轮重写之前**（commit `b801150`），仍在描述已被淘汰的 `muse/intent` 事件模型和 `defaultAutonomy` 回退语义，与源码及英文版直接矛盾；双语一致性记录本身也已失效且维护工具不存在。根 README 对章节结构 1:1 对齐，但内容有 4 处实质漂移。相对链接全部有效，无仓库内死链。

## 严重度定义

| 级别 | 含义 |
|---|---|
| 🔴 High | 与源码/英文版直接矛盾的过时描述，涉及自治授权这一安全语义；或使上述漂移无法被发现的机制失效 |
| 🟠 Medium | 章节内容不同步、信息缺失、文档与自身治理声明矛盾、外链失效 |
| 🟡 Low | 术语漂移、生硬直译、双语标签残留等可读性/一致性问题 |

---

## 结论摘要

| # | 级别 | 问题 | 位置 |
|---|---|---|---|
| H1 | 🔴 | `muse/README.zh.md` 整篇落后一轮重写：`muse/intent` 事件模型 + `defaultAutonomy` 回退语义，与源码矛盾 | `muse/README.zh.md:5,7,30-40,44,54` |
| H2 | 🔴 | `tool-muse/README.zh.md` 同源落后：授权文件被写成 `muse/intent` 事件，且缺结果枚举、文档链接、Ideas 段落 | `tool-muse/README.zh.md:5,19,46` |
| H3 | 🔴 | 双语一致性记录（`README.i18n.yaml`）哈希全部过期；其引用的 `docs/i18n/README.md` 与 `verify-translation-pairing` 脚本均不存在 | `muse/README.i18n.yaml`、`tool-muse/README.i18n.yaml` |
| M1 | 🟠 | 根 README 文档清单：EN 13 条 vs ZH 11 条，缺 `examples/gate/`、`docs/release-checklist.md`，顺序不同 | `README.md:50-62` / `README.zh-CN.md:39-49` |
| M2 | 🟠 | 根 README 安装章节：ZH 缺 clone 构建命令与 composition example 段落 | `README.md:29-37` |
| M3 | 🟠 | 根 README「体验」第 3 步两语指向不同文档 | `README.md:46` / `README.zh-CN.md:35` |
| M4 | 🟠 | 根 README 对 `capability-checklist` 的描述过时，且与该文档自身治理声明矛盾 | `README.zh-CN.md:44` |
| M5 | 🟠 | 根 README 顶部 DSH 链接 404（两语共用） | `README.md:3` / `README.zh-CN.md:3` |
| L1 | 🟡 | 核心术语漂移：自治授权 / 自治决策 / 常设自治 / 常设的人类授权 | 两包 zh README |
| L2 | 🟡 | 生硬直译：「响亮拒绝」「确切 live agent」「quiescence 即退出」 | `muse/README.zh.md`、`tool-muse/README.zh.md` |
| L3 | 🟡 | 根 ZH README 页脚整句仍是英文（与英文版逐字相同） | `README.zh-CN.md:59` |
| L4 | 🟡 | 「both packages / 两个包都装」与表格中的三个插件不符（两语共用） | `README.md:26` / `README.zh-CN.md:26` |
| L5 | 🟡 | 文档写触发事件 `agent/session-start`，源码监听的是 `agent/created`（两语共用） | `muse/README.md:41` / `muse/README.zh.md:44` |

---

## 问题详情（按重要性排序）

### 🔴 H1. `muse/README.zh.md` 整篇落后于英文版一轮重写

- **位置**：`muse/README.zh.md`
- **事实**：commit `b801150`（2026-10-05）把 `muse/README.md` 从「`muse/intent` 会话事件 + `defaultAutonomy` 回退」重写为「绑定人类消息的 owner-only 授权文件 + routine 配置」，但**同一次提交没有改 `muse/README.zh.md`**。中文版此后只在 `0bb55d6` 改过一个外链，正文始终停留在旧模型。于是中文版在 5 处与英文版和源码矛盾：

| 位置 | 英文版（现状） | 中文版（现状） | 源码事实 |
|---|---|---|---|
| 开头导语 | `:5` "Muse autonomy keeper **plus bounded, human-authorized timer routines**… See [timer-first guide](../docs/timer-first.md)." | `:5` 只讲「自治决策 + 重新武装」，无 routine、无链接 | 插件确实带 `MuseRoutines`（`muse/src/index.ts:45`） |
| 授权载体 | `:7` "a **human-message-bound authorization file** records…" | `:7` "会话日志中携带一条持久的 **`muse/intent` 记录**" | 新授权写 owner-only 文件 `museHome()/intents/<hash>.json`（`muse/src/intent-store.ts:11-39`）；`muse/intent` 事件只是 legacy 回退 |
| Config 表 | `:30-33` 两行：`defaultAutonomy`=**Deprecated and ignored**、`routinePollSeconds`=60 | `:30-32` 一行：`defaultAutonomy` 描述为「应用于没有显式 `muse/intent` 决策的会话的自治值」 | `defaultAutonomy` 声明为 deprecated 且从不被读取（`muse/src/index.ts:25-37,53-55`）；`routinePollSeconds` 是真实配置键（`:36`） |
| 章节结构 | `:35 ## Durable authorization`（正文） | `:34-40 ## 会话事件`（整张事件表 + `museIntentChange` 写入示例）——英文版已无此节 | 事件表描述的 `muse/intent` 「最新事件是唯一权威」已被文件 + legacy fold 取代 |
| Behavior 开头 | `:41` "the latest **verified authorization; configuration is never a fallback grant**" | `:44` "取最新的 `muse/intent` 事件，**回退到 `defaultAutonomy`**" | 代码显式注释 "Deployment configuration never substitutes for a direct human grant"（`index.ts:53`），中文版与安全不变量直接冲突 |
| Model Experience | `:51` "its **persistent authorization file**" | `:54` "其 **`muse/intent` 会话事件**" | 同 `intent-store.ts` |

- **证据**：`git show b801150 -- muse/README.md`（英文重写全貌）；`git log --format='%h %ad %s' --date=short -- muse/README.md muse/README.zh.md`（英文最后内容变更 `b801150`，中文最后变更 `0bb55d6` 仅为链接替换）；`muse/src/index.ts`、`muse/src/intent-store.ts`、`muse/src/domain.ts`；`docs/timer-first.md:46-48` 已用「新自治授权保存在 `$DSH_HOME/muse/intents/` 的 owner-only 文件」的表述，可作为中文定稿口径。
- **建议**：以当前英文版为准重译 `muse/README.zh.md`：删除「会话事件」整节，改为「持久授权」；Config 表补 `routinePollSeconds` 并把 `defaultAutonomy` 标为「已弃用、被忽略」；Behavior 改为「取最新可验证授权，配置永不作为回退授予」；开头补 routine 与 `docs/timer-first.md` 链接；Model Experience 的载体措辞改为授权文件。修完后按新哈希重记 `README.i18n.yaml`。

### 🔴 H2. `tool-muse/README.zh.md` 同源落后，且缺失信息

- **位置**：`tool-muse/README.zh.md`
- **事实**：同一个 `b801150` 把 `tool-muse/README.md` 的授权载体改为「owner-only durable authorization file」，并新增 `## Timer tools` 段落。中文版把 `Timer tools` 译了出来（`## 定时与状态工具`），但授权载体仍写 `muse/intent`，且漏译两处关键信息：
  1. `:5` 「记录会话的持久自治决策（**`muse/intent`**）」vs 英文 `:5`「records a **human-message-bound durable autonomy decision**」。
  2. `:19` 「记录一条持久 **`muse/intent` 事件**」vs 英文 `:19`「Records one **owner-only durable authorization file** bound to the current human message」。
  3. `:46` 漏掉结果枚举与文档链接：英文 `:46` 为 "records the current timed unit outcome (**`progress`, `waiting`, `done`**) and next step … See [usage and boundaries](../docs/timer-first.md)."，中文只写「记录当前投递的工作结果与下一步」。
  4. **整段缺失**：英文 `:50` "Ideas are delivered with `source.kind=muse` and `trigger=idea`; tool calls on an idea-only turn are denied before execution." 中文版完全没有对应内容——这是 idea 只提议不执行、且 idea turn 禁止调用工具这一不变量在包 README 的唯一说明。
- **证据**：`git show b801150 -- tool-muse/README.md`；`git log --format='%h %ad %s' --date=short -- tool-muse/README.md tool-muse/README.zh.md`；`docs/timer-first.md:31`（`progress`/`waiting`/`done`）与 `:50`（`source.kind=muse` + idea turn 硬性拒绝）可作中文口径。
- **建议**：按当前英文版逐段补齐：授权载体改为 owner-only 授权文件；`muse_routine_result` 补上 `progress/waiting/done` 枚举并补 `../docs/timer-first.md` 链接；新译 Ideas 段。修完重记 i18n 哈希。

### 🔴 H3. 双语一致性记录失效，且其维护工具与文档不存在

- **位置**：`muse/README.i18n.yaml`、`tool-muse/README.i18n.yaml`
- **事实**：两个记录文件声称保存「最后一次确认一致状态」的 git blob 哈希，但**记录的哈希与当前文件全部不符**，即两侧都已在记录之后被改动，记录给出的「一致」是假信号：

| 文件 | 记录哈希 | 当前 `git hash-object` | 一致？ |
|---|---|---|---|
| `muse/README.md` | `601050fb…` | `e6ab766a…` | ❌ |
| `muse/README.zh.md` | `aba0d755…` | `24fb1f7c…` | ❌ |
| `tool-muse/README.md` | `695c6428…` | `9a8f6245…` | ❌ |
| `tool-muse/README.zh.md` | `40664b98…` | `232f7001…` | ❌ |

  记录注释里的维护方式也已失效：`# Bilingual-pair consistency record (docs/i18n/README.md)` 指向的 `docs/i18n/README.md` **不存在**（仓库无 `docs/i18n/` 目录）；`pnpm run verify-translation-pairing --write …` 命令在 `package.json` 的 scripts 中**不存在**（已确认 `package.json` 无该脚本，仓库内也无同名脚本文件）。
- **证据**：`git hash-object` 输出；`ls docs/i18n` 报 `No such file or directory`；`grep verify-translation-pairing package.json` 无结果；仓库内仅有 `muse/README.i18n.yaml`、`tool-muse/README.i18n.yaml` 两个记录文件，根 README 对没有任何记录。
- **建议**：二选一——(a) 恢复机制：补 `docs/i18n/README.md` 与 `verify-translation-pairing` 脚本（或 CI 检查），让哈希校验真正能拦住漂移，并把根 `README.md ↔ README.zh-CN.md` 也纳入记录；(b) 若决定不再维护，删除这两个 `.i18n.yaml` 及注释中的失效引用，避免它们继续发出「已一致」的误导信号。无论哪种，都应在修完 H1/H2 后重记哈希。

### 🟠 M1. 根 README 文档清单条目不一致（13 vs 11）

- **位置**：`README.md:50-62`（13 条） vs `README.zh-CN.md:39-49`（11 条）
- **事实**：
  - 中文版**完全缺失**两条英文版条目：`examples/gate/`（`:60`）与 `docs/release-checklist.md`（`:62`）。
  - 两侧条目集合与顺序都不同：英文顺序为 evolution→goals→experience-guide→proactivity-design→gaps→install-notes→FAQ→capability-checklist→today-app-notes→habits→gate→heartbeat-recipes→release-checklist；中文顺序为 evolution→goals→experience-guide→proactivity-design→FAQ→capability-checklist→habits→today-app-notes→heartbeat-recipes→install-notes→gaps。
  - `examples/gate/` 在中文版正文的「体验三步」第 3 步出现过（`:35`），但不在「文档」清单里，读者按清单索引会漏掉闸门文档。
- **建议**：以英文清单为基准补齐中文版（新增 `examples/gate/`、`docs/release-checklist.md`），并对齐顺序，使两语 13 条一一对应。

### 🟠 M2. 根 README 安装章节内容缺口

- **位置**：`README.md:29-37` vs `README.zh-CN.md:20-29`
- **事实**：英文版比中文版多两块内容：
  1. `README.md:29-33`：从 clone 开发/验证的命令块 "Developing from a clone (verified on a fresh `git clone`): `pnpm install && pnpm build && pnpm -r test && pnpm test:timers`"。中文版只有 `dsh plugin … add` 一段，缺这一验证路径。
  2. `README.md:37`：composition example 段 "A ready-made composition example lives at [`examples/muse.cordis.yml`](examples/muse.cordis.yml) and install notes in `docs/install-notes.md`."。中文版无对应句；`install-notes` 链接虽在 `:29` 出现，但 `examples/muse.cordis.yml` 这个现成组合示例在中文侧完全没提。
- **建议**：中文版补 clone 构建命令块，并在安装章节末尾补 composition example 一句、加入 `examples/muse.cordis.yml` 链接。

### 🟠 M3. 根 README「体验」第 3 步两语指向不同文档

- **位置**：`README.md:46` vs `README.zh-CN.md:35`
- **事实**：
  - 英文：`3. Silent heartbeat — … See [docs/experience-guide.md](docs/experience-guide.md) and [docs/proactivity-design.md](docs/proactivity-design.md).`
  - 中文：`3. 静默心跳：按 [docs/heartbeat-recipes.md](docs/heartbeat-recipes.md) 配置…；或用 [examples/gate/](examples/gate/) 的对话外闸门…`
  两语推荐的是不同文档集合（英文 = 体验指南 + 主动设计；中文 = 心跳配方 + 闸门）。虽然都可达，但同一「第 3 步」在两语给读者的下一步不同。
- **建议**：统一推荐文档。若想同时覆盖配方与闸门，应在两语中列同一组（例如英文也补 heartbeat-recipes/gate，或中文也补 experience-guide/proactivity-design）。

### 🟠 M4. `capability-checklist` 描述过时，且与文档自身治理声明矛盾

- **位置**：`README.zh-CN.md:44`
- **事实**：中文写「**27 项** Muse 能力对标清单（**每日自动校准**）」。但：
  - 该文档标题已改为「Muse 能力清单（**历史盘点**）」，开头治理声明明确「本页保留早期功能记录，**不再作为"100% 对标"验收或实时状态**……以前记录的**每日 9:30 调度本轮未核验**，不视为仍运行」（`docs/capability-checklist.md:1-3`）。
  - 实际条目数为 **26**（A1-A3/B1-B3/C1-C5/D1-D5/E1-E4/F1-F6）；文档末尾「当时统计」写的是 `14+6+7=27`（`:63`），本身与条目数也不一致。
  - 英文版 `README.md:57` 已改为中性表述 "historical Muse capability inventory; current priorities and evidence live in the evolution ledger"。
- **建议**：中文版 `:44` 改为与英文一致的「历史能力盘点；当前优先级与证据见演进账本」，删去「27 项」「每日自动校准」两个已失效断言。

### 🟠 M5. 根 README 顶部 DSH 链接 404（两语共用）

- **位置**：`README.md:3`、`README.zh-CN.md:3` → `https://github.com/deepseek-ai/dsh`
- **事实**：`curl` 返回 **404**；同组织下的 `https://github.com/deepseek-ai/deepseek-harness` 返回 200。链接目标疑似应为后者，或该仓库已改名/私有。两语共用同一失效 URL。
- **另注**：`https://introducing.muse.ai/`（两语 `:3`/`:9`）在本机 `curl` 与 `web_fetch` 均连接超时（`000`/`fetch failed`），无法判定为真死链还是本机网络限制，**建议另行在有外网的环境复核，暂不按死链处理**。
- **建议**：确认 DSH 的正确公开地址并两语同步替换；`introducing.muse.ai` 择机复核。

### 🟡 L1. 核心术语漂移

- **事实**：同一概念在中文侧有四种译法——「自治授权」（`docs/timer-first.md:46`，权威口径）、「自治决策」（`muse/README.zh.md:5`）、「常设自治」（`tool-muse/README.zh.md:21,46`）、「常设的人类授权」（`muse/README.zh.md:7`）。英文侧对应 standing/durable autonomy decision / standing human authorization，也非单一词，但中文侧更易混。
- **建议**：以 `docs/timer-first.md` 为准，统一为「自治授权（standing autonomy）」，授权动作统一为「授予/撤销自治授权」。

### 🟡 L2. 生硬直译

- **事实**：
  - `tool-muse/README.zh.md:21`「会被**响亮拒绝**」——英文 "rejected loud" 的直译；中文建议「会被明确拒绝/直接拒绝」。
  - `tool-muse/README.zh.md:21`「确切 **live agent**」「运行时根 agent」中英夹用；建议「确切的活跃（live）agent」或全中文表述。
  - `muse/README.zh.md:69`「一次性宿主在首个 **quiescence** 即退出」——建议「首个静默点」。
- **建议**：按中文技术写作习惯润色，保留英文专有名词时用括号标注而非裸嵌。

### 🟡 L3. 根 ZH README 页脚未翻译

- **位置**：`README.zh-CN.md:59`
- **事实**：页脚整句与英文版 `README.md:72` **逐字相同**："[Timer-first progress loop / 定时推进闭环](docs/timer-first.md) — same-session routines, waiting/completion state, native cold wake, non-human mailbox delivery and proposal-only reflection." 链接标签是中英双语，但破折号后整段描述仍是英文。
- **建议**：中文版把破折号后的描述译成中文（保留 `Timer-first progress loop / 定时推进闭环` 标签即可）。

### 🟡 L4. 「两个包」与三个插件不符（两语共用）

- **位置**：`README.md:26`「`# both packages`」、`README.zh-CN.md:26`「`# 两个包都装`」，另见 `README.md:35`「add both bundles」
- **事实**：同页表格列出 **3** 个插件（`muse/`、`tool-muse/`、`tool-memory/`），三者也各自有 `dsh.bundle.patch`（`muse/cordis.patch.yml`、`tool-muse/cordis.patch.yml`、`tool-memory/cordis.patch.yml`）。「both/两个」应为「三个/all three」。两语一致地写错，属共享内容问题而非翻译分歧。
- **建议**：两语同步改为「三个包/all three bundles」。

### 🟡 L5. 触发事件名与源码不一致（两语共用）

- **位置**：`muse/README.md:41`、`muse/README.zh.md:44`（均写 `agent/session-start`）
- **事实**：源码实际监听的是 `ctx.on('agent/created', …)`（`muse/src/index.ts:69`），仓库内 grep 不到 `agent/session-start`。这是英文缩写再被中文照译的共享过时引用。
- **建议**：两语同步核对——若 `agent/created` 是现行事件，改为 `agent/created`；若 `agent/session-start` 是宿主层概念，需在文中说明其与 `agent/created` 的关系，避免读者按错误事件名查源码。

---

## 已验证为非问题（排除误报）

- **相对 markdown 链接无死链**：对 `README.md`、`README.zh-CN.md`、`muse/README.md`、`muse/README.zh.md`、`tool-muse/README.md`、`tool-muse/README.zh.md` 解析全部内联链接并按所在目录解析相对路径，**6 个文件的所有相对链接目标均存在**。此前夜班审计报出的 `muse/README.zh.md:7`、`tool-muse/README.zh.md:29` 相对链接失效，已由 `0bb55d6` 改为上游 URL 修复。
- **上游外链有效**：`https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/goal/goal-round-driver` 与 `…/blob/master/docs/tool-catalog.md` 均返回 200。
- **包 README 章节结构本身对齐**：`muse` 与 `tool-muse` 的 `##` 章节除 H1 所述「会话事件 / Durable authorization」差异外，其余标题层级一一对应；`tool-muse` 两侧章节结构完全一致（仅内容缺口见 H2）。
- **根 README 章节结构对齐**：6 个 `##` 章节顺序 1:1 映射（What is this/这是什么、Install/安装、Experience it/体验三步、Docs/文档、Status/状态、License/许可），结构层面无语义错位。

## 建议修复顺序

1. **H3 → H1/H2**：先确认或废弃 i18n 记录机制，再据当前英文版重译两份包中文 README（同一批改动，改完立即重记哈希）。H1 涉及自治授权的安全语义，优先级最高。
2. **M1-M4**：一次提交对齐根 README 的文档清单、安装章节、体验第 3 步和 checklist 描述。
3. **M5**：确认 DSH 正确链接后两语同步替换；`introducing.muse.ai` 择机在有外网环境复核。
4. **L1-L5**：术语表统一 + 直译润色 + 页脚翻译 + 「三个包」订正 + 事件名核对，作为同批文档清理的收尾。

NIGHT-BILINGUAL-COMPLETE
