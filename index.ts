import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import {
	Container,
	Key,
	matchesKey,
	SelectList,
	Spacer,
	Text,
	truncateToWidth,
	visibleWidth,
	type SelectItem,
} from "@mariozechner/pi-tui";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type Preset = "full" | "compact" | "ultra";

type Layout = "classic" | "sessionFirst";
type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

type StatusSelectionMode = "auto" | "allowlist" | "blocklist";

type StatusSelectionConfig = {
	/** How to select which extension status keys appear in this segment. */
	mode?: StatusSelectionMode;
	/** Glob patterns. Example: ["pi-*", "govern"]. */
	allow?: string[];
	/** Glob patterns to hide. */
	block?: string[];
	/** Glob patterns to sort first (in order). */
	priority?: string[];
	/** Max visible statuses (in text mode). */
	maxVisible?: number;
};

type OnelinerStatusConfig = {
	/** Enable/disable statuses in the footer. If unset, falls back to legacy showStatuses. */
	enabled?: boolean;
	/** Selection rules for classic layout (status segment in the main line). */
	classic?: StatusSelectionConfig;
	/** Selection rules for sessionFirst right-side block. */
	right?: StatusSelectionConfig;
	/** Preserve symbol glyphs (e.g. ○◔◑◕●). Default: keep. */
	preserveSymbols?: "strip" | "keep";
	/** Keys (glob) that must preserve symbols even if preserveSymbols=strip. */
	preserveSymbolsKeys?: string[];
};

type OnelinerConfig = {
	preset?: Preset;
	/** Layout of segments. */
	layout?: Layout;
	/** When layout is sessionFirst, show the last two cwd segments (e.g. "code\pi") instead of the full path. */
	shortCwd?: boolean;
	maxSessionLen?: number;
	maxBranchLen?: number;
	maxCwdLen?: number;
	pollGitMs?: number;
	/** Legacy toggle (kept for backwards compatibility). Prefer status.enabled. */
	showStatuses?: boolean;
	/** New status routing + sanitization policy (no hardcoded extension keys). */
	status?: OnelinerStatusConfig;
	/** If set, registers a shortcut that cycles presets: full -> compact -> ultra */
	cycleKey?: string;
	/** Model alias overrides. Key supports '*' wildcard (simple glob). Example: "openai-codex/gpt-5.3*": "5.3c" */
	modelAliases?: Record<string, string>;
};

const CONFIG_PATH = join(homedir(), ".pi", "agent", "oneliner.json");

const DEFAULT_CONFIG: Required<Pick<
	OnelinerConfig,
	"preset" | "layout" | "shortCwd" | "maxSessionLen" | "maxBranchLen" | "maxCwdLen" | "pollGitMs" | "showStatuses" | "status" | "modelAliases"
>> = {
	preset: "full",
	layout: "sessionFirst",
	shortCwd: true,
	maxSessionLen: 18,
	maxBranchLen: 26,
	maxCwdLen: 28,
	pollGitMs: 1500,
	showStatuses: true,
	status: {
		enabled: true,
		classic: { mode: "auto" },
		right: { mode: "auto" },
		preserveSymbols: "keep",
		preserveSymbolsKeys: [],
	},
	modelAliases: {},
};

// --- i18n (optional; integrates with pi-i18n if installed) ---
// oneliner must remain usable without pi-i18n, so we keep an English fallback.

type PiI18nApi = {
	getLocale(): string;
	t(fullKey: string, params?: Record<string, string | number>): string;
	registerBundle(bundle: any): { ok: boolean; errors: string[] };
};

const ONELINER_BASE_DIR = dirname(fileURLToPath(import.meta.url));

const ONELINER_EN_BUNDLE = (() => {
	try {
		return JSON.parse(readFileSync(join(ONELINER_BASE_DIR, "locales", "en.json"), "utf-8")) as {
			messages?: Record<string, any>;
		};
	} catch {
		return { messages: {} };
	}
})();


function formatTemplate(template: string, params?: Record<string, string | number>): string {
	if (!params) return template;
	return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, name: string) => {
		const v = params[name];
		return v === undefined || v === null ? `{${name}}` : String(v);
	});
}

function fallbackT(key: string, params?: Record<string, string | number>): string {
	const raw = (ONELINER_EN_BUNDLE.messages ?? {})[key];
	if (typeof raw === "string") return formatTemplate(raw, params);
	if (raw && typeof raw === "object" && typeof raw.value === "string") return formatTemplate(raw.value, params);
	return key;
}

function requestPiI18n(pi: ExtensionAPI): PiI18nApi | null {
	let api: PiI18nApi | null = null;
	try {
		pi.events.emit("pi-i18n/requestApi", {
			reply: (a: PiI18nApi) => {
				api = a;
			},
		});
	} catch {
		// ignore
	}
	return api;
}

function registerOnelinerBundles(api: PiI18nApi): void {
	try {
		const dir = join(ONELINER_BASE_DIR, "locales");
		const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".json")).sort();
		for (const f of files) {
			try {
				api.registerBundle(JSON.parse(readFileSync(join(dir, f), "utf-8")));
			} catch {
				// ignore invalid bundle
			}
		}
	} catch {
		// ignore
	}
}

function readConfigFile(): OnelinerConfig {
	try {
		if (existsSync(CONFIG_PATH)) return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as OnelinerConfig;
		return {};
	} catch {
		return {};
	}
}

