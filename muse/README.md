# @deepseek-ai/dsh-muse

English | [中文](README.zh.md)

Muse autonomy keeper: a durable autonomy decision for one session plus automatic re-arming of its goal continuation across restarts and resumes.

Mounting this plugin changes the goal subsystem's deliberate default — activation is never inherited across a process boundary ([goal-round-driver](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/goal/goal-round-driver)). With Muse, the session carries a durable `muse/intent` record saying the human wants continuous proactive advancement; the plugin treats that record as the standing human authorization and re-arms the current active goal when the session comes back live. The plugin owns no driver of its own: `dsh-goal-round-driver` keeps advancing an armed goal exactly as before.

## Composition

```yaml
- id: goal
  name: '@deepseek-ai/dsh-goal'

- id: goal-round-driver
  name: '@deepseek-ai/dsh-goal-round-driver'

- id: muse
  name: '@deepseek-ai/dsh-muse'
```

The plugin must compose after `goal`; the keeper observes only durable phase and process-local activation through `ctx.goals`, never listener order.

Goals whose round budget is exhausted stay disarmed; autonomy never increases that budget.

The bundle inserts its own Loader entry. Source-linked installations read session events through `snapshotEvents()` on installed hosts that expose it, or the `events` getter in this source checkout. The keeper, tool, and invariant share `museSessionEvents`; it preserves the complete immutable log without granting autonomy by default.

## Config

| Key | Default | Meaning |
|---|---|---|
| `defaultAutonomy` | `false` | Autonomy applied to sessions whose log records no explicit `muse/intent` decision. Mounting the plugin alone never grants standing autonomy. |

## Session events

| Event | Payload | Meaning |
|---|---|---|
| `muse/intent` | `{ kind, version, autonomy, updatedAt }` | One durable autonomy decision. The latest event in the log is the only authority; earlier intents are history. Absence of any intent event means the session never expressed autonomy. |

The plugin reads the intent but ships no producer in v1: tools and commands that append `muse/intent` are deferred (see limitations). Writers use `agent.session.append('muse/intent', museIntentChange(autonomy, Date.now()))`.

## Behavior

The keeper resolves autonomy once per live-agent epoch: the latest `muse/intent` event, falling back to `defaultAutonomy`. Two triggers cover both epoch shapes. `agent/session-start` covers resume epochs — including ones whose queue stays empty and never emit an idle transition — with the re-arm deferred past the goal service's synchronous session-start disarm. The first `idle` observation covers epochs where autonomy arrives mid-session through `muse_autonomy` while the current goal sits disarmed. When autonomy holds and the current goal is durable-`active` but process-disarmed, the keeper calls `ctx.goals.resume` with the goal's exact CAS ref; `goal-round-driver` observes the resulting `goal/changed` and continues rounds. Goals in `paused`, `blocked`, or `complete` phases are left untouched; resuming them is a product decision the keeper does not make unilaterally.

Restart evidence lives in `tests/restart.spec.ts`: the real AgentLoop, goal family, and JSONL persistence run round one under a recorded intent, the whole context dies, a fresh runtime resumes the session, and round two runs — while a session without autonomy stays disarmed.

## Model Experience

### Request context and condition

#### What the model sees

Nothing. The autonomy decision, its `muse/intent` session event, and the re-arming call are never model-visible; re-arming surfaces only as `dsh-goal-round-driver`'s ordinary `<goal_round>` prompts, which that package documents.

#### Token effect

Zero direct token effect. Indirectly, through `dsh-goal-round-driver`: a resumed epoch continues appending the driver's round prompts, one fixed instruction block per admitted round, exactly as an uninterrupted session would.

#### KV Cache effect

No direct effect. Re-arming produces the same append-only round prompts the driver already owns; this package's session event never enters derived history, so the existing reusable prefix is preserved.

## Known Limitations and Deferred Work

- **No human-side command** — the model-facing `muse_autonomy` tool ([`dsh-tool-muse`](../tool-muse/README.md)) is the only shipped producer; a `/muse` command that records the decision without a model round-trip is deferred.
- **Active-phase re-arming only** — paused and blocked goals never auto-resume; a re-engagement policy (when a blocked goal should be reconsidered and how often) is deferred rather than guessed.
- **No repetition bound** — a resumed epoch re-arms once per live-agent epoch; a long-lived process with an exhausted round cap keeps its goal disarmed, by the driver's own `round-limit` policy.
- **One-shot hosts exit at first quiescence** — the headless one-shot app does not wait for the round driver's deferred continuation, so autonomous rounds beyond the initial task need a persistent host (the web GUI). The keeper's durable intent is exactly what such a host resumes; `tests/restart.spec.ts` proves the resume path.
