---
name: viz
description: Build one finished diagram for a subject and save it as a local standalone HTML file. Use when the user wants a real diagram instead of an inline sketch — "畫一張圖", "diagram this", "visualise this system", "圖解", or /viz. This skill selects the diagram type for the user, explains what that type is for, then builds it with the archify or diagram-design skill. Also the handoff target of /show-me.
---

# viz

Deliver one finished diagram. The user does not know the diagram types, so the choice and
the teaching are your job, not theirs.

## Rules

1. Never ask which diagram type to draw. Decide.
2. Explain the choice in two or three sentences before you build. Say what that diagram
   type shows in general. Then say why this subject fits it. Teach the type, not your
   decision process.
3. Build directly after the explanation. Do not wait for approval.
4. Write the result to a local HTML file. Open the file. Never publish an Artifact to
   claude.ai, because the work is internal. Ask first if the user wants a link.
5. Write the explanation in the language of the conversation.

## Select the type

| The subject is | Type | What this type shows |
|---|---|---|
| components, services, trust or ownership boundaries | `architecture` | what the parts are, who owns them, how they connect |
| a process with gates, branches, and outcomes | `workflow` | which checkpoints exist, and where each result leads |
| A calls B, B calls C, plus the replies | `sequence` | who calls whom, in what order, and what comes back |
| a pipeline, ETL, lineage, consumers | `dataflow` | where data starts, what transforms it, who reads it |
| statuses, retries, waiting and terminal states | `lifecycle` | which states exist, and which event moves between them |

## Select the tool

- One of the five types above — use the `archify` skill. It validates geometry, so routes
  do not cross opaque nodes and labels do not mask each other.
- Sankey, Wardley map, Gantt, Venn, fishbone, treemap, org chart, kanban, user journey,
  quadrant, radar, ER, UML class, timeline, or swimlane — use the `diagram-design` skill.
- A metaphor, a side-by-side comparison, or an explainer for a reader with no background —
  hand-author one HTML file. Do not force a tool onto a subject that is not a system.

Note: `archify` covers only its five types. `diagram-design` covers those five and many more,
but does not validate geometry. Prefer `archify` when both fit.

## Where to write

Write to `~/Desktop/` unless the user names a path. Never write inside a git working tree,
because the file is not part of the project.

Name the file after the subject, not after the tool: `password-reset-sequence.html`.

## Scope

One diagram per request. If the subject needs two, say which second diagram you would add
and why, then let the user ask for it.
