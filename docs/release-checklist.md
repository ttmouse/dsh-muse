# 发布清单（GitHub-ready 验收标准）

本文件是目标的验收依据。全部勾选 = 可以发布。

## 1. README 对外部用户自解释

- [x] 是什么 / 怎么装 / 怎么体验，三段齐全（README.md 已重写为外部视角）
- [x] 英文为主，中文版 README.zh-CN.md 跟上
- [ ] 截图或 asciinema 演示（可选，加分项）

## 2. 可复制的安装路径

- [x] 两个包元数据可发布：scope 名、repository 指向 github.com/ttmouse/dsh-muse、MIT、files 白名单、exports
- [ ] npm 发布（`npm publish` 走通），或 README 写清 git URL 直装方式
- [ ] 安装文档不依赖本机私有路径（已审计：源码与文档无 /Users/douba 泄漏；.npmrc/lockfile 再查一遍）
- [ ] peer 版本范围覆盖当前稳定 DSH 运行时；文档说明版本不匹配时的豁免方法

## 3. 核心演示可复现

- [x] muse 插件组合示例（从 deepseek-harness 仓库 examples/ 迁入或链接）
- [ ] 静默心跳/主动汇报：提供可直接 import 的 schedule 配置示例（当前只在本机调度器上）
- [ ] 对话外闸门脚本（ingress v0）作为 examples/gate/ 发布，附 launchd/cron 模板

## 4. 文档完整

- [x] 机制说明（goals.md）、主动触发设计（proactivity-design.md）、缺口清单（gaps.md）、安装踩坑（install-notes.md）、体验指南（experience-guide.md）
- [ ] FAQ：常见报错（unknown event type、豁免、热挂载提示）集中一页
- [ ] 已知限制与安全边界在 README 显著位置

## 5. 脱敏

- [x] 无 /Users/douba 绝对路径（README/docs/包源码已查）
- [ ] git 历史检查（首个提交前是否有敏感内容；仓库尚未推远端，风险低）
- [ ] docs/install-notes.md 里的本机排障叙事改为通用化表述或移入 docs/internal/

## 6. 外部视角走查

- [x] 按 README 从零在干净 profile 装一遍（已验证：muse-scratch profile 从仓库路径安装两包，组合树含 goal 全家 + muse/tool-muse；发现 web 模板自带 goal 家族，外部用户只需装两个包）
- [x] 体验路径全部在开发环境实测（持续推进/重启恢复由包测试端到端覆盖；静默心跳双分支、gate 注入真实跑通）；干净环境的亲身体验留给用户首装时完成

## 附带工作项

- [x] 对话外闸门 ingress v0：确定性预检 + 签名 cookie 注入主线（`examples/gate/`，端到端实测含真实注入）
- [ ] 事件源 ingress（webhook/file-watch → 唤醒）——gate.mjs 的规则层即挂载点
