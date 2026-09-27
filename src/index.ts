import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { MODE_TOOLS, ModeSwitch, type Mode } from "./mode.ts";
import { piNestedTools } from "./provider.ts";
import { registerCodeModeTools } from "./tools/code-mode/tools.ts";

const CONFIG_FILE = "pi-notebook-mode.json";
const MODES: Mode[] = ["off", "code", "notebook"];
interface Config { mode: Mode; maxHeapMiB: number; profile?: string }
function readConfig(): Config {
  try {
    const value = JSON.parse(readFileSync(join(getAgentDir(), CONFIG_FILE), "utf8")) as { mode?: unknown; maxHeapMiB?: unknown; profile?: unknown };
    return {
      mode: MODES.find(item => item === value.mode) ?? "off",
      maxHeapMiB: typeof value.maxHeapMiB === "number" && Number.isInteger(value.maxHeapMiB) && value.maxHeapMiB >= 128 && value.maxHeapMiB <= 16384 ? value.maxHeapMiB : 1024,
      ...(typeof value.profile === "string" && value.profile ? { profile: value.profile } : {}),
    };
  } catch { return { mode: "off", maxHeapMiB: 1024 }; }
}
function saveConfig(config: Config): void {
  mkdirSync(getAgentDir(), { recursive: true });
  writeFileSync(join(getAgentDir(), CONFIG_FILE), JSON.stringify(config, null, 2) + "\n");
}

export default async function notebookMode(pi: ExtensionAPI): Promise<void> {
  let config = readConfig();
  let mode = config.mode;
  const switcher = new ModeSwitch();
  let registration: Awaited<ReturnType<typeof registerCodeModeTools>> | undefined;
  let firstNotebookTurn = true;
  const apply = () => {
    const tools = switcher.update(mode, pi.getActiveTools());
    if (tools.join("\0") !== pi.getActiveTools().join("\0")) pi.setActiveTools(tools);
  };
  registration = await registerCodeModeTools(pi, {
    isActive: () => mode !== "off" && MODE_TOOLS.slice(0, mode === "notebook" ? 3 : 2).every(name => pi.getActiveTools().includes(name)),
    executionKind: () => mode === "notebook" ? "notebook" : "code",
    notebookOptions: () => ({ agentDir: getAgentDir(), maxHeapMiB: config.maxHeapMiB, ...(config.profile ? { profile: config.profile } : {}) }),
    getTools: (ctx) => piNestedTools((ctx as { cwd?: string } | undefined)?.cwd ?? process.cwd()),
  });
  pi.registerCommand("mode", {
    description: "Switch Pi execution mode: off, code, notebook",
    handler: async (args, ctx) => {
      const requested = args.trim().toLowerCase();
      const choice = requested || (ctx.hasUI ? await ctx.ui.select("Execution mode", MODES) : undefined);
      if (!MODES.includes(choice as Mode)) {
        ctx.ui.notify("Usage: /mode off|code|notebook", "warning");
        return;
      }
      const next = choice as Mode;
      if (mode === "notebook" && next !== mode) await registration?.checkpointNotebook();
      mode = next;
      firstNotebookTurn = true;
      config.mode = mode;
      saveConfig(config);
      apply();
      if (mode !== "off" && !MODE_TOOLS.slice(0, mode === "notebook" ? 3 : 2).every(name => pi.getActiveTools().includes(name)))
        ctx.ui.notify("Mode tools are unavailable; check Pi's tool allowlist", "warning");
      ctx.ui.setStatus("pi-notebook-mode", mode === "off" ? undefined : `Mode: ${mode}`);
    },
  });
  pi.on("session_start", (_event, ctx) => {
    config = readConfig();
    mode = config.mode;
    firstNotebookTurn = true;
    apply();
    if (ctx.hasUI) ctx.ui.setStatus("pi-notebook-mode", mode === "off" ? undefined : `Mode: ${mode}`);
  });
  pi.on("model_select", apply);
  pi.on("input", apply);
  pi.on("before_agent_start", async (event, ctx) => {
    apply();
    if (mode === "off" || !MODE_TOOLS.slice(0, mode === "notebook" ? 3 : 2).every(name => pi.getActiveTools().includes(name))) return;
    const sections = event.systemPromptOptions.sections ??= {};
    sections["notebook_mode_guidance"] = mode === "code"
      ? "Code mode: use exec for fresh restricted JavaScript cells; call Pi tools through tools.*. Use text(value) for output and wait for yielded cells. No imports, console, or persistent bindings. Use image(result) for image data returned by nested tools."
      : "Notebook mode: exec runs persistent Deno TypeScript; bindings and imports survive across cells. Use text(value) to show output; wait for yielded cells. Use image(result) for image data returned by nested tools. Checkpoint before compaction and use notebook for status/recovery.";
    if (mode === "notebook" && firstNotebookTurn) {
      firstNotebookTurn = false;
      try {
        const status = await registration?.notebookStatus(ctx);
        if (status) sections["notebook_mode_status"] = status.message;
      } catch (error) {
        sections["notebook_mode_status"] = `Notebook status unavailable: ${String(error)}`;
      }
    }
  });
  pi.on("session_before_compact", async () => {
    if (mode === "notebook") await registration?.checkpointNotebook();
  });
  pi.on("session_shutdown", async () => {
    await registration?.shutdown();
    registration = undefined;
  });
}
