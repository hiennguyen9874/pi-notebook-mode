import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { getExperimentalToolSampling } from "../tool-sampling.ts";
import {
	DEFAULT_CODE_MODE_OUTPUT_TOKENS,
	MAX_CODE_MODE_OUTPUT_TOKENS,
} from "./host-protocol.js";
import {
	EXEC_DESCRIPTION,
	WAIT_DESCRIPTION,
} from "./custom-tool-prompt.js";
import { createCodeModeRenderTracker } from "./render-tracker.js";
import {
	renderExecCall,
	renderWaitCall,
} from "./call-rendering.js";
import { renderTrackedCodeModeResult } from "./result-rendering.js";
import type { SharedCodeModeRuntime } from "./shared-runtime.js";
import { toCodeModeToolResult } from "./tool-result.js";
import type {
	CodeModeRenderContext,
	CodeModeRenderTheme,
	ToolExecutionContext,
} from "./types.js";
import { CODE_MODE_EXEC_CONSTRAINED_SAMPLING } from "./exec-contract.js";
import {
	registerCodeModePreflightBroker,
} from "./nested-tool-preflight.js";
import { registerNotebookTool } from "./notebook-tool.ts";

const DEFAULT_WAIT_MS = 10_000;
const MIN_ADAPTIVE_WAIT_MS = 5_000;
const MAX_ADAPTIVE_WAIT_MS = 1_800_000;
type RenderTracker = ReturnType<typeof createCodeModeRenderTracker>;
const EXEC_PARAMETERS = Type.Object({
	code: Type.String(),
});
const WAIT_PARAMETERS = Type.Object({
	cell_id: Type.String(),
	yield_time_ms: Type.Optional(
		Type.Integer({
			minimum: 0,
			default: DEFAULT_WAIT_MS,
		}),
	),
	max_tokens: Type.Optional(
		Type.Integer({
			minimum: 1,
			maximum: MAX_CODE_MODE_OUTPUT_TOKENS,
			default: DEFAULT_CODE_MODE_OUTPUT_TOKENS,
		}),
	),
	terminate: Type.Optional(Type.Boolean()),
});

export function registerPublicCodeModeTools(
	pi: ExtensionAPI,
	runtime: SharedCodeModeRuntime,
): void {
	const tracker = createCodeModeRenderTracker();
	const waitAttempts = new Map<string, number>();
	const renderResult = createResultRenderer(runtime, tracker);
	const broker = registerCodeModePreflightBroker(pi);
	const hooks = { preflight: broker.run, completion: broker.complete };
	pi.registerTool(createExecTool(runtime, tracker, renderResult, hooks));
	pi.registerTool(createWaitTool(runtime, tracker, renderResult, waitAttempts, hooks));
	registerNotebookTool(pi, runtime);
}

function createExecTool(
	runtime: SharedCodeModeRuntime,
	tracker: RenderTracker,
	renderResult: ReturnType<typeof createResultRenderer>,
	hooks: Pick<ToolExecutionContext, "preflight" | "completion">,
): ToolDefinition<typeof EXEC_PARAMETERS> {
	return {
		name: "exec",
		label: "Exec",
		description: EXEC_DESCRIPTION,
		promptSnippet: "Compose tools with JavaScript",
		parameters: EXEC_PARAMETERS,
		constrainedSampling: CODE_MODE_EXEC_CONSTRAINED_SAMPLING,
		async execute(id, params, signal, onUpdate, ctx) {
			tracker.start(id);
			try {
				const response = await (await runtime.getClient(ctx)).execute(
					params.code,
					{ cwd: ctx.cwd, toolCallId: id, extensionContext: ctx, ...hooks, onUpdate },
					signal,
					runtime.collectTools(ctx),
				);
				tracker.finish(
					id,
					response.kind === "yielded" ? "yielded" : "done",
				);
				return toCodeModeToolResult(response);
			} catch (error) {
				tracker.finish(id);
				throw error;
			}
		},
		renderCall: ((
			args: { code?: unknown },
			theme: CodeModeRenderTheme,
			context: CodeModeRenderContext,
		) =>
			renderExecCall(
				args,
				theme,
				context,
				tracker,
				runtime.useRichRendering(),
			)) as any,
		renderResult: renderResult as any,
	};
}

function createWaitTool(
	runtime: SharedCodeModeRuntime,
	tracker: RenderTracker,
	renderResult: ReturnType<typeof createResultRenderer>,
	waitAttempts: Map<string, number>,
	hooks: Pick<ToolExecutionContext, "preflight" | "completion">,
): ToolDefinition<typeof WAIT_PARAMETERS> {
	const constrainedSampling = getExperimentalToolSampling("wait");
	return {
		name: "wait",
		label: "Wait",
		description: WAIT_DESCRIPTION,
		promptSnippet: "Resume or terminate an exec cell",
		parameters: WAIT_PARAMETERS,
		...(constrainedSampling ? { constrainedSampling } : {}),
		async execute(id, params, signal, onUpdate, ctx) {
			tracker.start(id);
			try {
				const client = await runtime.getClient(ctx);
				const context = { cwd: ctx.cwd, toolCallId: id, extensionContext: ctx, ...hooks, onUpdate };
				const attempt = waitAttempts.get(params.cell_id) ?? 0;
				const response = params.terminate
					? await client.terminate(params.cell_id, context, signal)
					: await client.wait(
							params.cell_id,
							adaptiveWaitMs(params.yield_time_ms ?? DEFAULT_WAIT_MS, attempt),
							context,
							signal,
						);
				if (response.kind === "yielded")
					waitAttempts.set(params.cell_id, attempt + 1);
				else waitAttempts.delete(params.cell_id);
				tracker.finish(
					id,
					response.kind === "yielded" ? "yielded" : "done",
				);
				return toCodeModeToolResult(response, params.max_tokens);
			} catch (error) {
				waitAttempts.delete(params.cell_id);
				tracker.finish(id);
				throw error;
			}
		},
		renderCall: ((
			args: { cell_id?: unknown; terminate?: unknown },
			theme: CodeModeRenderTheme,
			context: CodeModeRenderContext,
		) =>
			renderWaitCall(
				args,
				theme,
				context,
				tracker,
				runtime.useRichRendering(),
			)) as any,
		renderResult: renderResult as any,
	};
}

function adaptiveWaitMs(requestedMs: number, previousIncompleteWaits: number): number {
	const multiplier = 2 ** previousIncompleteWaits;
	const grown = requestedMs * multiplier * 2;
	const adaptive = Math.min(MAX_ADAPTIVE_WAIT_MS, Math.max(MIN_ADAPTIVE_WAIT_MS * multiplier, grown));
	return Math.max(requestedMs, adaptive);
}

function createResultRenderer(
	runtime: SharedCodeModeRuntime,
	tracker: RenderTracker,
) {
	return (
		result: Parameters<typeof renderTrackedCodeModeResult>[0],
		options: Parameters<typeof renderTrackedCodeModeResult>[1],
		theme: CodeModeRenderTheme,
		context: CodeModeRenderContext,
	) =>
		renderTrackedCodeModeResult(
			result,
			options,
			theme,
			context,
			tracker,
			runtime.renderStore,
			runtime.collectRenderTools(),
			runtime.useRichRendering(),
			runtime.useMinimalOutput(),
		);
}
