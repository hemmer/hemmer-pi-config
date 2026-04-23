import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { Model } from "@mariozechner/pi-ai";

interface OpenAIModelList {
	data?: Array<{ id?: string }>;
}

interface LlamaSwapRunningResponse {
	running?: Array<{
		model?: string;
		proxy?: string;
		state?: string;
	}>;
}

interface LlamaCppPropsResponse {
	default_generation_settings?: {
		n_ctx?: number;
	};
	modalities?: unknown;
	capabilities?: unknown;
	input?: unknown;
	vision?: unknown;
	is_multimodal?: unknown;
}

type ModelInput = "text" | "image";

const providerName = process.env.PI_LLAMA_SWAP_PROVIDER ?? "llama-cpp";
const baseUrl = process.env.PI_LLAMA_SWAP_BASE_URL ?? "http://127.0.0.1:8080/v1";
const apiKey = process.env.PI_LLAMA_SWAP_API_KEY ?? "none";
const defaultContextWindow = Number(process.env.PI_LLAMA_SWAP_DEFAULT_CTX ?? "128000");
const diagnosticsEnabled = process.env.PI_LLAMA_SWAP_DIAGNOSTICS === "1";
const modelsTimeoutMs = Number(process.env.PI_LLAMA_SWAP_MODELS_TIMEOUT_MS ?? "5000");
const runningTimeoutMs = Number(process.env.PI_LLAMA_SWAP_RUNNING_TIMEOUT_MS ?? "5000");
const propsTimeoutMs = Number(process.env.PI_LLAMA_SWAP_PROPS_TIMEOUT_MS ?? "3000");
const isListModelsCommand = process.argv.includes("--list-models");

let isApplyingModelRefresh = false;

function normalizeBaseUrl(url: string): string {
	return url.endsWith("/") ? url.slice(0, -1) : url;
}

function getLlamaSwapRoot(url: string): string {
	const normalized = normalizeBaseUrl(url);
	return normalized.endsWith("/v1") ? normalized.slice(0, -3) : normalized;
}

function sameModel(a: Model<any> | undefined, b: Model<any> | undefined): boolean {
	if (!a || !b) return false;
	return a.provider === b.provider && a.id === b.id;
}

function sameInputs(a: Array<string> | undefined, b: Array<string> | undefined): boolean {
	if (!a || !b) return false;
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i += 1) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

function logDiagnostic(message: string): void {
	if (diagnosticsEnabled) console.log(`[llama-swap-model-sync][diag] ${message}`);
}

function modelSupportsVision(model: Model<any> | undefined): boolean {
	if (!model) return false;
	const inputs = Array.isArray(model.input) ? model.input : [];
	return inputs.includes("image");
}

function updateVisionStatus(ctx: any, model?: Model<any>): void {
	const current = model ?? ctx.model;
	if (!current || current.provider !== providerName) {
		ctx.ui.setStatus("llama-swap-vision", undefined);
		return;
	}
	const text = modelSupportsVision(current) ? "text-and-vision" : "text-only";
	ctx.ui.setStatus("llama-swap-vision", ctx.ui.theme.fg("dim", text));
}

async function fetchJson<T>(url: string, timeoutMs = 5000): Promise<T> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(url, {
			signal: controller.signal,
			headers: { Accept: "application/json" },
		});
		if (!response.ok) {
			throw new Error(`HTTP ${response.status} ${response.statusText}`);
		}
		return (await response.json()) as T;
	} finally {
		clearTimeout(timeout);
	}
}

async function fetchModelIds(url: string): Promise<string[]> {
	const payload = await fetchJson<OpenAIModelList>(`${normalizeBaseUrl(url)}/models`, modelsTimeoutMs);
	const ids = (payload.data ?? []).map((m) => m.id?.trim()).filter((id): id is string => !!id);
	return [...new Set(ids)].sort();
}

