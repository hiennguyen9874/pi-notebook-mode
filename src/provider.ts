import { createBashTool, createEditTool, createFindTool, createGrepTool, createLsTool, createReadTool, createWriteTool } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { Check } from "typebox/value";
import type { ProgrammaticCodeModeToolDefinition } from "./tools/code-mode/types.ts";

const singleEditSchema = Type.Object({
  path: Type.String({ description: "Path to the file to edit (relative or absolute)" }),
  oldText: Type.String({ description: "Exact text to replace; must occur only once in the file" }),
  newText: Type.String({ description: "Replacement text (may be empty)" }),
}, { additionalProperties: false });

/** Pi's own file/shell tools, not the Codex command/patch tool family. */
export function piNestedTools(cwd: string): ProgrammaticCodeModeToolDefinition[] {
  const tools = [createReadTool(cwd), createBashTool(cwd), createEditTool(cwd), createWriteTool(cwd), createGrepTool(cwd), createFindTool(cwd), createLsTool(cwd)];
  return tools.map(tool => ({
    name: tool.name,
    usage: `await tools.${tool.name}(${tool.name === "read" ? "{ path: string, offset?: number, limit?: number }" : tool.name === "bash" ? "{ command: string, timeout?: number }" : tool.name === "edit" ? "{ path: string, oldText: string, newText: string }" : tool.name === "write" ? "{ path: string, content: string }" : tool.name === "grep" ? "{ pattern: string, path?: string, glob?: string }" : tool.name === "find" ? "{ pattern: string, path?: string }" : "{ path?: string }"})`,
    description: tool.name === "edit" ? "Replace one unique, exact text block in a file. Use a separate call for each replacement." : tool.description,
    deferLoading: false,
    kind: "function" as const,
    inputSchema: tool.name === "edit" ? singleEditSchema : tool.parameters,
    executionMode: tool.name === "write" || tool.name === "edit" ? "sequential" as const : "parallel" as const,
    async invoke(input, context, signal) {
      const schema = tool.name === "edit" ? singleEditSchema : tool.parameters;
      if (!Check(schema, input)) throw new Error(`Invalid ${tool.name} arguments`);
      let args = input;
      if (tool.name === "edit") {
        const { path, oldText, newText } = input as Static<typeof singleEditSchema>;
        args = { path, edits: [{ oldText, newText }] };
      }
      const result = await tool.execute(context.toolCallId ?? crypto.randomUUID(), args as never, signal, context.onUpdate);
      context.captureResult?.(result);
      const text = result.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
      const image = result.content.find((part) => part.type === "image");
      return image?.type === "image" ? { image_url: `data:${image.mimeType};base64,${image.data}`, detail: "high", ...(text ? { output_hint: text } : {}) } : text || "(no output)";
    },
  }));
}
