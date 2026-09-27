import { createBashTool, createEditTool, createFindTool, createGrepTool, createLsTool, createReadTool, createWriteTool } from "@earendil-works/pi-coding-agent";
import { Check } from "typebox/value";
import type { ProgrammaticCodeModeToolDefinition } from "./tools/code-mode/types.ts";

/** Pi's own file/shell tools, not the Codex command/patch tool family. */
export function piNestedTools(cwd: string): ProgrammaticCodeModeToolDefinition[] {
  const tools = [createReadTool(cwd), createBashTool(cwd), createEditTool(cwd), createWriteTool(cwd), createGrepTool(cwd), createFindTool(cwd), createLsTool(cwd)];
  return tools.map(tool => ({
    name: tool.name,
    usage: `await tools.${tool.name}(${tool.name === "read" ? "{ path: string, offset?: number, limit?: number }" : tool.name === "bash" ? "{ command: string, timeout?: number }" : tool.name === "edit" ? "{ path: string, edits: { oldText: string, newText: string }[] }" : tool.name === "write" ? "{ path: string, content: string }" : tool.name === "grep" ? "{ pattern: string, path?: string, glob?: string }" : tool.name === "find" ? "{ pattern: string, path?: string }" : "{ path?: string }"})`, 
    description: tool.description,
    deferLoading: false,
    kind: "function" as const,
    inputSchema: tool.parameters,
    executionMode: tool.name === "write" || tool.name === "edit" ? "sequential" as const : "parallel" as const,
    async invoke(input, context, signal) {
      if (!Check(tool.parameters, input)) throw new Error(`Invalid ${tool.name} arguments`);
      const result = await tool.execute(context.toolCallId ?? crypto.randomUUID(), input as never, signal, context.onUpdate);
      context.captureResult?.(result);
      const text = result.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
      const image = result.content.find((part) => part.type === "image");
      return image?.type === "image" ? { image_url: `data:${image.mimeType};base64,${image.data}`, detail: "high", ...(text ? { output_hint: text } : {}) } : text || "(no output)";
    },
  }));
}
