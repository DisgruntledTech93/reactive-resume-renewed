import type { VaultItemContent, VaultItemType } from "@reactive-resume/schema/vault/data";
import type {
	ApplicationAnalysisResult,
	JobRequirement,
	VaultRecommendationSnapshot,
} from "@reactive-resume/schema/vault/intelligence";

type IntelligenceItem = {
	id: string;
	label: string;
	type: VaultItemType;
	version: number;
	content: VaultItemContent;
	keywords: string[];
	technologies: string[];
	industries: string[];
	targetRoles: string[];
	importance: number;
	updatedAt: Date;
};

const STOP_WORDS = new Set([
	"about",
	"after",
	"also",
	"among",
	"and",
	"any",
	"are",
	"because",
	"been",
	"being",
	"but",
	"can",
	"company",
	"day",
	"each",
	"for",
	"from",
	"have",
	"including",
	"into",
	"job",
	"more",
	"must",
	"our",
	"role",
	"should",
	"that",
	"the",
	"their",
	"them",
	"this",
	"through",
	"using",
	"was",
	"will",
	"with",
	"work",
	"years",
	"you",
	"your",
]);

const TECHNOLOGY_ALIASES: Record<string, readonly string[]> = {
	"amazon web services": ["amazon web services", "aws"],
	"artificial intelligence": ["artificial intelligence", "ai"],
	"c sharp": ["c#", "c sharp"],
	"ci/cd": ["ci/cd", "ci cd", "continuous integration", "continuous delivery", "continuous deployment"],
	"google cloud": ["google cloud", "gcp"],
	javascript: ["javascript", "js"],
	kubernetes: ["kubernetes", "k8s"],
	"machine learning": ["machine learning", "ml"],
	"microsoft azure": ["microsoft azure", "azure"],
	"node.js": ["node.js", "nodejs", "node js"],
	postgresql: ["postgresql", "postgres", "psql"],
	react: ["react", "react.js", "reactjs"],
	"rest api": ["rest api", "restful api", "restful services"],
	typescript: ["typescript", "ts"],
};

const KNOWN_TERMS = [
	"accessibility",
	"agile",
	"ansible",
	"api design",
	"automation",
	"bash",
	"cloudflare",
	"communication",
	"customer service",
	"cybersecurity",
	"data analysis",
	"devops",
	"docker",
	"git",
	"github actions",
	"graphql",
	"incident response",
	"infrastructure as code",
	"java",
	"jenkins",
	"leadership",
	"linux",
	"microservices",
	"mongodb",
	"monitoring",
	"mysql",
	"networking",
	"next.js",
	"n8n",
	"php",
	"powershell",
	"problem solving",
	"project management",
	"python",
	"redis",
	"scrum",
	"security",
	"sql",
	"terraform",
	"testing",
	"troubleshooting",
	"wcag",
	"wordpress",
	...Object.keys(TECHNOLOGY_ALIASES),
] as const;

const ALIAS_TO_CANONICAL = new Map<string, string>();
for (const term of KNOWN_TERMS) ALIAS_TO_CANONICAL.set(term, term);
for (const [canonical, aliases] of Object.entries(TECHNOLOGY_ALIASES)) {
	for (const alias of aliases) ALIAS_TO_CANONICAL.set(alias, canonical);
}

const priorityWeight = { required: 5, preferred: 3, general: 2 } as const;

export function normalizeKeyword(value: string): string {
	const normalized = value
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9+#./-]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return ALIAS_TO_CANONICAL.get(normalized) ?? normalized;
}

export function extractDeterministicKeywords(value: string): string[] {
	const normalized = normalizeKeyword(value);
	const keywords = new Set<string>();
	for (const known of KNOWN_TERMS) {
		if (containsTerm(normalized, known)) keywords.add(displayKeyword(normalizeKeyword(known)));
	}
	return [...keywords].sort((a, b) => a.localeCompare(b));
}

export function isTechnologyKeyword(value: string): boolean {
	const canonical = normalizeKeyword(value);
	return (
		canonical in TECHNOLOGY_ALIASES ||
		[
			"ansible",
			"bash",
			"cloudflare",
			"docker",
			"git",
			"github actions",
			"graphql",
			"java",
			"jenkins",
			"linux",
			"mongodb",
			"mysql",
			"n8n",
			"next.js",
			"php",
			"powershell",
			"python",
			"redis",
			"sql",
			"terraform",
			"wordpress",
		].includes(canonical)
	);
}

function displayKeyword(value: string): string {
	const special: Record<string, string> = {
		"amazon web services": "AWS",
		"artificial intelligence": "AI",
		"c sharp": "C#",
		"ci/cd": "CI/CD",
		"google cloud": "Google Cloud",
		javascript: "JavaScript",
		kubernetes: "Kubernetes",
		"machine learning": "Machine Learning",
		"microsoft azure": "Microsoft Azure",
		"node.js": "Node.js",
		postgresql: "PostgreSQL",
		"rest api": "REST API",
		typescript: "TypeScript",
	};
	return special[value] ?? value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function containsTerm(haystack: string, term: string): boolean {
	const aliases = TECHNOLOGY_ALIASES[term] ?? [term];
	return aliases.some((alias) => {
		const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack);
	});
}

