# 安装踩坑记录（桌面端 / 网页端）

把仓库版 muse（0.1.0-rc.7）装进打包 app（0.2.0-rc.2 运行时）的完整排障过程，供以后跨版本安装参考。

## 结论：跨版本安装需要过四道门

1. **`dsh.bundle` 元数据**：包必须自带 `dsh.bundle.patch` 元数据（cordis.patch.yml 插入自己的组合行），否则插件面板归类为「普通依赖，未生效」。手写 profile patch 行不是正规路径。
2. **列入 `dsh.profile.bundles`**：加到 profile 的 bundles 列表末尾（基础 bundle 之后，保证 goal 家族先加载）。
3. **兼容性豁免（逐 profile）**：peer 版本不匹配时插件「保持安装、启动拒绝加载」，需 `compatibility.json` 显式豁免。**豁免按 profile 隔离**——desktop 报错时先查 desktop 的豁免文件是否存在，web 授过不算数。
4. **patch 纯净性**：bundle patch 含注释/配置/表达式时，面板提示「热挂载仅支持纯 insert，重启后生效」。这是常驻的机制说明，不随加载成功消失；判断生效与否的唯一标准是**新会话的工具列表**里有没有 `muse_autonomy`。

## 环境差异

| | 网页端 | 桌面端 |
|---|---|---|
| 宿主 | `dsh web` CLI 服务 | Electron 打包 app（独立发行版） |
| 运行时 | 与 muse 同版本线，天然匹配 | 0.2.0-rc.2，跨版本 → 需豁免 |
| profile 管理 | `dsh plugin` CLI | **Electron 独占**（CLI `dsh plugin --profile desktop` 直接报错） |

注意：web 是出厂模板 profile，当 bundles 列表与「安装所拥有的组合」一致时，CLI 会把 manifest 改写回出厂模板（normalizeShippedProfile），手动条目可能被抹掉。

## 已知的连带风险

- 旧版本写入过必需 `muse/intent` 事件的会话，可能被宿主持久化格式守卫拒绝（unknown event type），即使安装插件也不能保证加载。新版工具改用绑定人类输入的授权 sidecar，不再写入这些事件。旧日志不得自动改写；迁移需要先备份并单独确认丢失授权记录的范围。
- pnpm 装 git 依赖不跑 `prepack` 脚本：依赖 prepack 生成文件的插件（如 openviking memory-plugin 的 `shared/`）装出来是残缺的，会让整个 `dsh web` 启动崩溃。修复：手动跑 sync 脚本补文件，或钉住能完整构建的版本。
- peer 版本长期方案：给 muse 的 peer 声明加 `|| 0.2.0-rc.2`，免豁免——但需先完整回归再宣称兼容。

## 干净 profile 走查记录（2026-10-05）

- `dsh --profile muse-scratch --from-default-profile web` 创建模板 profile
- `dsh plugin --profile muse-scratch add <包路径>` 装两个包即完成——**web 模板自带 goal 家族**，无需手动加 goal 组合行
- 包自带 `dsh.bundle.patch` 元数据自动插入组合（dump-config 验证 muse/tool-muse 在组合树中）；这只证明配置存在，不能替代启动及工具列表验证
- 坑：不要手动往 patch 里再写一遍 insert，会与包元数据重复
