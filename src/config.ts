import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { Mode } from "./mode.ts";

const CONFIG_FILE = "pi-notebook-mode.json";
const MODES: Mode[] = ["off", "code", "notebook"];
export interface Config { mode: Mode; maxHeapMiB: number; profile?: string }

function readFile(path: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch { return {}; }
}

export function readConfig(cwd: string): Config {
  const global = readFile(join(getAgentDir(), CONFIG_FILE));
  const project = readFile(join(cwd, ".pi", CONFIG_FILE));
  const mode = MODES.find(item => item === project["mode"]) ?? MODES.find(item => item === global["mode"]) ?? "off";
  const validHeap = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 128 && value <= 16384;
  const maxHeapMiB = validHeap(project["maxHeapMiB"]) ? project["maxHeapMiB"] : validHeap(global["maxHeapMiB"]) ? global["maxHeapMiB"] : 1024;
  const validProfile = (value: unknown): value is string => typeof value === "string" && !!value;
  const profile = validProfile(project["profile"]) ? project["profile"] : validProfile(global["profile"]) ? global["profile"] : undefined;
  return { mode, maxHeapMiB, ...(profile ? { profile } : {}) };
}

export function saveMode(cwd: string, config: Config): void {
  const projectPath = join(cwd, ".pi", CONFIG_FILE);
  // If the project has its own config, persist mode there so /mode survives a reload.
  // Preserve partial overrides rather than copying global settings into the project.
  try {
    const value: unknown = JSON.parse(readFileSync(projectPath, "utf8"));
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      writeFileSync(projectPath, JSON.stringify({ ...value, mode: config.mode }, null, 2) + "\n");
      return;
    }
  } catch { /* No usable project config; use the global config. */ }
  mkdirSync(getAgentDir(), { recursive: true });
  writeFileSync(join(getAgentDir(), CONFIG_FILE), JSON.stringify(config, null, 2) + "\n");
}