function resolveConfig(): OnelinerConfig & typeof DEFAULT_CONFIG {
	const fileCfg = readConfigFile();
	const envPreset = process.env.PI_ONELINER_PRESET;
	const preset: Preset | undefined =
		envPreset === "full" || envPreset === "compact" || envPreset === "ultra" ? envPreset : undefined;

	const mergedStatus: OnelinerStatusConfig = {
		...(DEFAULT_CONFIG.status ?? {}),
		...(fileCfg.status ?? {}),
		classic: { ...(DEFAULT_CONFIG.status?.classic ?? {}), ...(fileCfg.status?.classic ?? {}) },
		right: { ...(DEFAULT_CONFIG.status?.right ?? {}), ...(fileCfg.status?.right ?? {}) },
		preserveSymbolsKeys: [
			...((DEFAULT_CONFIG.status?.preserveSymbolsKeys ?? []) as string[]),
			...((fileCfg.status?.preserveSymbolsKeys ?? []) as string[]),
		],
	};

	return {
		...DEFAULT_CONFIG,
		...fileCfg,
		...(preset ? { preset } : {}),
		status: mergedStatus,
		modelAliases: { ...DEFAULT_CONFIG.modelAliases, ...(fileCfg.modelAliases ?? {}) },
	};
}

function stripAnsi(text: string): string {
	return text
		// CSI sequences, e.g. \x1b[38;2;139;133;124m
		.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
		// OSC sequences, e.g. \x1b]8;;url\x07 ... \x1b]8;;\x07
		.replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, "")
		// Single-character escapes
		.replace(/\x1B[@-_]/g, "");
}

function sanitizeInline(text: string): string {
	return stripAnsi(text)
		.replace(/[\r\n\t]/g, " ")
		.replace(/\p{C}+/gu, " ") // control chars
		.replace(/ +/g, " ")
		.trim();
}

function sanitizeStatusInline(text: string): string {
	// Text-only status segment: strip emoji/pictographs and most standalone symbols.
	let s = sanitizeInline(text);
	try {
		s = s.replace(/[\p{Extended_Pictographic}\p{So}\p{Sk}]+/gu, "");
	} catch {
		// Fallback: keep basic ASCII only.
		s = s.replace(/[^\x20-\x7E]+/g, "");
	}
	return s.replace(/ +/g, " ").trim();
}

function localeBadge(locale: string | undefined, _maxWidth?: number): string {
	// Footer should be glanceable in multi-window layouts: keep locale to 1–2 chars.
	const raw = String(locale ?? "en").trim().replace(/_/g, "-");
	const l = raw.toLowerCase();
	const parts = l.split("-").filter(Boolean);
	const lang = parts[0] || "en";
	const region = parts[1] || "";

	// Prefer region hints for common Chinese variants.
	if (lang === "zh") {
		if (region === "tw" || l.includes("hant")) return "Tw";
		if (region === "cn" || l.includes("hans")) return "Cn";
		return "Zh";
	}

	const two = (lang.slice(0, 1).toUpperCase() + lang.slice(1, 2).toLowerCase()).slice(0, 2);
	return two || "En";
}

function clampPct(v: number): number {
	if (!Number.isFinite(v)) return 0;
	return Math.max(0, Math.min(100, v));
}

function pieForPercent(pct: number): string {
	const p = clampPct(pct);
	if (p >= 90) return "●";
	if (p >= 75) return "◕";
	if (p >= 50) return "◑";
	if (p >= 25) return "◔";
	return "○";
}

function pieForThinking(level: ThinkingLevel): string {
	switch (level) {
		case "off":
			return "✕";
		case "minimal":
			return "○";
		case "low":
			return "◔";
		case "medium":
			return "◑";
		case "high":
			return "◕";
		case "xhigh":
			return "●";
	}
}

function thinkingColor(level: ThinkingLevel): "dim" | "text" | "error" {
	switch (level) {
		case "off":
			return "dim";
		case "minimal":
		case "low":
		case "medium":
		case "high":
			return "text";
		case "xhigh":
			return "error";
	}
}

function isThinkingBold(level: ThinkingLevel): boolean {
	return level === "xhigh";
}

function globToRegex(pattern: string): RegExp {
	// Very small glob: '*' matches any substring.
	// Escape regex special chars, then expand '*'.
	const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const regex = `^${escaped.replace(/\\\*/g, ".*")}$`;
	return new RegExp(regex);
}

const _aliasByFullId = new Map<string, string>();
const _fullIdByAlias = new Map<string, string>();

function resetAliasCache(): void {
	_aliasByFullId.clear();
	_fullIdByAlias.clear();
}

function shortStableTag(input: string): string {
	let h = 2166136261 >>> 0; // FNV-1a-ish
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i);
		h = Math.imul(h, 16777619) >>> 0;
	}
	return (h >>> 0).toString(36).slice(0, 3);
}

function ensureUniqueAlias(fullId: string, baseAlias: string): string {
	const existing = _aliasByFullId.get(fullId);
	if (existing) return existing;

	const base = baseAlias || "model";
	let candidate = base;
	let owner = _fullIdByAlias.get(candidate);
	if (owner && owner !== fullId) {
		candidate = `${base}-${shortStableTag(fullId)}`;
		owner = _fullIdByAlias.get(candidate);
		let n = 2;
		while (owner && owner !== fullId) {
			candidate = `${base}-${shortStableTag(`${fullId}-${n}`)}`;
			owner = _fullIdByAlias.get(candidate);
			n++;
		}
	}

	_aliasByFullId.set(fullId, candidate);
	_fullIdByAlias.set(candidate, fullId);
	return candidate;
}

