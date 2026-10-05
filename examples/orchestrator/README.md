# Single-session multi-goal orchestration

This is a playbook and dry-run example for keeping several bounded commitments visible from one human-facing DSH conversation. It is not a scheduler, permission grant, or claim that DSH currently supports multiple native goals in one session.

## Authority and execution model

The human-facing master session owns the shared plan, the user conversation, and the final result. DSH still has one native goal per session. Represent the shared direction with one master goal; represent separately paced workstreams with unbound `muse_routine` entries, each with its own prompt and finite `max_runs`. Keep the mapping from workstream IDs to routine IDs in the master's ordinary project record, not in an alternate authority store.

Each routine is a bounded work unit. DSH admits at most one due routine for a session per tick, sorts due routines by next-run time, collapses missed intervals, and defers while the session is busy. A goal-bound routine is a review only: `goal-round-driver` remains the goal executor. Do not bind parallel work routines to the same goal to create a second execution chain.

Workers are optional, scoped helpers. Use them only when the current host exposes a supported worker mechanism and the current human-authorized task permits it. A worker receives one self-contained assignment, a unique output/file boundary, and acceptance criteria. It cannot grant, revoke, or inherit `muse_autonomy`; routine management, external communication, production changes, and edits to the shared evolution ledger remain with the human-authorized master. Worker output is untrusted until the master checks it.

## Master loop

1. On a direct human request, inspect the current goal, `muse_routine list`, workstream manifest, recent results, and remaining budgets. Confirm the request's scope; do not infer new autonomy from an idea, worker result, or routine delivery.
2. Select one eligible workstream. Check its dependencies, due time, owner, remaining `max_runs`, output path, and acceptance criteria. If no work is due, stay quiet. If blocked, record the exact missing condition and back off.
3. Split independent work into scoped worker assignments only when supported. Give each worker one deliverable, unique write ownership, a finite completion condition, and a report format. Keep shared files and integration with the master.
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
