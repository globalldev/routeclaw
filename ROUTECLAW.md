# RouteClaw

> OpenClaw with smart pre-filter routing. Answer simple questions in ~100 tokens instead of 2000+.

RouteClaw is a fork of [OpenClaw](https://github.com/openclaw/openclaw) (MIT) that adds two targeted improvements to slash token costs on every message.

---

## The Problem

OpenClaw sends a full system prompt (~2 000 tokens) on **every single request** — including "hi", "what time is it?", and heartbeat pings. For a busy bot that means thousands of unnecessary tokens per hour.

```
User: "привет"
OpenClaw → [2 000 token system prompt] + [5 token message] = ~2 005 tokens  💸
```

---

## The Solution

### 1 — Pre-filter agent (saves 80–95 % on simple messages)

Before touching any workspace files, tools, or session history, RouteClaw makes a tiny raw API call with a single-sentence system prompt:

```
User: "привет"
RouteClaw pre-filter → [1 sentence system prompt] + [5 token message] = ~50 tokens  ✅
                        → answers directly, done.

User: "find the latest AI news"
RouteClaw pre-filter → FORWARD signal (~50 tokens)
                        → full agent pipeline runs normally
```

The pre-filter only applies to the **`g1`** entry agent. If it can answer from its own knowledge it replies immediately. If not, it routes to `g1-worker` which has the full tool set.

### 2 — Inbound metadata moved to user context (prompt caching)

The `inbound_meta` JSON block (chat ID, account ID, channel, etc.) was previously injected into the **system prompt**, busting prefix caches on every new chat. RouteClaw moves it to the **user context** so the system prompt stays static and providers can cache it.

---

## Install

```bash
# Fresh install (replaces openclaw)
npm install -g routeclaw

# Both CLI names work
routeclaw gateway start
openclaw gateway start   # alias — same binary
```

### Migrate from OpenClaw

```bash
npm uninstall -g openclaw
npm install -g routeclaw
# All your ~/.openclaw/* settings are preserved
```

---

## Configure the pre-filter prompt

The pre-filter system prompt is read from `~/.openclaw/prefilter-g1.md` (hot-reloaded every 30 seconds — no gateway restart needed).

**Default prompt (English):**
```
Answer the user's question if you can do it without external sources of information
(internet, local data, etc.).
If you cannot — reply with exactly one word: FORWARD
```

**Example: Russian + custom rules:**
```markdown
Ответь на вопрос пользователя, если можешь сделать это без дополнительных
источников информации: интернета, локальных данных и т.д.
Отвечай кратко и по делу.
Если не можешь — ответь ровно одним словом: FORWARD
```

The file is created automatically on first run with the default content.

---

## Architecture

```
Telegram/Discord/etc.
        ↓
   g1 entry agent
        ↓
  ┌─────────────┐
  │ Pre-filter  │  ~50 tokens  →  direct answer to user
  │  (RouteClaw)│
  └──── FORWARD ┘
        ↓
  g1-worker agent  (full openclaw pipeline, tools, search, code…)
```

---

## Staying up to date with OpenClaw upstream

```bash
git fetch upstream
git rebase upstream/main
pnpm build
# Conflicts only in 2 source files (prefilter.ts, get-reply.ts, inbound-meta.ts)
```

---

## Token benchmark

| Message | OpenClaw | RouteClaw | Saving |
|---------|----------|-----------|--------|
| "привет" | ~2 050 | ~50 | **97 %** |
| "что такое DNS?" | ~2 050 | ~200 | **90 %** |
| "найди новости об ИИ" | ~2 050 | ~2 100* | 0 % |

\* Complex requests go through the full pipeline — same cost as upstream.

---

## License

MIT — same as OpenClaw upstream. Fork away.