function resolveModelAlias(
	model: { provider?: string; id?: string; name?: string } | undefined,
	config: OnelinerConfig & typeof DEFAULT_CONFIG,
): string {
	if (!model) return "no-model";

	const provider = model.provider ?? "";
	const modelId = model.id ?? "";
	const modelName = model.name ?? "";
	const fullId = `${provider}/${modelId}`;

	// 1) Explicit overrides (glob match) with uniqueness guarantee.
	for (const [pattern, alias] of Object.entries(config.modelAliases)) {
		try {
			if (globToRegex(pattern).test(fullId)) return ensureUniqueAlias(fullId, alias);
		} catch {
			// ignore invalid patterns
		}
	}

	// 2) GPT mapping with strict flavor detection.
	// IMPORTANT: provider name must NOT force "c".
	// We only append:
	// - "c" when model itself is Codex
	// - "m" when model itself is Mini
	// Model name is the primary source of truth. We only fall back to id when name is missing.
	const nameLower = modelName.toLowerCase();
	const idLower = modelId.toLowerCase();
	const versionSource = modelName.trim() ? modelName : modelId;
	const gpt = versionSource.match(/gpt[-\s]?(\d+(?:\.\d+)?)/i) ?? `${modelName} ${modelId}`.match(/gpt[-\s]?(\d+(?:\.\d+)?)/i);
	if (gpt?.[1]) {
		const version = gpt[1];
		const hasName = modelName.trim().length > 0;
		const isCodexModel = hasName ? /\bcodex\b/.test(nameLower) : /(^|[-_\s])codex($|[-_\s])/.test(idLower);
		const isMiniModel = hasName ? /\bmini\b/.test(nameLower) : /(^|[-_\s])mini($|[-_\s])/.test(idLower);
		const suffix = isCodexModel ? "c" : isMiniModel ? "m" : "";
		return ensureUniqueAlias(fullId, `${version}${suffix}`);
	}

	// Claude naming: claude-sonnet-4-... -> sonnet-4
	const claude = modelId.match(/claude-(opus|sonnet)-(\d+)/i) ?? modelName.match(/claude\s+(opus|sonnet)[-\s]?(\d+)/i);
	if (claude?.[1] && claude?.[2]) return ensureUniqueAlias(fullId, `${claude[1].toLowerCase()}-${claude[2]}`);

	// Generic fallback: keep short and informative + uniqueness guarantee.
	const parts = modelId.split("-").filter(Boolean);
	if (parts.length >= 2) return ensureUniqueAlias(fullId, `${parts[parts.length - 2]}-${parts[parts.length - 1]}`);
	return ensureUniqueAlias(fullId, modelId || modelName || "model");
}

function replaceHomeWithTilde(p: string): string {
	const home = process.env.HOME || process.env.USERPROFILE;
	if (home && p.startsWith(home)) return `~${p.slice(home.length)}`;
	return p;
}

function shortCwdDisplay(raw: string): string {
	const trimmed = String(raw ?? "").replace(/[\/]+$/, "");
	if (!trimmed) return trimmed;
	const sep = trimmed.includes("\\") ? "\\" : "/";
	const parts = trimmed.split(/[\/]+/).filter(Boolean);
	if (parts.length >= 2) return parts.slice(-2).join(sep);
	return parts[0] ?? trimmed;
}

function middleTruncatePlain(s: string, maxLen: number): string {
	if (maxLen <= 0) return "";
	if (s.length <= maxLen) return s;
	if (maxLen <= 1) return "…";
	const keep = maxLen - 1;
	const left = Math.ceil(keep / 2);
	const right = Math.floor(keep / 2);
	return `${s.slice(0, left)}…${s.slice(s.length - right)}`;
}

type GitState = {
	dirty: boolean;
	ahead: number;
	behind: number;
};

function runGit(cwd: string, args: string[], timeoutMs: number): { ok: boolean; stdout: string } {
	try {
		const res = spawnSync("git", args, {
			cwd,
			encoding: "utf8",
			timeout: timeoutMs,
			windowsHide: true,
		});
		return { ok: res.status === 0, stdout: (res.stdout || "").toString() };
	} catch {
		return { ok: false, stdout: "" };
	}
}

function refreshGitState(cwd: string, timeoutMs = 600): GitState | null {
	const inside = runGit(cwd, ["rev-parse", "--is-inside-work-tree"], timeoutMs);
	if (!inside.ok || !inside.stdout.trim().startsWith("true")) return null;

	let dirty = false;
	const st = runGit(cwd, ["status", "--porcelain"], timeoutMs);
	if (st.ok) dirty = st.stdout.trim().length > 0;

	let ahead = 0;
	let behind = 0;
	const counts = runGit(cwd, ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], timeoutMs);
	if (counts.ok) {
		const parts = counts.stdout.trim().split(/\s+/);
		if (parts.length >= 2) {
			ahead = Number.parseInt(parts[0] ?? "0", 10) || 0;
			behind = Number.parseInt(parts[1] ?? "0", 10) || 0;
		}
	}

	return { dirty, ahead, behind };
}

function nextPreset(p: Preset): Preset {
	return p === "full" ? "compact" : p === "compact" ? "ultra" : "full";
}

