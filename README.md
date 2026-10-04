# dsh-muse

> Give your [DSH](https://github.com/deepseek-ai/dsh) agent Muse-like persistence: authorize once, and it keeps working across restarts — plus a silent heartbeat that only speaks when there is something worth saying.

[中文说明](README.zh-CN.md)

## What is this

Two DSH plugins + a set of experience recipes that replicate the core feel of [Meta Muse](https://hub-assets-cache.baai.ac.cn/view/58273): **one long-lived conversation where the agent watches, keeps going, and only speaks when it matters**.

| Piece | What it does |
|---|---|
| [`muse/`](muse/) — `@deepseek-ai/dsh-muse` | Persists your autonomy grant as a `muse/intent` session event; a keeper re-arms disarmed active goals on session resume, so long-running goals survive process restarts |
| [`tool-muse/`](tool-muse/) — `@deepseek-ai/dsh-tool-muse` | The `muse_autonomy` model tool: only a direct human request can grant or revoke autonomy; auto-continuations and subagents are always rejected |
| [`docs/`](docs/) | Mechanism analysis, proactivity design (event-driven + speak/not-speak gate), install notes, release checklist |

Security boundary inherited from `dsh-goal`: activation never auto-inherits. Manual disarm always wins; paused/blocked goals are never auto-resumed.

## Install

Requires a DSH runtime whose plugin tree includes the goal family (`dsh-goal`, `dsh-goal-round-driver`).

```bash
# in your profile directory, e.g. ~/.dsh/profiles/web
dsh plugin --profile web add <published-package-or-git-url>   # both packages
```

Developing from a clone (verified on a fresh `git clone`):

```bash
pnpm install && pnpm build && pnpm -r test   # 24 tests
```

Then add both bundles to your profile's `dsh.profile.bundles` list, after the goal family. Packages carry their own `dsh.bundle.patch` metadata, so the plugin panel recognizes them as profile-level plugins. If your runtime version differs from the peer range, grant a per-profile compatibility exemption (`compatibility.json`).

A ready-made composition example lives at [`muse.cordis.yml`-style bundles](docs/install-notes.md).

## Experience it

1. **Continuous pursuit** — in a new session:
   > Create a long-term goal: `<your task>`. I'm leaving — keep going autonomously, don't ask me, until it's done.

   Watch it call `create_goal`, then `muse_autonomy { autonomy: true }`, then run goal rounds back to back.
2. **Survives restarts** — stop the runtime, start it again, reopen the session, say "continue". The keeper re-arms the goal from the persisted grant; no re-authorization needed.
3. **Silent heartbeat** — schedule a recurring check with "check but don't speak unless there's something worth saying" semantics. See [docs/experience-guide.md](docs/experience-guide.md) and [docs/proactivity-design.md](docs/proactivity-design.md).

## Docs

- [docs/goals.md](docs/goals.md) — Muse ↔ DSH mechanism mapping, with evidence
- [docs/experience-guide.md](docs/experience-guide.md) — how to feel each capability
- [docs/proactivity-design.md](docs/proactivity-design.md) — proactive trigger design (event-driven, wake ≠ interrupt)
- [docs/gaps.md](docs/gaps.md) — what's implemented vs. what Muse has that we don't (event ingress, memory seam, external notify)
- [docs/install-notes.md](docs/install-notes.md) — cross-version install gotchas (metadata, exemptions, hot-mount)
- [docs/FAQ.md](docs/FAQ.md) — common errors and fixes
- [examples/gate/](examples/gate/) — out-of-conversation proactive gate: zero-trace checks, inject only when it matters
- [docs/heartbeat-recipes.md](docs/heartbeat-recipes.md) — copy-paste silent-heartbeat / proactive-report recipes
- [docs/release-checklist.md](docs/release-checklist.md) — what "GitHub-ready" means here

## Status

Core loop is implemented and tested (22/22 tests, 100% coverage on both packages, end-to-end restart verification with real AgentLoop + JSONL persistence). Known limitations are documented in [docs/gaps.md](docs/gaps.md) — notably: proactive triggers are time/heartbeat-based today; event-source ingress (webhook/file-watch → wake) is the next milestone.

## License

MIT
