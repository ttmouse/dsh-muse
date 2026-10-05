# @deepseek-ai/dsh-tool-muse

English | [中文](README.zh.md)

Model-facing `muse_autonomy` tool: records a human-message-bound durable autonomy decision under direct-human authority. This is the intent producer for [`dsh-muse`](../muse/README.md); the keeper consumes the decision and re-arms goal continuation across restarts.

## Composition

```yaml
- id: muse
  name: '@deepseek-ai/dsh-muse'

- id: tool-muse
  name: '@deepseek-ai/dsh-tool-muse'
```

## Tool: `muse_autonomy`

Records one owner-only durable authorization file bound to the current human message with the requested `autonomy` boolean and returns `{ autonomy }`. Latest-wins: recording again replaces the standing decision.

Authority mirrors `dsh-tool-goal`'s discipline: the call must come from the exact live calling agent inside its active driver, on a runtime root, with a host-attested direct human message in the current turn. Automatic continuations, subagents, and plugin sources are rejected loud — only the human grants or revokes standing autonomy.

## Model Experience

### Request context and condition

#### What the model sees

`muse_autonomy`'s tool schema and description, per the generated [tool catalog](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-catalog.md); this page records no delta. The tool result is the compact JSON `{"autonomy":boolean}`.

#### Token effect

Fixed, conditional: the tool schema and description are present whenever the plugin is composed; each call adds one compact result to the turn.

#### KV Cache effect

Append-only: tool schemas are part of the stable prompt prefix; each call's result extends the current turn's history without replacing earlier content.

## Known Limitations and Deferred Work

- **No human command** — a human-facing `/muse` command that records the same decision without a model round-trip is deferred; the tool path already requires the human to speak through the model turn.
- **No per-goal scoping** — the decision is session-wide; a per-goal autonomy surface would need a different durable record and is deferred.

## Timer tools

`muse_routine` creates/lists/pauses/resumes bounded work in the current session. Management requires the same direct-human authority; creating also requires standing autonomy. `muse_routine_result` records the current timed unit outcome (`progress`, `waiting`, `done`) and next step. It cannot grant work or extend budgets. See [usage and boundaries](../docs/timer-first.md).

`muse_status` is a read-only snapshot of the current session's goal phase, activation, remaining rounds, blocked reason, and routine state/budget/next run/result. Its persisted result is formatted as a short Chinese status block for the generic Web Client tool card; the structured value remains available to tool consumers. It does not expose routine prompts or read another session. Live DSH interaction and user acceptance remain unverified.

Ideas are delivered with `source.kind=muse` and `trigger=idea`; tool calls on an idea-only turn are denied before execution.