export default function oneliner(pi: ExtensionAPI): void {
	let config = resolveConfig();
	let preset: Preset = config.preset;

	let piI18n: PiI18nApi | null = null;
	let bundlesRegistered = false;

	const bindI18n = () => {
		if (!piI18n) piI18n = requestPiI18n(pi);
		if (piI18n && !bundlesRegistered) {
			registerOnelinerBundles(piI18n);
			bundlesRegistered = true;
		}
	};

	const t = (key: string, params?: Record<string, string | number>) =>
		piI18n ? piI18n.t(`ext.oneliner.${key}`, params) : fallbackT(key, params);

	const onOff = (on: boolean) => (on ? t("state.on") : t("state.off"));

	bindI18n();

	function writeConfigPatch(patch: Partial<OnelinerConfig>): { success: boolean; error?: string } {
		try {
			let base: Record<string, unknown> = {};
			if (existsSync(CONFIG_PATH)) {
				base = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as Record<string, unknown>;
			}

			const next: Record<string, unknown> = { ...base, ...patch };
			// Merge modelAliases
			const baseAliases = (base.modelAliases as Record<string, string> | undefined) ?? {};
			const patchAliases = patch.modelAliases ?? {};
			next.modelAliases = { ...baseAliases, ...patchAliases };

			writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + "\n", "utf-8");
			return { success: true };
		} catch (e) {
			return { success: false, error: String(e) };
		}
	}

	function applyZenMode(ctx: any): void {
		preset = "compact";
		config.showStatuses = false;
		ctx.ui.notify(t("notify.zenApplied"), "info");
	}

	function runDoctor(ctx: any): void {
		const problems: string[] = [];
		if (!existsSync(CONFIG_PATH)) problems.push(t("doctor.problem.configMissing"));
		const poll = Number(config.pollGitMs ?? DEFAULT_CONFIG.pollGitMs);
		if (!Number.isFinite(poll) || poll < 500) problems.push(t("doctor.problem.pollTooLow"));
		if (!["full", "compact", "ultra"].includes(String(config.preset))) problems.push(t("doctor.problem.presetInvalid"));

		if (problems.length === 0) {
			ctx.ui.notify(t("doctor.healthy", { preset, state: onOff(config.showStatuses) }), "info");
			return;
		}

		ctx.ui.notify(t("doctor.issues", { count: problems.length }), "warning");
		for (const p of problems.slice(0, 4)) ctx.ui.notify(`- ${p}`, "warning");
	}

	async function showHelp(ctx: any): Promise<void> {
		if (!ctx.hasUI) return;

		await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
			const c = new Container();
			c.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
			c.addChild(new Text(theme.fg("accent", theme.bold(t("help.title"))), 1, 0));
			c.addChild(new Spacer(1));
			c.addChild(new Text(theme.fg("muted", t("help.happyPath")), 1, 0));
			c.addChild(new Text(theme.fg("text", t("help.line.ui")), 1, 0));
			c.addChild(new Text(theme.fg("text", t("help.line.save")), 1, 0));
			c.addChild(new Spacer(1));
			c.addChild(new Text(theme.fg("muted", t("help.other")), 1, 0));
			c.addChild(new Text(theme.fg("text", t("help.line.presets")), 1, 0));
			c.addChild(new Text(theme.fg("text", t("help.line.misc")), 1, 0));
			c.addChild(new Text(theme.fg("text", t("help.line.reload")), 1, 0));
			c.addChild(new Text(theme.fg("text", t("help.line.init")), 1, 0));
			c.addChild(new Spacer(1));
			c.addChild(new Text(theme.fg("dim", t("help.configPath", { path: CONFIG_PATH })), 1, 0));
			c.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
			c.addChild(new Text(theme.fg("dim", t("help.closeHint")), 1, 0));

			return {
				render: (w: number) => c.render(w),
				invalidate: () => c.invalidate(),
				handleInput: (data: string) => {
					if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape)) done(undefined);
				},
			};
		});
	}

	async function openPicker(ctx: any): Promise<void> {
		if (!ctx.hasUI) return;

		const action = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
			const currentSuffix = (isCurrent: boolean) => (isCurrent ? ` ${t("picker.current")}` : "");

			const items: SelectItem[] = [
				{
					value: "preset:full",
					label: t("picker.preset.full.label", { current: currentSuffix(preset === "full") }),
					description: t("picker.preset.full.desc"),
				},
				{
					value: "preset:compact",
					label: t("picker.preset.compact.label", { current: currentSuffix(preset === "compact") }),
					description: t("picker.preset.compact.desc"),
				},
				{
					value: "preset:ultra",
					label: t("picker.preset.ultra.label", { current: currentSuffix(preset === "ultra") }),
					description: t("picker.preset.ultra.desc"),
				},
				{
					value: "toggle-statuses",
					label: t("picker.statuses.label", { state: onOff(config.showStatuses) }),
					description: t("picker.statuses.desc"),
				},
				{
					value: "zen",
					label: t("picker.zen.label"),
					description: t("picker.zen.desc"),
				},
				{
					value: "doctor",
					label: t("picker.doctor.label"),
					description: t("picker.doctor.desc"),
				},
				{
					value: "save",
					label: t("picker.save.label"),
					description: t("picker.save.desc"),
				},
				{
					value: "reload",
					label: t("picker.reload.label"),
					description: t("picker.reload.desc"),
				},
				{
					value: "help",
					label: t("picker.help.label"),
					description: t("picker.help.desc"),
				},
			];

			if (!existsSync(CONFIG_PATH)) {
				items.splice(4, 0, {
					value: "init-config",
					label: t("picker.init.label"),
					description: t("picker.init.desc"),
				});
			}

			const c = new Container();
			c.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
			c.addChild(new Text(theme.fg("accent", theme.bold(t("picker.title"))), 1, 0));
			c.addChild(new Text(theme.fg("muted", t("picker.subtitle")), 1, 0));
			c.addChild(new Spacer(1));

			const list = new SelectList(items, Math.min(items.length, 9), {
				selectedPrefix: (t) => theme.fg("accent", t),
				selectedText: (t) => theme.fg("accent", t),
				description: (t) => theme.fg("muted", t),
				scrollInfo: (t) => theme.fg("dim", t),
				noMatch: (t) => theme.fg("warning", t),
			});
			list.onSelect = (item) => done(item.value);
			list.onCancel = () => done(null);
			c.addChild(list);
			c.addChild(new Spacer(1));
			c.addChild(new Text(theme.fg("dim", t("picker.navHint")), 1, 0));
			c.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

			return {
				render: (w: number) => c.render(w),
				invalidate: () => c.invalidate(),
				handleInput: (data: string) => {
					list.handleInput?.(data);
					tui.requestRender();
				},
			};
		});

		if (!action) return;

		if (action.startsWith("preset:")) {
			const p = action.split(":", 2)[1] as Preset | undefined;
			if (p === "full" || p === "compact" || p === "ultra") {
				preset = p;
				ctx.ui.notify(t("notify.preset", { preset }), "info");
			}
			return;
		}

		switch (action) {
			case "toggle-statuses": {
				config.showStatuses = !config.showStatuses;
				ctx.ui.notify(t("notify.statuses", { state: onOff(config.showStatuses) }), "info");
				return;
			}
			case "zen": {
				applyZenMode(ctx);
				return;
			}
			case "doctor": {
				runDoctor(ctx);
				return;
			}
			case "init-config": {
				if (!existsSync(CONFIG_PATH)) {
					const res = writeConfigPatch({
						preset: "full",
						maxSessionLen: 18,
						maxBranchLen: 26,
						maxCwdLen: 28,
						pollGitMs: 1500,
						showStatuses: true,
						modelAliases: { "openai-codex/gpt-5.3*": "5.3c" },
					});
					if (!res.success) {
						ctx.ui.notify(t("notify.failedWriteConfig", { error: String(res.error ?? "") }), "error");
					} else {
						config = resolveConfig();
						preset = config.preset;
						resetAliasCache();
						ctx.ui.notify(t("notify.wrote", { path: CONFIG_PATH }), "info");
					}
				} else {
					ctx.ui.notify(t("notify.configAlreadyExists", { path: CONFIG_PATH }), "info");
				}
				return;
			}
			case "save": {
				const res = writeConfigPatch({
					preset,
					showStatuses: config.showStatuses,
					maxSessionLen: config.maxSessionLen,
					maxBranchLen: config.maxBranchLen,
					maxCwdLen: config.maxCwdLen,
					pollGitMs: config.pollGitMs,
					modelAliases: config.modelAliases,
				});
				if (!res.success) {
					ctx.ui.notify(t("notify.failedSave", { error: String(res.error ?? "") }), "error");
				} else {
					config = resolveConfig();
					preset = config.preset;
					resetAliasCache();
					ctx.ui.notify(t("notify.saved", { path: CONFIG_PATH }), "info");
				}
				return;
			}
			case "reload": {
				config = resolveConfig();
				preset = config.preset;
				resetAliasCache();
				ctx.ui.notify(t("notify.reloaded", { preset }), "info");
				return;
			}
			case "help": {
				await showHelp(ctx);
				return;
			}
		}
	}

	// Optional preset cycle shortcut (read at load time; change requires /reload).
	if (config.cycleKey) {
		pi.registerShortcut(config.cycleKey, {
			description: "oneliner: cycle footer preset (full/compact/ultra)",
			handler: async (ctx) => {
				preset = nextPreset(preset);
				ctx.ui?.notify?.(t("notify.preset", { preset }), "info");
			},
		});
	}

	const commandHandler = async (args: string, ctx: any) => {
		const a = args.trim();

		// Happy path: no args opens the picker UI.
		if (!a || a === "ui") {
			await openPicker(ctx);
			return;
		}

		if (a === "help" || a === "?" || a === "h") {
			await showHelp(ctx);
			return;
		}

		if (a === "show" || a === "status") {
			ctx.ui.notify(t("notify.show", { preset, state: onOff(config.showStatuses) }), "info");
			return;
		}

		if (a === "toggle") {
			preset = nextPreset(preset);
			ctx.ui.notify(t("notify.preset", { preset }), "info");
			return;
		}

		if (a === "full" || a === "compact" || a === "ultra") {
			preset = a;
			ctx.ui.notify(t("notify.preset", { preset }), "info");
			return;
		}

		if (a === "statuses") {
			config.showStatuses = !config.showStatuses;
			ctx.ui.notify(t("notify.statuses", { state: onOff(config.showStatuses) }), "info");
			return;
		}

		if (a === "zen") {
			applyZenMode(ctx);
			return;
		}

		if (a === "doctor") {
			runDoctor(ctx);
			return;
		}

		if (a === "save" || a === "persist") {
			const res = writeConfigPatch({
				preset,
				showStatuses: config.showStatuses,
				maxSessionLen: config.maxSessionLen,
				maxBranchLen: config.maxBranchLen,
				maxCwdLen: config.maxCwdLen,
				pollGitMs: config.pollGitMs,
				modelAliases: config.modelAliases,
			});
			if (!res.success) {
				ctx.ui.notify(t("notify.failedSave", { error: String(res.error ?? "") }), "error");
			} else {
				config = resolveConfig();
				preset = config.preset;
				resetAliasCache();
				ctx.ui.notify(t("notify.saved", { path: CONFIG_PATH }), "info");
			}
			return;
		}

		if (a === "reload") {
			config = resolveConfig();
			preset = config.preset;
			resetAliasCache();
			ctx.ui.notify(t("notify.reloaded", { preset }), "info");
			return;
		}

		if (a === "init-config") {
			if (!existsSync(CONFIG_PATH)) {
				const res = writeConfigPatch({
					preset: "full",
					maxSessionLen: 18,
					maxBranchLen: 26,
					maxCwdLen: 28,
					pollGitMs: 1500,
					showStatuses: true,
					modelAliases: { "openai-codex/gpt-5.3*": "5.3c" },
				});
				if (!res.success) {
					ctx.ui.notify(t("notify.failedWriteConfig", { error: String(res.error ?? "") }), "error");
				} else {
					config = resolveConfig();
					preset = config.preset;
					resetAliasCache();
					ctx.ui.notify(t("notify.wrote", { path: CONFIG_PATH }), "info");
				}
			} else {
				ctx.ui.notify(t("notify.configAlreadyExists", { path: CONFIG_PATH }), "info");
			}
			return;
		}

		ctx.ui.notify(t("usage"), "info");
	};

	pi.registerCommand("oneliner", {
		description: t("command.description"),
		handler: commandHandler,
	});


	pi.on("session_start", (_event, ctx) => {
		bindI18n();
		if (!ctx.hasUI) return;

		ctx.ui.setFooter((tui, theme, footerData) => {
			let lastGit: GitState | null = null;
			let lastGitAt = 0;
			let disposed = false;

			const updateGit = (reason: string) => {
				if (disposed) return;
				const cwd = ctx.sessionManager.getCwd();
				const branch = footerData.getGitBranch();

				if (!branch) {
					if (lastGit !== null) {
						lastGit = null;
						tui.requestRender();
					}
					return;
				}

				const next = refreshGitState(cwd);
				lastGitAt = Date.now();
				// If refresh fails, keep old values (better than flicker).
				if (!next) {
					if (reason === "branch-change") tui.requestRender();
					return;
				}

				const changed =
					lastGit === null ||
					lastGit.dirty !== next.dirty ||
					lastGit.ahead !== next.ahead ||
					lastGit.behind !== next.behind;
				lastGit = next;
				if (changed) tui.requestRender();
			};

			// Keep git state fresh (poll), but avoid running git on every render.
			updateGit("init");
			let currentPollMs = Math.max(500, config.pollGitMs ?? DEFAULT_CONFIG.pollGitMs);
			let interval = setInterval(() => {
				const now = Date.now();
				if (now - lastGitAt < currentPollMs) return;
				updateGit("poll");
			}, currentPollMs);

			const unsubBranch = footerData.onBranchChange(() => {
				updateGit("branch-change");
			});

			// Re-render immediately when pi-i18n switches locale.
			let lastLocale = piI18n?.getLocale?.() ?? "en";
			const unsubLocale = pi.events.on("pi-i18n/localeChanged", (payload: any) => {
				if (disposed) return;
				bindI18n();
				lastLocale = String(payload?.locale ?? piI18n?.getLocale?.() ?? lastLocale ?? "en");
				tui.requestRender();
			});

			const buildGitSegment = (widthHint: number, options: { includeCounts: boolean; maxBranchLen: number }): string | null => {
				const branch = footerData.getGitBranch();
				if (!branch) return null;

				const state = lastGit;
				const dirty = state?.dirty ?? false;
				const ahead = options.includeCounts ? state?.ahead ?? 0 : 0;
				const behind = options.includeCounts ? state?.behind ?? 0 : 0;

				const branchName = middleTruncatePlain(branch, options.maxBranchLen);
				const branchColor = dirty ? "warning" : "success";

				let s = theme.fg("dim", "⎇") + " " + theme.fg(branchColor, branchName);
				if (dirty) s += theme.fg("warning", " *");
				if (ahead) s += theme.fg("success", ` ↑${ahead}`);
				if (behind) s += theme.fg("error", ` ↓${behind}`);

				return truncateToWidth(s, widthHint);
			};

			const buildStatusesSegment = (
				widthHint: number,
				mode: "text" | "count" | "none",
				opts?: { maxVisible?: number; selection?: StatusSelectionConfig },
			): string | null => {
				const statusCfg = config.status ?? DEFAULT_CONFIG.status;
				const enabled = statusCfg.enabled ?? config.showStatuses ?? true;
				if (!enabled) return null;
				const statuses = footerData.getExtensionStatuses();
				if (statuses.size === 0) return null;
				if (mode === "none") return null;

				const sel = opts?.selection;
				const selMode: StatusSelectionMode = sel?.mode ?? "auto";
				const allow = (sel?.allow ?? []).map((x) => String(x));
				const block = (sel?.block ?? []).map((x) => String(x));
				const priority = (sel?.priority ?? []).map((x) => String(x));

				const compile = (patterns: string[]): RegExp[] => patterns.map((p) => globToRegex(p));
				const allowRx = compile(allow);
				const blockRx = compile(block);
				const prioRx = compile(priority);
				const preserveSymbolsRx = compile(statusCfg.preserveSymbolsKeys ?? []);

				const matchesAny = (rxs: RegExp[], keyLower: string): boolean => rxs.some((r) => r.test(keyLower));
				const prioRank = (keyLower: string): number => {
					for (let i = 0; i < prioRx.length; i++) {
						if (prioRx[i]?.test(keyLower)) return i;
					}
					return Number.POSITIVE_INFINITY;
				};

				const keepSymbolsDefault = (statusCfg.preserveSymbols ?? "keep") === "keep";
				const keepSymbolsForKey = (keyLower: string): boolean => keepSymbolsDefault || matchesAny(preserveSymbolsRx, keyLower);

				let entries = Array.from(statuses.entries())
					.map(([k, v]) => {
						const key = sanitizeInline(String(k ?? ""));
						const keyLower = key.toLowerCase();
						const raw = String(v ?? "");
						const value = keepSymbolsForKey(keyLower) ? sanitizeInline(raw) : sanitizeStatusInline(raw);
						return [key, value] as const;
					})
					.filter(([, v]) => Boolean(v));
				if (entries.length === 0) return null;

				// Selection (no hardcoded extension keys)
				entries = entries.filter(([k]) => {
					const keyLower = String(k).toLowerCase();
					if (selMode === "allowlist") return allowRx.length > 0 ? matchesAny(allowRx, keyLower) : false;
					if (selMode === "blocklist") return blockRx.length > 0 ? !matchesAny(blockRx, keyLower) : true;
					// auto
					if (blockRx.length > 0 && matchesAny(blockRx, keyLower)) return false;
					return true;
				});
				if (entries.length === 0) return null;

				// Sort by user priority patterns, then by key
				entries = entries.sort((a, b) => {
					const ak = a[0].toLowerCase();
					const bk = b[0].toLowerCase();
					const ar = prioRank(ak);
					const br = prioRank(bk);
					if (ar != br) return ar - br;
					return ak.localeCompare(bk);
				});

				const renderOne = (_key: string, text: string): string => {
					const maxStatus = 18;
					const short = text.length <= maxStatus ? text : `${text.slice(0, maxStatus - 1)}…`;
					const glyph = short.trim().charAt(0);

					// Generic glyph coloring (no extension hardcoding).
					if (glyph === "×" || glyph === "✕" || glyph === "x" || glyph === "X") return theme.fg("error", theme.bold(short));
					if (glyph === "○") return theme.fg("warning", short);
					if (glyph === "◑") return theme.fg("warning", short);
					if (glyph === "◕" || glyph === "●") return theme.fg("success", short);
					if (glyph === "◔") return theme.fg("text", short);
					return theme.fg("dim", short);
				};

				let rendered = "";
				if (mode === "count") {
					const chosen = entries[0];
					rendered = chosen ? renderOne(chosen[0], chosen[1]) : theme.fg("dim", "0");
				} else {
					const defaultMax = sel?.maxVisible ?? 3;
					const maxVisible = Math.max(1, Math.min(6, opts?.maxVisible ?? defaultMax));
					const visible = entries.slice(0, maxVisible).map(([key, text]) => renderOne(key, text));
					rendered = visible.join(theme.fg("dim", " · "));
				}

				return truncateToWidth(rendered, widthHint);
			};


			const buildThinkingModel = (): string => {
				const thinking = (pi.getThinkingLevel() as ThinkingLevel) ?? "off";
				const pie = pieForThinking(thinking);
				const alias = resolveModelAlias(ctx.model as { provider?: string; id?: string; name?: string } | undefined, config);

				const color = thinkingColor(thinking);
				const raw = `${pie} ${alias}`;
				return isThinkingBold(thinking) ? theme.fg(color, theme.bold(raw)) : theme.fg(color, raw);
			};

			const buildContextGauge = (): string => {
				const usage = ctx.getContextUsage();
				const pct = usage?.percent;
				const pctValue = pct === null || pct === undefined ? null : clampPct(pct);
				const pie = pctValue === null ? "○" : pieForPercent(pctValue);
				const pctText = pctValue === null ? "?%" : `${Math.round(pctValue)}%`;

				const shouldBold = pctValue !== null && pctValue >= 50;
				const color: "success" | "warning" | "error" =
					pctValue !== null && pctValue >= 50 ? "error" : pctValue !== null && pctValue >= 40 ? "warning" : "success";

				const raw = `${pie} ${pctText}`;
				return shouldBold ? theme.fg(color, theme.bold(raw)) : theme.fg(color, raw);
			};

			const buildCwd = (maxCwdLen: number): string => {
				const raw = ctx.sessionManager.getCwd();
				if (config.shortCwd) {
					return theme.fg("accent", shortCwdDisplay(raw));
				}
				let cwd = replaceHomeWithTilde(raw);
				cwd = middleTruncatePlain(cwd, maxCwdLen);
				return theme.fg("accent", cwd);
			};

			const buildSession = (maxSessionLen: number): string | null => {
				let session = ctx.sessionManager.getSessionName();
				session = session ? sanitizeInline(session) : undefined;
				if (!session) return null;
				if (session.length > maxSessionLen) session = `${session.slice(0, Math.max(1, maxSessionLen - 1))}…`;
				return theme.fg("text", session);
			};

			const buildLocation = (maxCwdLen: number, maxSessionLen: number, includeSession: boolean): string => {
				const cwdStyled = buildCwd(maxCwdLen);
				if (!includeSession) return cwdStyled;
				const session = buildSession(maxSessionLen);
				if (session) return `${cwdStyled} ${theme.fg("dim", "•")} ${session}`;
				return cwdStyled;
			};

			const joinLine = (parts: string[], separators: string[]): string => {
				let out = parts[0] ?? "";
				for (let i = 1; i < parts.length; i++) out += (separators[i - 1] ?? " ") + (parts[i] ?? "");
				return out;
			};

			const tryRenderClassic = (opts: {
				sepBetweenLocationAndGit: " ";
				includeGitCounts: boolean;
				includeSession: boolean;
				maxCwdLen: number;
				maxSessionLen: number;
				maxBranchLen: number;
				statusMode: "text" | "count" | "none";
			}): string => {
				const thinkingModel = buildThinkingModel();
				const ctxGauge = buildContextGauge();
				const loc = buildLocation(opts.maxCwdLen, opts.maxSessionLen, opts.includeSession);

				const git = buildGitSegment(10_000, { includeCounts: opts.includeGitCounts, maxBranchLen: opts.maxBranchLen });
				const status = buildStatusesSegment(10_000, opts.statusMode, { selection: config.status?.classic });

				const parts: string[] = [thinkingModel, ctxGauge, loc];
				const seps: string[] = [" ", " "]; // think->ctx, ctx->loc
				if (git) {
					parts.push(git);
					seps.push(opts.sepBetweenLocationAndGit);
				}
				if (status) {
					parts.push(status);
					seps.push(" ");
				}

				return joinLine(parts, seps);
			};

			const tryRenderSessionFirst = (opts: {
				includeContext: boolean;
				includeGitCounts: boolean;
				includeGit: boolean;
				includeCwd: boolean;
				maxCwdLen: number;
				maxSessionLen: number;
				maxBranchLen: number;
			}): string => {
				const session = buildSession(opts.maxSessionLen);
				const thinkingModel = buildThinkingModel();
				const ctxGauge = opts.includeContext ? buildContextGauge() : "";

				const cwd = opts.includeCwd ? buildCwd(opts.maxCwdLen) : "";
				const git = opts.includeGit ? buildGitSegment(10_000, { includeCounts: opts.includeGitCounts, maxBranchLen: opts.maxBranchLen }) : null;

				const parts: string[] = [];
				const seps: string[] = [];

				if (session) parts.push(session);
				parts.push(thinkingModel);
				if (parts.length > 1) seps.push("  ");

				if (ctxGauge) {
					parts.push(ctxGauge);
					seps.push("  ");
				}

				if (cwd) {
					parts.push(cwd);
					seps.push("  ");
				}

				if (git) {
					parts.push(git);
					seps.push(" ");
				}

				return joinLine(parts, seps);
			};

			const fits = (line: string, width: number): boolean => visibleWidth(line) <= width;

			return {
				dispose: () => {
					disposed = true;
					clearInterval(interval);
					unsubBranch();
					try {
						unsubLocale?.();
					} catch {
						// ignore
					}
				},
				invalidate() {},
				render(width: number): string[] {
					bindI18n();
					const activeLocale = piI18n?.getLocale?.() ?? lastLocale;
					const badgeText = localeBadge(activeLocale, width);
					const badge = theme.fg("dim", badgeText);
					const badgeW = visibleWidth(badge);
					if (width <= badgeW) return [truncateToWidth(badge, width, "…")];

					// If poll interval changed (via /oneliner reload), restart timer.
					const desiredPollMs = Math.max(500, config.pollGitMs ?? DEFAULT_CONFIG.pollGitMs);
					if (desiredPollMs !== currentPollMs) {
						currentPollMs = desiredPollMs;
						clearInterval(interval);
						interval = setInterval(() => {
							const now = Date.now();
							if (now - lastGitAt < currentPollMs) return;
							updateGit("poll");
						}, currentPollMs);
					}

					const presetNow: Preset = preset;
					const layoutNow: Layout = config.layout === "classic" ? "classic" : "sessionFirst";
					const includeGitCountsDefault = presetNow !== "ultra";
					const includeContextDefault = presetNow === "full";
					const statusModeDefault: "text" | "count" | "none" = presetNow === "ultra" ? "none" : "text";

					// Right block: in sessionFirst layout, keep statuses on the right before locale.
					let right = badge;
					let reserved = badgeW + 1;
					if (layoutNow === "sessionFirst") {
						const maxStatusW = Math.max(0, Math.min(30, width - badgeW - 2));
						const rightSel = config.status?.right;
						const maxVisible = Math.max(1, Math.min(6, rightSel?.maxVisible ?? (presetNow === "full" ? 3 : presetNow === "compact" ? 2 : 1)));
						const status = maxStatusW > 0 ? buildStatusesSegment(maxStatusW, "text", { selection: rightSel, maxVisible }) : null;
						const rightCandidate = status ? `${status} ${badge}` : badge;
						const rightW = visibleWidth(rightCandidate);
						// If the right block doesn't fit, fall back to locale-only.
						if (rightW + 1 < width) {
							right = rightCandidate;
							reserved = rightW + 1;
						}
					}

					const mainWidth = Math.max(0, width - reserved);

					const candidates: string[] = [];
					if (layoutNow === "sessionFirst") {
						const base = {
							includeContext: includeContextDefault,
							includeGitCounts: includeGitCountsDefault,
							includeGit: true,
							includeCwd: true,
							maxCwdLen: config.maxCwdLen,
							maxSessionLen: config.maxSessionLen,
							maxBranchLen: config.maxBranchLen,
						} as const;
						const add = (o: Partial<Parameters<typeof tryRenderSessionFirst>[0]>) => candidates.push(tryRenderSessionFirst({ ...base, ...o }));
						add({});
						// Drop context first (keep session+model+repo/branch)
						add({ includeContext: false });
						// Drop git counts
						add({ includeGitCounts: false });
						// Tighten session
						add({ maxSessionLen: Math.min(base.maxSessionLen, 12) });
						// Drop git, then cwd
						add({ includeGit: false });
						add({ includeCwd: false });
						add({ maxSessionLen: Math.min(base.maxSessionLen, 8) });
					} else {
						const base = {
							maxCwdLen: config.maxCwdLen,
							maxSessionLen: config.maxSessionLen,
							maxBranchLen: config.maxBranchLen,
							sepBetweenLocationAndGit: " ",
							includeGitCounts: includeGitCountsDefault,
							includeSession: true,
							statusMode: statusModeDefault,
						} as const;
						const add = (o: Partial<Parameters<typeof tryRenderClassic>[0]>) => candidates.push(tryRenderClassic({ ...base, ...o }));
						add({});
						add({ statusMode: "count" });
						add({ statusMode: "none" });
						add({ includeGitCounts: false });
						add({ maxSessionLen: Math.min(base.maxSessionLen, 12) });
						add({ includeSession: false });
						add({ maxCwdLen: Math.min(base.maxCwdLen, 20) });
						add({ maxCwdLen: Math.min(base.maxCwdLen, 14) });
						add({ maxBranchLen: Math.min(base.maxBranchLen, 18) });
						add({ maxBranchLen: Math.min(base.maxBranchLen, 10) });
					}

					let chosen = candidates[0] ?? "";
					for (const c of candidates) {
						if (fits(c, mainWidth)) {
							chosen = c;
							break;
						}
					}

					chosen = truncateToWidth(chosen, mainWidth, "…");
					const pad = " ".repeat(Math.max(0, mainWidth - visibleWidth(chosen)));
					return [chosen + pad + " " + right];
				},
			};
		});
	});
}