function parseInputsFromProps(props: LlamaCppPropsResponse): ModelInput[] {
	const inputs = new Set<ModelInput>(["text"]);
	const candidates: unknown[] = [props.modalities, props.capabilities, props.input, props.vision];

	for (const candidate of candidates) {
		const values: string[] = [];
		if (typeof candidate === "string") {
			values.push(candidate);
		} else if (Array.isArray(candidate)) {
			for (const value of candidate) {
				if (typeof value === "string") values.push(value);
			}
		} else if (candidate && typeof candidate === "object") {
			for (const key of Object.keys(candidate as Record<string, unknown>)) {
				values.push(key);
			}
		}

		const normalized = new Set(values.map((value) => value.trim().toLowerCase()));
		if (
			normalized.has("vision") ||
			normalized.has("image") ||
			normalized.has("images") ||
			normalized.has("multimodal") ||
			normalized.has("multimodal-input")
		) {
			inputs.add("image");
		}
	}

	if (props.vision === true || props.is_multimodal === true) inputs.add("image");

	return [...inputs];
}

function sanitizeContextWindow(value: number | undefined): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
	return Math.floor(value);
}

async function fetchPropsByModel(
	swapRootUrl: string,
): Promise<{ contextByModel: Map<string, number>; inputByModel: Map<string, ModelInput[]> }> {
	const contextByModel = new Map<string, number>();
	const inputByModel = new Map<string, ModelInput[]>();
	const startedAt = Date.now();
	const running = await fetchJson<LlamaSwapRunningResponse>(`${swapRootUrl}/running`, runningTimeoutMs);
	const runningModels = running.running ?? [];
	logDiagnostic(`Fetched /running from ${swapRootUrl} (${runningModels.length} entry/entries)`);

	let readyCount = 0;
	let propsSuccessCount = 0;
	let propsTimeoutCount = 0;
	let propsErrorCount = 0;

	for (const entry of runningModels) {
		const modelId = entry.model?.trim();
		const proxy = entry.proxy?.trim();
		if (!modelId || !proxy || entry.state !== "ready") continue;
		readyCount += 1;

		const modelStartedAt = Date.now();
		const upstreamUrl = `${normalizeBaseUrl(swapRootUrl)}/upstream/${modelId}/props`;
		const proxyUrl = `${normalizeBaseUrl(proxy)}/props`;
		logDiagnostic(`Fetching props for ${modelId} via ${upstreamUrl} (fallback ${proxyUrl})`);

		try {
			let props: LlamaCppPropsResponse;
			let usedUrl = upstreamUrl;
			try {
				props = await fetchJson<LlamaCppPropsResponse>(upstreamUrl, propsTimeoutMs);
			} catch (upstreamError) {
				usedUrl = proxyUrl;
				logDiagnostic(
					`Upstream props failed for ${modelId} (${upstreamUrl}): ${upstreamError instanceof Error ? `${upstreamError.name}: ${upstreamError.message}` : String(upstreamError)}; trying proxy`,
				);
				props = await fetchJson<LlamaCppPropsResponse>(proxyUrl, propsTimeoutMs);
			}

			const nCtx = sanitizeContextWindow(props.default_generation_settings?.n_ctx);
			if (nCtx) contextByModel.set(modelId, nCtx);
			inputByModel.set(modelId, parseInputsFromProps(props));
			propsSuccessCount += 1;
			logDiagnostic(
				`Props for ${modelId} in ${Date.now() - modelStartedAt}ms via ${usedUrl}: n_ctx=${nCtx ?? "<missing>"}, inputs=${inputByModel.get(modelId)?.join(",") ?? "<missing>"}`,
			);
		} catch (error) {
			propsErrorCount += 1;
			const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
			if (error instanceof Error && error.name === "AbortError") {
				propsTimeoutCount += 1;
				console.warn(
					`[llama-swap-model-sync] Timed out fetching props for ${modelId} after ${propsTimeoutMs}ms (${proxy}/props)`,
				);
			} else {
				console.warn(`[llama-swap-model-sync] Failed fetching props for ${modelId} (${proxy}/props): ${message}`);
			}
		}
	}

	console.log(
		`[llama-swap-model-sync] /running scan completed in ${Date.now() - startedAt}ms: ${readyCount} ready, ${propsSuccessCount} props ok, ${propsTimeoutCount} timeouts, ${propsErrorCount} errors`,
	);

	return { contextByModel, inputByModel };
}

