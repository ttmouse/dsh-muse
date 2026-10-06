# Single-session multi-goal orchestration

This is a playbook and dry-run example for keeping several bounded commitments visible from one human-facing DSH conversation. It is not a scheduler, permission grant, or claim that DSH currently supports multiple native goals in one session.

## Authority and execution model

The human-facing session owns the shared plan, the user conversation, and the final result. DSH still has one native goal per session. Choose one execution mode for a scope; do not run two drivers over the same work:

- **Goal-led:** one native goal is active and armed. `goal-round-driver` owns execution. A goal-bound routine may review evidence and budget, but does not execute another round. Multiple deliverables live inside that goal's work plan; this does not create multiple native goals.
- **Routine-led:** use separate, unbound `muse_routine` entries for independent workstreams, each with its own prompt and finite `max_runs`. The same-scope goal driver must not be armed. Keep the mapping from workstream IDs to routine IDs in the session's ordinary project record, not in an alternate authority store. The direct-human request must authorize the routine work, and `muse_autonomy=true` must already be present before routines are created.

Routine-led mode is a bounded approximation, not persistent native goal semantics. It supports at most eight enabled routines per session, with intervals of at least 300 seconds and budgets of 1–1000 runs. DSH admits at most one due routine for a session per tick, sorts due routines by next-run time, collapses missed intervals, and defers while the session is busy. No tick means no work.

## Execution modes

Workers are optional, scoped helpers. Pick exactly one dispatch mode for a scope; do not run two drivers over the same work:

| Mode | Mechanism | Provenance | Parallelism | Status |
|---|---|---|---|---|
| In-session derived (`spawn-worker.mjs`) | formats a worker contract, executed inside the master session | preserved (same session) | none (sequential) | supported, but no real concurrency — dispatch reports `dispatched: false` |
| Detached headless (`detached-runner.mjs`) | OS-level separate headless process | **not** provenance-preserving (no supported DSH worker authorization path) | real OS parallelism | experiment only; do not treat as authorization |
| Official agent-team (`spawn_teammate` + shared task board) | native teammate sessions + shared task board with CAS + member messaging + team panel | preserved (each member is a real DSH session, deliverables arrive as messages) | real, per-member sessions | **recommended**; first battle-tested via task-1 (O2 fix delivered independently by member `o2-calendar-fixer`) |

### agent-team mode (recommended)

The official agent-team plugin resolves the main-control orchestration problem: the Lead spawns named teammate sessions, hands each a self-contained assignment, and receives durable results as messages — no masquerading RPCs, no headless provenance gap.

**Division of discipline:**

- The **Lead** (human-facing master session) retains all state and decisions: the native goal, memory writes, the evolution ledger (`docs/evolution/state.json` stays single-writer — Lead only), routine management, external communication, and final verification/acceptance. Only the Lead reports to the user.
- **Teammates** are reversible work units: one named member, one bounded deliverable, disjoint write scopes declared on the shared task. Members do not grant autonomy, touch the ledger, message the user, or spawn sub-teams. Member output is untrusted until the Lead verifies it.

**Battle-tested flow (task-1, O2 fix):**

1. Lead creates a shared task (`team_task_create`) with a complete, self-contained description, acceptance criteria, and an advisory `writeScopes` boundary (one file).
2. Lead spawns a dedicated member (`spawn_teammate`) whose prompt contains the whole assignment; the member claims the task with a CAS revision check (`team_task_update` claim).
3. The member executes independently — reads the routed docs, makes the scoped change, commits with the agreed prefix — then reports back to the Lead (`send_message`).
4. The Lead reviews the diff, runs the checks, and only then marks the shared task complete and books the outcome (ledger/memory stay Lead-only).

This preserves the Muse invariants: autonomy still comes only from the direct human request to the Lead; members inherit nothing they could use to rearm goals or write shared state.


