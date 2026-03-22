/**
 * Per-user mode store: persists each WeChat user's current mode and Claude Code session ID.
 * Data stored in config/user-states.json (gitignored).
 *
 * Modes:
 *   "agent"  — passthrough to LLM API (default)
 *   "claude" — route to local Claude Code CLI
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATES_PATH = path.resolve(__dirname, "../../../config/user-states.json");

export type UserMode = "agent" | "claude";

type UserState = {
  mode: UserMode;
  claudeSessionId?: string;
};

type StatesFile = Record<string, UserState>;

function stateKey(accountId: string, userId: string): string {
  return `${accountId}:${userId}`;
}

function readStates(): StatesFile {
  try {
    return JSON.parse(fs.readFileSync(STATES_PATH, "utf-8")) as StatesFile;
  } catch {
    return {};
  }
}

function writeStates(states: StatesFile): void {
  fs.mkdirSync(path.dirname(STATES_PATH), { recursive: true });
  fs.writeFileSync(STATES_PATH, JSON.stringify(states, null, 2), "utf-8");
}

/** Get current mode for a user. Defaults to "agent" if not set. */
export function getUserMode(accountId: string, userId: string): UserMode {
  const states = readStates();
  return states[stateKey(accountId, userId)]?.mode ?? "agent";
}

/** Set mode for a user, persisted to disk immediately. */
export function setUserMode(accountId: string, userId: string, mode: UserMode): void {
  const states = readStates();
  const key = stateKey(accountId, userId);
  states[key] = { ...(states[key] ?? {}), mode };
  writeStates(states);
}

/** Get stored Claude Code session ID for a user (undefined = no session yet). */
export function getClaudeSessionId(accountId: string, userId: string): string | undefined {
  const states = readStates();
  return states[stateKey(accountId, userId)]?.claudeSessionId;
}

/** Persist a Claude Code session ID for a user. */
export function setClaudeSessionId(accountId: string, userId: string, sessionId: string): void {
  const states = readStates();
  const key = stateKey(accountId, userId);
  states[key] = { ...(states[key] ?? { mode: "claude" }), claudeSessionId: sessionId };
  writeStates(states);
}

/** Clear the Claude Code session (forces a new session on next message). */
export function clearClaudeSession(accountId: string, userId: string): void {
  const states = readStates();
  const key = stateKey(accountId, userId);
  if (states[key]) {
    delete states[key].claudeSessionId;
    writeStates(states);
  }
}
