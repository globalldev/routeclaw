# RouteClaw

> OpenClaw with smart pre-filter routing — answer simple questions in ~50 tokens instead of 2 000+.

RouteClaw is a drop-in fork of [OpenClaw](https://github.com/openclaw/openclaw) (MIT) that fixes the gateway's biggest inefficiency: a ~2 000-token system prompt was sent on **every single message**, including "hi" and heartbeat pings.

[![npm version](https://img.shields.io/npm/v/routeclaw?style=for-the-badge)](https://www.npmjs.com/package/routeclaw)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-globalldev%2Frouteclaw-181717?style=for-the-badge&logo=github)](https://github.com/globalldev/routeclaw)

---

## How a request travels — OpenClaw vs RouteClaw

```mermaid
flowchart TB
    classDef waste  fill:#ffe0e0,stroke:#cc3333,color:#333
    classDef save   fill:#e0ffe0,stroke:#339933,color:#333
    classDef fwd    fill:#fff8e0,stroke:#cc9900,color:#333
    classDef io     fill:#f0f0ff,stroke:#6666cc,color:#333

    subgraph OC["🦞  OpenClaw — every message, no exceptions"]
        direction TB
        OC1([User message]):::io
        OC1 --> OC2[Load workspace files\nSOUL.md · AGENTS.md · USER.md …]:::waste
        OC2 --> OC3[Build system prompt\n~2 000 tokens]:::waste
        OC3 --> OC4[Inject inbound_meta\ninto system prompt\n⚡ cache busted on every chat]:::waste
        OC4 --> OC5[API call\n~2 050 tokens 💸]:::waste
        OC5 --> OC6([Response]):::io
    end

    subgraph RC["🦎  RouteClaw — smart routing"]
        direction TB
        RC1([User message]):::io
        RC1 --> RC2{"Pre-filter\n~50 tokens"}:::save
        RC2 -- "✅ can answer directly" --> RC3([Direct answer\n~50 tokens total]):::save
        RC2 -- "FORWARD\nneeds tools / search" --> RC4[Load workspace files]:::fwd
        RC4 --> RC5["Build system prompt\n(SYSTEM.md or framework)"]:::fwd
        RC5 --> RC6["inbound_meta → user context\n✅ system prompt stays cached"]:::fwd
        RC6 --> RC7[API call\n~2 100 tokens]:::fwd
        RC7 --> RC8([Response]):::io
    end
```

**Simple message** ("hi", "what is 2+2?") — RouteClaw short-circuits at the pre-filter and never touches workspace files or history.
**Complex message** ("search for latest AI news") — goes through `FORWARD` and runs the full pipeline, same as OpenClaw.

---

## Token benchmark

| Message | OpenClaw | RouteClaw | Saving |
|---------|:--------:|:---------:|:------:|
| "привет" | ~2 050 | ~50 | **97 %** |
| "what is DNS?" | ~2 050 | ~200 | **90 %** |
| "find latest AI news" | ~2 050 | ~2 100 * | 0 % |

\* Complex requests run the full pipeline — same cost as upstream.

---

## What RouteClaw adds

### 1 · Pre-filter agent

Before loading any workspace files, tools, or history, RouteClaw makes a tiny API call with a single-sentence system prompt:

- Can answer from knowledge → **replies directly** (~50 tokens total)
- Needs tools, search, or context → sends `FORWARD`, full pipeline runs normally

Applies only to the `g1` entry agent. Everything else is unchanged.

### 2 · Inbound metadata moved to user context

`inbound_meta` (chat ID, account ID, channel type, etc.) was previously injected into the **system prompt**, busting prefix caches on every new chat. RouteClaw moves it to the **user context** so the system prompt stays static and providers can cache it.

### 3 · All prompts configurable via Markdown files

No hardcoded text anywhere in JS/TS — every prompt is a `.md` file:

| File | Controls |
|------|----------|
| `~/.openclaw/prefilter-g1.md` | Pre-filter system prompt (hot-reloaded every 30 s) |
| `<workspace>/SYSTEM.md` | Full agent base prompt — replaces the ~2 000-token boilerplate |
| `<workspace>/AGENTS.md` | Agent routing rules |
| `<workspace>/SOUL.md` | Personality / tone |
| `<workspace>/IDENTITY.md` | Identity |

---

## Install

```bash
# Fresh install
npm install -g routeclaw

# Both CLI aliases work — same binary
routeclaw gateway start
openclaw gateway start
```

### Migrate from OpenClaw

```bash
npm uninstall -g openclaw
npm install -g routeclaw
# All ~/.openclaw/* config and workspace files are preserved
```

---

## Configure the pre-filter prompt

Create `~/.openclaw/prefilter-g1.md` (hot-reloaded every 30 s, no restart needed):

```
Answer the user's question if you can do it without external sources of information
(internet, local data, etc.).
If you cannot — reply with exactly one word: FORWARD
```

The file is auto-created with the default content on first run.

---

## Agent system prompt — SYSTEM.md

On first run RouteClaw automatically creates `SYSTEM.md` inside every agent workspace
(e.g. `~/.openclaw/workspace-g1-worker/SYSTEM.md`) with the default OpenClaw instructions.
**No prompt text lives in compiled JS/TS code** — `SYSTEM.md` is the single source of truth.

| State | Behaviour |
|-------|-----------|
| File missing | Auto-created with default OpenClaw prompt |
| File has content | Used as the agent base system prompt |
| File is empty | No system prompt sent at all |

Dynamic lines (workspace directory, runtime info) are always appended after the file content.
Bootstrap files (AGENTS.md, SOUL.md, etc.) are still injected separately — they are unaffected.

### Default content of SYSTEM.md

This is what every fresh install gets. Edit it freely — changes take effect on next gateway restart.

```markdown
You are a personal assistant running inside OpenClaw.

## Tooling
Structured tool definitions are the source of truth for tool names, descriptions, and parameters.
Tool names are case-sensitive. Call tools exactly as listed in the structured tool definitions.
If a tool is present in the structured tool definitions, it is available unless a later tool call reports a policy/runtime restriction.
TOOLS.md does not control tool availability; it is user guidance for how to use external tools.

For follow-up at a future time (for example "check back in 10 minutes", reminders, run-later work,
or recurring tasks), use cron instead of exec sleep, yieldMs delays, or process polling.
Use exec/process only for commands that start now and continue running in the background.
For long-running work that starts now, start it once and rely on automatic completion wake when it
is enabled and the command emits output or fails; otherwise use process to confirm completion.
Do not emulate scheduling with sleep loops, timeout loops, or repeated polling.

For non-trivial multi-step work, keep a short plan updated with `update_plan`.
Skip `update_plan` for simple tasks or work you can finish in a few direct actions.
If a task is more complex or takes longer, spawn a sub-agent. Completion is push-based.
Do not poll `subagents list` / `sessions_list` in a loop; only check status on-demand.

## Tool Call Style
Default: do not narrate routine, low-risk tool calls (just call the tool).
Narrate only when it helps: multi-step work, complex problems, sensitive actions, or when asked.
When a first-class tool exists for an action, use it directly.
Never execute /approve through exec — it is a user-facing command, not a shell command.

## Execution Bias
If the user asks you to do the work, start doing it in the same turn.
Use a real tool call or concrete action first; do not stop at a plan or promise-to-act reply.
If the work will take multiple steps, send one short progress update before or while acting.

## Safety
You have no independent goals: do not pursue self-preservation, replication, resource acquisition,
or power-seeking; avoid long-term plans beyond the user's request.
Prioritize safety and human oversight over completion; comply with stop/pause/audit requests.
Do not manipulate anyone to expand access or disable safeguards.

## OpenClaw CLI Quick Reference
OpenClaw is controlled via subcommands. Do not invent commands.
- openclaw gateway status / start / stop / restart
If unsure, ask the user to run `openclaw help` and paste the output.

## Silent Replies
Use NO_REPLY ONLY when no user-visible reply is required.
It must be your ENTIRE message. Never append it to an actual response.
```

To **fully replace** the prompt, just rewrite the file with your own content.
To **disable** the system prompt entirely, empty the file (`echo -n > SYSTEM.md`).

---

## Staying up to date with upstream

```bash
git remote add upstream https://github.com/openclaw/openclaw
git fetch upstream
git rebase upstream/main
pnpm build
```

Conflicts only ever happen in 3 source files:
`prefilter.ts` · `get-reply.ts` · `inbound-meta.ts`

---

## Full documentation

For channels, skills, onboarding, Docker, and everything else — see the upstream [OpenClaw docs](https://docs.openclaw.ai).
RouteClaw is 100 % compatible: same config format, same workspace layout, same CLI commands.

> 🇷🇺 [Читать на русском](README.ru.md)

---

## License

MIT — same as OpenClaw upstream.
