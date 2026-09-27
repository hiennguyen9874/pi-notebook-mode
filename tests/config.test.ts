import { test } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConfig, saveMode } from "../src/config.ts";

test("project config overrides global fields and /mode persists in the project", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-notebook-config-"));
  const previous = process.env["PI_CODING_AGENT_DIR"];
  try {
    const agentDir = join(root, "agent");
    const project = join(root, "project");
    const projectDir = join(project, ".pi");
    mkdirSync(agentDir);
    mkdirSync(projectDir, { recursive: true });
    process.env["PI_CODING_AGENT_DIR"] = agentDir;
    const globalPath = join(agentDir, "pi-notebook-mode.json");
    const projectPath = join(projectDir, "pi-notebook-mode.json");
    writeFileSync(globalPath, JSON.stringify({ mode: "code", maxHeapMiB: 2048, profile: "global" }));
    deepStrictEqual(readConfig(project), { mode: "code", maxHeapMiB: 2048, profile: "global" });
    writeFileSync(projectPath, JSON.stringify({ mode: "notebook", profile: "local" }));
    deepStrictEqual(readConfig(project), { mode: "notebook", maxHeapMiB: 2048, profile: "local" });
    writeFileSync(projectPath, JSON.stringify({ mode: "bad", maxHeapMiB: 99, profile: "local" }));
    deepStrictEqual(readConfig(project), { mode: "code", maxHeapMiB: 2048, profile: "local" });
    saveMode(project, { ...readConfig(project), mode: "off" });
    deepStrictEqual(JSON.parse(readFileSync(projectPath, "utf8")), { mode: "off", maxHeapMiB: 99, profile: "local" });
    strictEqual(JSON.parse(readFileSync(globalPath, "utf8")).mode, "code");
    deepStrictEqual(readConfig(project), { mode: "off", maxHeapMiB: 2048, profile: "local" });
    rmSync(projectPath);
    saveMode(project, { ...readConfig(project), mode: "notebook" });
    strictEqual(JSON.parse(readFileSync(globalPath, "utf8")).mode, "notebook");
  } finally {
    if (previous === undefined) delete process.env["PI_CODING_AGENT_DIR"];
    else process.env["PI_CODING_AGENT_DIR"] = previous;
    rmSync(root, { recursive: true, force: true });
  }
});
