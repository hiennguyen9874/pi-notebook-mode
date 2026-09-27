import { test } from "node:test";
import { deepStrictEqual } from "node:assert/strict";
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
