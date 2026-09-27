import { test } from "node:test";
import { deepStrictEqual, rejects } from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Check } from "typebox/value";
import { ModeSwitch } from "../src/mode.ts";
import { piNestedTools } from "../src/provider.ts";

test("switches and restores Pi tools without dropping an extension tool", () => {
  const modes = new ModeSwitch();
  deepStrictEqual(modes.update("code", ["read", "bash", "my_tool"]), ["exec", "wait", "my_tool"]);
  deepStrictEqual(modes.update("notebook", ["exec", "wait", "my_tool", "another_tool"]), ["exec", "wait", "notebook", "my_tool", "another_tool"]);
  deepStrictEqual(modes.update("off", ["exec", "wait", "notebook", "my_tool", "another_tool"]), ["read", "bash", "my_tool", "another_tool"]);
});

test("respects removal of a previously exposed extension tool", () => {
  const modes = new ModeSwitch();
  modes.update("code", ["read", "plugin"]);
  deepStrictEqual(modes.update("off", ["exec", "wait"]), ["read"]);
});

test("nested tools are Pi tools, not Codex tools", async () => {
  const tools = piNestedTools(process.cwd());
  deepStrictEqual(tools.map(t => t.name), ["read", "bash", "edit", "write", "grep", "find", "ls"]);
  const read = tools[0]!;
  const value = await read.invoke({ path: "package.json" }, { cwd: process.cwd() }, new AbortController().signal);
  if (typeof value !== "string" || !value.includes("pi-notebook-mode")) throw new Error("nested read did not return Pi file content");
});

test("nested edit exposes and executes a single replacement", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-single-edit-"));
  try {
    const path = join(cwd, "example.txt");
    await writeFile(path, "first\nsecond\n");
    const edit = piNestedTools(cwd).find(t => t.name === "edit")!;
    const signal = new AbortController().signal;
    const context = { cwd };
    const args = { path: "example.txt", oldText: "first", newText: "changed" };
    if (!edit.usage.includes("oldText") || edit.usage.includes("edits:")) throw new Error("edit usage is not singular");
    deepStrictEqual(Check(edit.inputSchema as never, args), true);
    deepStrictEqual(Check(edit.inputSchema as never, { path: "example.txt", edits: [{ oldText: "first", newText: "changed" }] }), false);
    await rejects(edit.invoke({ ...args, edits: [] }, context, signal), /Invalid edit arguments/);
    await rejects(edit.invoke({ path: "example.txt", oldText: "missing", newText: "changed" }, context, signal));
    deepStrictEqual(await readFile(path, "utf8"), "first\nsecond\n");
    const result = await edit.invoke(args, context, signal);
    if (typeof result !== "string" || !result.includes("Successfully replaced 1 block")) throw new Error("edit result missing");
    deepStrictEqual(await readFile(path, "utf8"), "changed\nsecond\n");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
