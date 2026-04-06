# RouteClaw

> OpenClaw with smart pre-filter routing — answer simple questions in ~50 tokens instead of 2000+.

RouteClaw is a drop-in fork of [OpenClaw](https://github.com/openclaw/openclaw) (MIT) that fixes the gateway's biggest inefficiency: it used to send a ~2 000-token system prompt on **every single message**, including "hi" and heartbeat pings.

[![npm version](https://img.shields.io/npm/v/routeclaw?style=for-the-badge)](https://www.npmjs.com/package/routeclaw)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-globalldev%2Frouteclaw-181717?style=for-the-badge&logo=github)](https://github.com/globalldev/routeclaw)

---

## The problem

```
User: "привет"
OpenClaw  →  [~2 000 token system prompt] + [5 token message]  =  ~2 005 tokens  💸
RouteClaw →  [1 sentence pre-filter prompt] + [5 token message] =  ~50 tokens   ✅
```

OpenClaw builds a full agent system prompt (~2 000 tokens) before it knows whether the message even needs tools or context. Simple greetings, quick factual questions, and math all pay the same cost as complex research tasks.

---

## What RouteClaw adds

### 1 · Pre-filter agent (80–97 % token savings on simple messages)

Before loading workspace files, tools, or history, RouteClaw makes a tiny API call with a single-sentence system prompt:

- If the model can answer from its own knowledge → **replies directly** (~50 tokens total)
- If it needs tools, search, or context → returns `FORWARD`, and the full pipeline runs normally

Applies only to the `g1` entry agent. Complex requests pay exactly the same cost as upstream OpenClaw.

### 2 · Inbound metadata moved to user context (enables prompt caching)

`inbound_meta` (chat ID, account ID, channel type, etc.) was injected into the **system prompt**, busting prefix caches on every new chat. RouteClaw moves it to the **user context** so the system prompt stays static and providers can cache it across messages.

### 3 · Fully configurable prompts via Markdown files

Every prompt in the pipeline is now a `.md` file — no hardcoded text in JS/TS:

| File | What it controls |
|------|-----------------|
| `~/.openclaw/prefilter-g1.md` | Pre-filter system prompt (hot-reloaded every 30 s) |
| `<workspace>/SYSTEM.md` | Full agent base system prompt — replaces the ~2 000-token framework boilerplate |
| `<workspace>/AGENTS.md` | Agent routing rules (same as upstream) |
| `<workspace>/SOUL.md` | Personality / tone (same as upstream) |
| `<workspace>/IDENTITY.md` | Identity (same as upstream) |

---

## Install

```bash
# Fresh install
npm install -g routeclaw

# Both CLI names work — same binary
routeclaw gateway start
openclaw gateway start
```

### Migrate from OpenClaw

```bash
npm uninstall -g openclaw
npm install -g routeclaw
# All your ~/.openclaw/* config and workspace files are preserved
```

---

## Configure the pre-filter prompt

Create `~/.openclaw/prefilter-g1.md` (hot-reloaded, no restart needed):

```markdown
Answer the user's question if you can do it without external sources of information
(internet, local data, etc.).
If you cannot — reply with exactly one word: FORWARD
```

**Russian example:**
```markdown
Ответь на вопрос пользователя, если можешь сделать это без дополнительных
источников информации: интернета, локальных данных и т.д.
Отвечай кратко и по делу.
Если не можешь — ответь ровно одним словом: FORWARD
```

---

## Replace the full agent system prompt

Create `SYSTEM.md` in your workspace directory (e.g. `~/.openclaw/workspace-g1-worker/SYSTEM.md`):

```markdown
You are a capable AI assistant with access to tools: web search, file operations, and code execution.

Route complex tasks to specialists when needed:
- Search/research tasks → spawn agent `g2`
- Code/programming tasks → spawn agent `g3`
- Handle everything else directly using available tools.

Be concise and direct. Use tools when needed, not by default.
```

This **fully replaces** the ~2 000-token framework boilerplate. Bootstrap files (AGENTS.md, SOUL.md, etc.) are still appended after it.

---

## Token benchmark

| Message | OpenClaw | RouteClaw | Saving |
|---------|----------|-----------|--------|
| "привет" | ~2 050 | ~50 | **97 %** |
| "что такое DNS?" | ~2 050 | ~200 | **90 %** |
| "найди новости об ИИ" | ~2 050 | ~2 100* | 0 % |

\* Complex requests go through the full pipeline — same cost as upstream.

---

## Architecture

```
Telegram / Discord / WhatsApp / etc.
           ↓
      g1 entry agent
           ↓
   ┌───────────────┐
   │  Pre-filter   │──── answers directly (~50 tokens)
   │  (RouteClaw)  │
   └──── FORWARD ──┘
           ↓
    g1-worker agent
    (full OpenClaw pipeline: tools, search, code, memory…)
```

The pre-filter runs against the configured local proxy model (`local-proxy` in `openclaw.json`). Set `baseUrl`, `apiKey`, and `models[0].id` to point it at any OpenAI-compatible endpoint.

---

## Staying up to date with OpenClaw upstream

```bash
git remote add upstream https://github.com/openclaw/openclaw
git fetch upstream
git rebase upstream/main
pnpm build
```

Conflicts only ever happen in 3 files: `src/auto-reply/reply/prefilter.ts`, `src/auto-reply/reply/get-reply.ts`, `src/auto-reply/reply/inbound-meta.ts`.

---

## Full documentation

For everything else (channels, skills, onboarding, Docker, etc.) see the upstream [OpenClaw docs](https://docs.openclaw.ai). RouteClaw is 100 % compatible — same config format, same workspace structure, same CLI.

---

## License

MIT — same as OpenClaw upstream.