function detectPriority(line: string, current: JobRequirement["priority"]): JobRequirement["priority"] {
	if (/\b(required|requirements|must have|minimum qualifications|what you need)\b/i.test(line)) return "required";
	if (/\b(preferred|nice to have|bonus|desired)\b/i.test(line)) return "preferred";
	return current;
}

export function extractJobRequirements(jobDescription: string): JobRequirement[] {
	const lines = jobDescription
		.replace(/<[^>]*>/g, " ")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	const candidates = new Map<string, JobRequirement>();
	const tokenCounts = new Map<string, number>();
	let currentPriority: JobRequirement["priority"] = "general";

	for (const line of lines) {
		currentPriority = detectPriority(line, currentPriority);
		const normalizedLine = normalizeKeyword(line);
		for (const known of KNOWN_TERMS) {
			if (!containsTerm(normalizedLine, known)) continue;
			const canonical = normalizeKeyword(known);
			const existing = candidates.get(canonical);
			if (!existing || priorityWeight[currentPriority] > existing.weight) {
				candidates.set(canonical, {
					id: canonical,
					label: displayKeyword(canonical),
					canonical,
					priority: currentPriority,
					weight: priorityWeight[currentPriority],
				});
			}
		}

		for (const token of normalizedLine.match(/[a-z][a-z0-9+#./-]{2,}/g) ?? []) {
			if (STOP_WORDS.has(token) || /^\d+$/.test(token)) continue;
			tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
		}
	}

	for (const [token, count] of tokenCounts) {
		if (count < 2 || candidates.has(token)) continue;
		candidates.set(token, {
			id: token,
			label: displayKeyword(token),
			canonical: token,
			priority: "general",
			weight: priorityWeight.general,
		});
	}

	return [...candidates.values()].sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label)).slice(0, 50);
}

function itemSearchText(item: IntelligenceItem): string {
	return normalizeKeyword(
		[
			item.label,
			...item.keywords,
			...item.technologies,
			...item.industries,
			...item.targetRoles,
			JSON.stringify(item.content),
		].join(" "),
	);
}

export function rankVaultItems(
	items: IntelligenceItem[],
	requirements: JobRequirement[],
): VaultRecommendationSnapshot[] {
	const totalWeight = requirements.reduce((sum, requirement) => sum + requirement.weight, 0) || 1;
	return items
		.map((item) => {
			const searchText = itemSearchText(item);
			const matched = requirements.filter((requirement) => containsTerm(searchText, requirement.canonical));
			const matchedWeight = matched.reduce((sum, requirement) => sum + requirement.weight, 0);
			const coverage = matchedWeight / totalWeight;
			const explicitMetadata = [...item.keywords, ...item.technologies]
				.map(normalizeKeyword)
				.filter((term) => matched.some((requirement) => requirement.canonical === term)).length;
			const roleBoost = item.targetRoles.some((role) =>
				requirements.some((requirement) => containsTerm(role, requirement.canonical)),
			)
				? 8
				: 0;
			const importanceBoost = Math.max(0, Math.min(5, item.importance) - 1) * 3;
			const metadataBoost = Math.min(12, explicitMetadata * 3);
			const score = Math.min(100, Math.round(coverage * 77 + roleBoost + importanceBoost + metadataBoost));
			const labels = matched.map((requirement) => requirement.label);
			return {
				vaultItemId: item.id,
				label: item.label,
				type: item.type,
				version: item.version,
				score,
				matchedRequirements: labels,
				rationale:
					labels.length > 0
						? `Matches ${labels.slice(0, 4).join(", ")}${labels.length > 4 ? ` and ${labels.length - 4} more` : ""}.`
						: "No direct requirement match found.",
			};
		})
		.filter((recommendation) => recommendation.matchedRequirements.length > 0)
		.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

function fingerprint(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

export function analyzeJobDescription(jobDescription: string, items: IntelligenceItem[]): ApplicationAnalysisResult {
	const requirements = extractJobRequirements(jobDescription);
	const recommendations = rankVaultItems(items, requirements);
	const matchedCanonical = new Set<string>();
	for (const recommendation of recommendations) {
		for (const label of recommendation.matchedRequirements) {
			const requirement = requirements.find((candidate) => candidate.label === label);
			if (requirement) matchedCanonical.add(requirement.canonical);
		}
	}
	const matchedRequirements = requirements
		.filter((requirement) => matchedCanonical.has(requirement.canonical))
		.map((requirement) => requirement.label);
	const missingKeywords = requirements
		.filter((requirement) => !matchedCanonical.has(requirement.canonical))
		.map((requirement) => requirement.label);
	const totalWeight = requirements.reduce((sum, requirement) => sum + requirement.weight, 0);
	const matchedWeight = requirements
		.filter((requirement) => matchedCanonical.has(requirement.canonical))
		.reduce((sum, requirement) => sum + requirement.weight, 0);

	return {
		score: totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 0,
		jobFingerprint: fingerprint(normalizeKeyword(jobDescription)),
		requirements,
		matchedRequirements,
		missingKeywords,
		recommendations,
		analyzedAt: new Date(),
	};
}

export type { IntelligenceItem };