async function syncProviderModels(
	pi: ExtensionAPI,
): Promise<{ modelIds: string[]; contextByModel: Map<string, number>; inputByModel: Map<string, ModelInput[]> }> {
	const modelIds = await fetchModelIds(baseUrl);
	if (modelIds.length === 0) {
		console.warn(`[llama-swap-model-sync] No models returned from ${baseUrl}/models`);
		return { modelIds: [], contextByModel: new Map(), inputByModel: new Map() };
	}

	const { contextByModel, inputByModel } = isListModelsCommand
		? { contextByModel: new Map<string, number>(), inputByModel: new Map<string, ModelInput[]>() }
		: await fetchPropsByModel(getLlamaSwapRoot(baseUrl)).catch(() => ({
				contextByModel: new Map<string, number>(),
				inputByModel: new Map<string, ModelInput[]>(),
		  }));

	if (diagnosticsEnabled) {
		for (const id of modelIds) {
			logDiagnostic(`Model ${id}: context=${contextByModel.get(id) ?? defaultContextWindow}, inputs=${(inputByModel.get(id) ?? ["text"]).join(",")}`);
		}
	}

	pi.registerProvider(providerName, {
		baseUrl,
		apiKey,
		api: "openai-completions",
		models: modelIds.map((id) => ({
			id,
			name: id,
			reasoning: false,
			input: inputByModel.get(id) ?? ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: contextByModel.get(id) ?? defaultContextWindow,
			maxTokens: 16384,
			compat: {
				supportsDeveloperRole: false,
				supportsReasoningEffort: false,
			},
		})),
	});

	const withCtx = modelIds.filter((id) => contextByModel.has(id)).length;
	const withVision = modelIds.filter((id) => (inputByModel.get(id) ?? ["text"]).includes("image")).length;
	console.log(
		`[llama-swap-model-sync] Registered ${modelIds.length} model(s) for ${providerName} (${withCtx} with detected n_ctx, ${withVision} with vision)`,
	);

	return { modelIds, contextByModel, inputByModel };
}

export default async function (pi: ExtensionAPI) {
	try {
		await syncProviderModels(pi);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`[llama-swap-model-sync] Failed initial sync from ${baseUrl}: ${message}`);
	}

	pi.on("session_start", async (_event, ctx) => {
		updateVisionStatus(ctx);
	});

	pi.on("model_select", async (event, ctx) => {
		if (isApplyingModelRefresh) return;
		if (event.model.provider !== providerName) {
			updateVisionStatus(ctx, event.model);
			return;
		}

		try {
			isApplyingModelRefresh = true;
			await syncProviderModels(pi);

			const refreshed = ctx.modelRegistry.find(providerName, event.model.id);
			if (!refreshed) return;
			if (
				refreshed.contextWindow === event.model.contextWindow &&
				sameInputs(refreshed.input as string[] | undefined, event.model.input as string[] | undefined)
			)
			{
				updateVisionStatus(ctx, refreshed);
				return;
			}
			if (sameModel(event.model, refreshed)) {
				await pi.setModel(refreshed);
			}
			updateVisionStatus(ctx, refreshed);
		} catch {
			// Keep current model metadata on transient sync failures.
			updateVisionStatus(ctx, event.model);
		} finally {
			isApplyingModelRefresh = false;
		}
	});

	pi.on("message_end", async (event, ctx) => {
		if (isApplyingModelRefresh) return;
		if (ctx.model?.provider !== providerName) return;
		if ((event.message as { role?: string }).role !== "assistant") return;

		let current: Model<any> | undefined;
		try {
			isApplyingModelRefresh = true;
			current = ctx.model;
			await syncProviderModels(pi);

			if (!current) return;
			const refreshed = ctx.modelRegistry.find(providerName, current.id);
			if (!refreshed) return;
			if (
				refreshed.contextWindow === current.contextWindow &&
				sameInputs(refreshed.input as string[] | undefined, current.input as string[] | undefined)
			)
			{
				updateVisionStatus(ctx, refreshed);
				return;
			}
			if (sameModel(current, refreshed)) {
				await pi.setModel(refreshed);
			}
			updateVisionStatus(ctx, refreshed);
		} catch {
			// Best effort only.
			updateVisionStatus(ctx, current);
		} finally {
			isApplyingModelRefresh = false;
		}
	});
}
