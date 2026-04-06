/**
 * RouteClaw section prompt loader.
 *
 * Each dynamic system-prompt section (memory, skills, reactions, reasoning) has
 * a corresponding file in ~/.openclaw/prompts/<name>.md.
 *
 * On first access the file is auto-created with the default content bundled in
 * section-prompts-content.ts (which is synced from src/agents/section-prompts/).
 * Users can then freely edit those files to customise every section.
 *
 * Empty file  = section is omitted entirely.
 * Missing dir  = created automatically.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function getPromptsDir(): string {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
  return join(home, ".openclaw", "prompts");
}

/**
 * Load a named section prompt from ~/.openclaw/prompts/<name>.md.
 * Creates the file with `defaultContent` on first run.
 * Returns the file content, or an empty string if the file is empty
 * (meaning the user intentionally disabled this section).
 */
export function loadSectionPrompt(name: string, defaultContent: string): string {
  const filePath = join(getPromptsDir(), `${name}.md`);

  if (existsSync(filePath)) {
    return readFileSync(filePath, "utf-8").trim();
  }

  // First run: bootstrap the file so the user can discover and edit it
  try {
    mkdirSync(getPromptsDir(), { recursive: true });
    writeFileSync(filePath, defaultContent, "utf-8");
  } catch {
    // Read-only FS or permission error — return default silently
  }

  return defaultContent.trim();
}
