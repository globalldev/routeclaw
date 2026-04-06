/**
 * RouteClaw pre-filter: intercepts messages for the "g1" agent before the full
 * OpenClaw pipeline (and its large system prompt) runs.
 *
 * If the model can answer directly from its own knowledge, it returns the answer
 * immediately — skipping all session setup, workspace loading, and tool injection.
 * Otherwise it signals FORWARD and the caller routes to a full agent (g1-worker).
 *
 * The system prompt is read from ~/.openclaw/prefilter-g1.md (hot-reloaded every
 * 30 seconds) so users can tune behaviour without restarting the gateway.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { OpenClawConfig } from "../../config/config.js";

// ─── Prompt loading ───────────────────────────────────────────────────────────

const DEFAULT_PROMPT =
  "Answer the user's question if you can do it without external sources of information " +
  "(internet, local data, etc.). " +
  "If you cannot — reply with exactly one word: FORWARD";

let _promptCache: string | null = null;
let _promptCacheAt = 0;

export function loadPrefilterPrompt(): string {
  const now = Date.now();
  if (_promptCache !== null && now - _promptCacheAt < 30_000) {
    return _promptCache;
  }
  const filePath = join(
    process.env.USERPROFILE ?? process.env.HOME ?? "",
    ".openclaw",
    "prefilter-g1.md",
  );
  try {
    _promptCache = existsSync(filePath)
      ? readFileSync(filePath, "utf-8").trim() || DEFAULT_PROMPT
      : DEFAULT_PROMPT;
  } catch {
    _promptCache = DEFAULT_PROMPT;
  }
  _promptCacheAt = now;
  return _promptCache;
}

// ─── Pre-filter runner ────────────────────────────────────────────────────────

type PrefilterResult = { answered: false } | { answered: true; text: string };

interface ProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  models?: Array<{ id: string }>;
}

export async function runPrefilter(
  userMessage: string,
  cfg: OpenClawConfig,
): Promise<PrefilterResult> {
  try {
    const providers = (cfg as { models?: { providers?: Record<string, unknown> } }).models
      ?.providers;
    const proxy = (providers?.["local-proxy"] ?? {}) as ProviderConfig;
    const baseUrl = proxy.baseUrl ?? "http://127.0.0.1:8045/v1";
    const apiKey = proxy.apiKey ?? "";
    const model = proxy.models?.[0]?.id ?? "gemini-3-flash";

    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: loadPrefilterPrompt() },
          { role: "user", content: userMessage },
        ],
        max_tokens: 1024,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      return { answered: false };
    }

    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";

    if (!text || /^FORWARD$/i.test(text) || text.toUpperCase().startsWith("FORWARD")) {
      return { answered: false };
    }

    return { answered: true, text };
  } catch {
    return { answered: false };
  }
}
