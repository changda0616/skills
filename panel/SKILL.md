---
name: panel
description: Use when a feat or refactor task needs independent cross-model review — three agents analyse the requirement before implementation, or verify the diff after it, then challenge each other. Says "panel", "cross-check", "三方驗證", or "/panel". Gate A runs at requirements; Gate B runs at acceptance.
argument-hint: requirements <ticket> | verify [target]
---

# /panel `requirements <ticket>` | `verify [target]`

Run a review panel across three agents — Claude, agy, Codex — so that a single model's blind spot does not become the whole answer.

Two gates. **Gate A** analyses the requirement before implementation. **Gate B** verifies the implementation against the criteria Gate A produced. You drive both; the helper only runs the CLIs and reports whether each agent answered.

## When to run

| Branch type | Gate A | Gate B |
|---|---|---|
| `feat`, `refactor` | run | run |
| `fix`, `chore`, `docs`, `test` | skip | skip |

Read the type from the branch name (`<type>/<base>/<slug>`) or from the `/x-work` invocation. Do not infer it from how hard the task feels.

## The panel

| Agent | How you call it |
|---|---|
| Claude | the Agent tool, in this session |
| agy | `scripts/ask.mjs agy <promptFile> "AC-1,AC-2,..." <timeoutSec>` |
| Codex | `scripts/ask.mjs codex <promptFile> "AC-1,AC-2,..." <timeoutSec>` |

Pass the criteria ids you asked for, not a count. Codex has returned the same id twice in one reply; a count alone lets that through with one criterion silently unverified.

**The packet is the only place an agent learns the shape.** Neither CLI takes a schema
argument.

End every packet with the schema itself and this instruction:

~~~
The JSON object MUST validate against this JSON Schema:

<paste schemas/gate-a.json or schemas/gate-b.json here>

Your entire response must be exactly one JSON object. Emit nothing before it and nothing
after it. Do not narrate. Do not report progress. Do not describe what you are about to do.

If you are still waiting on a subagent and have no answer yet, emit exactly this object and
nothing else:

{"status":"waiting","waiting_on":"<one short line naming what you wait for>"}

Never emit a waiting object and an answer in the same response. When the answer is ready,
emit the answer object alone.
~~~

agy spawns a subagent for research, and its progress text used to land in front of the
answer. The contract turns that into a status the helper can read.

Spawn all three **in one message** so they run at once, and read nothing until every one returns. A verifier that sees another's answer stops being independent, and independence is the only thing this skill buys.

## The helper contract

`ask.mjs` prints one JSON line:

```
{ "ok": true,  "data": {...}, "agent": "agy" }
{ "ok": false, "reason": "empty|waiting|unparseable|id_mismatch|duplicate_ids|timeout|spawn_failed", "stderr": "...", "raw": "..." }
```

`ok` is decided by mechanical checks only: the reply parses as JSON, it matches the shape, and its criteria ids are exactly the set you asked for, with no repeats. The helper judges nothing else. It does not compare agents, does not score confidence, does not decide anything. That is your work.

**Never read an agent's `status` field, and never trust an exit code.** agy reports `SUCCESS` and exit 0 when it produced nothing at all; four separate failure modes look identical from the outside. Content is the only signal.

`waiting` means the agent answered with a waiting object and no answer. Retry that agent;
its subagent had not finished. The helper drops a waiting object that arrives in front of a
real answer, so a mixed reply still counts as a vote.

**`ok: false` means that agent did not vote.** Do not read it as agreement, do not count it toward consensus, and do not let two answers plus one silence pass as "all three agree". Say in your report which agents answered.

Read `stderr` when `ok` is false — it usually names the cause (a missing permission, a denied tool) and tells you whether to retry, fix config, or stop and ask the author.

## Rounds

Both gates run the same two rounds.

**R1 — blind.** Every agent gets the identical packet and no knowledge of the others.

**R2 — cross-review.** Only the items where the agents disagree. Each agent sees the others' answers on those items, and either holds its position or changes it. Require evidence for a change: *"Change your answer only if you can point to the `file:line` that refutes you. Otherwise hold, and say why."* Models concede to disagreement by reflex, and a reflex concession destroys the finding it should have defended.

Stop after R2. Items still in dispute go to the author, not to a third round.

Report blind agreement and post-discussion agreement **separately**. Three agents agreeing before they saw each other is far stronger evidence than three agreeing afterwards, and merging the two hides that.

## Gate A — requirements

Before implementation. Embed `schemas/gate-a.json` in the packet.

The packet carries the ticket, the repo path, and this instruction: **read the ticket and the codebase yourself**. Do not pre-digest the requirement for them — a summary you wrote is your reading, and three agents checking your reading is not a panel.

Disagreement here is the product, not a defect. Three readings of one ticket that differ prove the ticket is ambiguous. **Do not resolve it yourself** — that is exactly the judgment the author has to make.

Every criterion needs `traceability` — a quote from the ticket or a `file:line`. Anything that traces to neither is an invented requirement; move it to `suggestions` and label it out of scope. Three agents brainstorming will grow the scope, and each will sound responsible doing it.

Output to the author:

- **Consensus criteria** — every agent raised it blind.
- **Accepted after discussion** — one agent saw what the others missed. This is the panel's highest-value output.
- **Open questions** — the author decides. Never the panel.
- **Suggestions** — out of scope, listed once, not argued.

The numbered criteria the author settles on become Gate B's index.

## Gate B — acceptance

After implementation. Embed `schemas/gate-b.json` in the packet.

The packet carries the numbered criteria, the diff, and the repo path. The criteria are **authoritative**: agents may read the ticket for background but must not renumber, rewrite, or add to them. Three agents verifying three different lists produces a disagreement count that means nothing.

Two fields, two questions:

- `verdict` — is it there? (`met` / `not_met` / `cannot_verify`)
- `soundness` — is it right? (`sound` / `questionable` / `wrong`)

Both are needed. An implementation that satisfies a criterion the wrong way scores `met` on one and `wrong` on the other, and only the second catches it.

A requirement the ticket carries but the criteria missed goes in `criteria_gaps` — never into the numbered verdicts.

## Adjudication

Yours alone. **Open the files and read the cited `file:line` yourself** for every disputed item and every changed answer that arrived without evidence.

This is the one step in the whole flow that is not another model's opinion, and it is what stops three agents from sharing one hallucination. Tallying votes just adds a fourth opinion.

Weigh it: any `not_met` or `wrong` blocks until you have checked it. Do not overrule an agent on reasoning alone — check the code, then overrule.

You are Claude, and so is one of the three verifiers. When you and the Claude verifier are wrong the same way, agy and Codex being right will not save the result — you will read their dissent as noise. Treat a lone dissent against a Claude majority as the case most worth opening the file for.

## What NOT to do

- Don't let any agent see another's answer in R1.
- Don't count a non-answer as agreement.
- Don't trust `status` or an exit code.
- Don't resolve Gate A's open questions yourself.
- Don't accept a criterion with no traceability.
- Don't run a third round.
- Don't adjudicate from reasoning — read the file.
- Don't fix anything in Gate B. It reports; the author decides.