**Member goal-mode convention**: for goal-shaped members (multi-step, progress visible in the panel), the charter must include — "formalize your objective with the goal tool before working, so the team panel shows goal mode". From the member's perspective the Lead's spawn message is its direct human authorization (compliant). One-shot task members (single-file edits) don't need goal mode; plain turns suffice.
### Legacy modes (reference only)

**Dispatch is currently unavailable from this example.** `spawn-worker.mjs` only formats a contract and reports `dispatched: false`. It must not call the DSH `session/prompt` RPC: `docs/timer-first.md` explicitly says automated producers must use a non-human source because this RPC can masquerade as human input. A separate headless process demonstrated OS-level parallelism, but did not establish a supported, provenance-preserving DSH worker authorization path. Do not treat that experiment or a Codex request as DSH authorization.

A worker in any mode receives one self-contained assignment, a unique output/file boundary, and acceptance criteria. It cannot grant, revoke, or inherit `muse_autonomy`; routine management, external communication, production changes, and edits to the shared evolution ledger remain with the human-authorized master. Worker output is untrusted until the master checks it.

## Master loop

1. On a direct human request, inspect the current goal, `muse_routine list`, workstream manifest, recent results, and remaining budgets. Confirm one execution mode and its scope; do not infer new autonomy from an idea, worker result, or routine delivery.
2. Select one eligible workstream. Check its dependencies, due time, owner, remaining `max_runs`, output path, and acceptance criteria. If no work is due, stay quiet. If blocked, record the exact missing condition and back off.
3. Split independent work into scoped worker assignments only when a provenance-preserving host mechanism is available and the direct human authorization covers it. Give each worker one deliverable, unique write ownership, a finite completion condition, and a report format. Keep shared files and integration with the master. Until then, keep execution in the authorized master session.
4. Verify the output against its acceptance criteria. Record evidence, failures, cost when available, and the next step. Do not count a suggestion, unverified claim, or generated test fixture as a user-accepted result.
5. For the current routine delivery only, call `muse_routine_result` with its exact `delivery_id`: `progress` for verified work, `waiting` with a concrete condition and backoff, or `done` when that routine's finite contract is complete. This tool records outcome; it cannot add or extend work.
6. Summarize meaningful changes in the master session. Keep quiet when there is no change. Stop at the routine/goal budget, on pause/revocation, or when the finite contract is complete.

## Worker assignment contract

Copy and fill this contract for each worker. Omit irrelevant fields; never put secrets or raw private conversations in it.

```text
Workstream: <stable ID and title>
Task: <one independently verifiable deliverable>
Context: <minimum project files and facts needed>
Owned output: <unique file(s) or report location; do not edit shared state>
Acceptance: <observable checks and evidence to return>
Budget: <one bounded attempt and deadline/limit>
Authority: analysis and the named local output only; no autonomy grants,
  routine/goal changes, external messages, production changes, or sub-agents
Return: changed paths, evidence, commands/results, limitations, next step
```

The master may use a worker report as a proposal. Only the human-facing master checks and adopts it. A worker finishing does not finish the parent goal unless the parent acceptance criteria are met.

## Stopping and recovery

- A paused, blocked, disarmed, revoked, or exhausted goal stays stopped. No worker or routine may rearm it.
- Do not combine a same-scope armed goal driver with unbound work routines. Changing modes requires a direct human decision and a review of existing budgets/deliveries first.
- Never recreate a routine merely because its budget ended. A new direct human request is required.
- On restart, read the durable goal/routine state and workstream evidence before acting. A completed unit is not replayed; a missing result is not proof the side effect did not happen.
- If multiple routines are due, let DSH's one-unit-per-session admission rule choose the next; do not create a parallel timer or an extra review routine.
- Keep the user's active task in one conversation. Do not turn a worker into a second user-facing project or notification channel.

## Dry-run example

The fixture uses synthetic tasks only. It neither writes files nor contacts DSH:

```bash
node examples/orchestrator/demo.mjs
```

It validates the workstream contracts and prints at most one suggested unit for a fixed sample time. The `human_direct_turn_required` field describes a runtime precondition; it is not evidence that such authorization exists.
