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
}

const providerName = process.env.PI_LLAMA_SWAP_PROVIDER ?? "llama-cpp";
const baseUrl = process.env.PI_LLAMA_SWAP_BASE_URL ?? "http://127.0.0.1:8080/v1";
const apiKey = process.env.PI_LLAMA_SWAP_API_KEY ?? "none";
const defaultContextWindow = Number(process.env.PI_LLAMA_SWAP_DEFAULT_CTX ?? "128000");
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
	const payload = await fetchJson<OpenAIModelList>(`${normalizeBaseUrl(url)}/models`);
	const ids = (payload.data ?? []).map((m) => m.id?.trim()).filter((id): id is string => !!id);
	return [...new Set(ids)].sort();
}

function sanitizeContextWindow(value: number | undefined): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
	return Math.floor(value);
}

async function fetchContextByModel(swapRootUrl: string): Promise<Map<string, number>> {
	const map = new Map<string, number>();
	const running = await fetchJson<LlamaSwapRunningResponse>(`${swapRootUrl}/running`);

	for (const entry of running.running ?? []) {
		const modelId = entry.model?.trim();
		const proxy = entry.proxy?.trim();
		if (!modelId || !proxy || entry.state !== "ready") continue;

		try {
			const props = await fetchJson<LlamaCppPropsResponse>(`${normalizeBaseUrl(proxy)}/props`, 3000);
			const nCtx = sanitizeContextWindow(props.default_generation_settings?.n_ctx);
			if (nCtx) map.set(modelId, nCtx);
		} catch {
			// Best effort only. Ignore per-model failures and keep defaults.
		}
	}

	return map;
}

async function syncProviderModels(pi: ExtensionAPI): Promise<{ modelIds: string[]; contextByModel: Map<string, number> }> {
	const modelIds = await fetchModelIds(baseUrl);
	if (modelIds.length === 0) {
		console.warn(`[llama-swap-model-sync] No models returned from ${baseUrl}/models`);
		return { modelIds: [], contextByModel: new Map() };
	}

	const contextByModel = isListModelsCommand
		? new Map<string, number>()
		: await fetchContextByModel(getLlamaSwapRoot(baseUrl)).catch(() => new Map<string, number>());

	pi.registerProvider(providerName, {
		baseUrl,
		apiKey,
		api: "openai-completions",
		models: modelIds.map((id) => ({
			id,
			name: id,
			reasoning: false,
			input: ["text"],
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
	console.log(
		`[llama-swap-model-sync] Registered ${modelIds.length} model(s) for ${providerName} (${withCtx} with detected n_ctx)`,
	);

	return { modelIds, contextByModel };
}

export default async function (pi: ExtensionAPI) {
	try {
		await syncProviderModels(pi);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`[llama-swap-model-sync] Failed initial sync from ${baseUrl}: ${message}`);
	}

	pi.on("model_select", async (event, ctx) => {
		if (isApplyingModelRefresh) return;
		if (event.model.provider !== providerName) return;

		try {
			isApplyingModelRefresh = true;
			await syncProviderModels(pi);

			const refreshed = ctx.modelRegistry.find(providerName, event.model.id);
			if (!refreshed) return;
			if (refreshed.contextWindow === event.model.contextWindow) return;
			if (sameModel(event.model, refreshed)) {
				await pi.setModel(refreshed);
			}
		} catch {
			// Keep current model metadata on transient sync failures.
		} finally {
			isApplyingModelRefresh = false;
		}
	});

	pi.on("message_end", async (event, ctx) => {
		if (isApplyingModelRefresh) return;
		if (ctx.model?.provider !== providerName) return;
		if ((event.message as { role?: string }).role !== "assistant") return;

		try {
			isApplyingModelRefresh = true;
			const current = ctx.model;
			await syncProviderModels(pi);

			if (!current) return;
			const refreshed = ctx.modelRegistry.find(providerName, current.id);
			if (!refreshed) return;
			if (refreshed.contextWindow === current.contextWindow) return;
			if (sameModel(current, refreshed)) {
				await pi.setModel(refreshed);
			}
		} catch {
			// Best effort only.
		} finally {
			isApplyingModelRefresh = false;
		}
	});
}
