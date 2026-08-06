import type { ResumeData, SectionType } from "@reactive-resume/schema/resume/data";
import type { Locale } from "@reactive-resume/utils/locale";
import type { VaultItemContent, VaultItemType } from "@reactive-resume/schema/vault/data";
import { ORPCError } from "@orpc/client";
import { and, arrayContains, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@reactive-resume/db/client";
import * as schema from "@reactive-resume/db/schema";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { parseVaultItemContent, vaultItemTypeSchema } from "@reactive-resume/schema/vault/data";
import { generateId, slugify } from "@reactive-resume/utils/string";
import { resumeService } from "../resume/service";

const vaultTypes = vaultItemTypeSchema.options;
const sectionTypes = vaultTypes.filter((type): type is SectionType => type !== "summary");

const stopWords = new Set([
	"a",
	"an",
	"and",
	"are",
	"as",
	"at",
	"be",
	"by",
	"for",
	"from",
	"has",
	"have",
	"in",
	"is",
	"it",
	"of",
	"on",
	"or",
	"our",
	"that",
	"the",
	"their",
	"this",
	"to",
	"we",
	"will",
	"with",
	"you",
	"your",
	"years",
	"experience",
	"required",
	"preferred",
	"responsibilities",
	"skills",
]);

function stripUserId<T extends { userId: string }>(row: T) {
	const { userId: _userId, ...rest } = row;
	return rest;
}

async function requireOwned(id: string, userId: string) {
	const [row] = await db
		.select()
		.from(schema.vaultItem)
		.where(and(eq(schema.vaultItem.id, id), eq(schema.vaultItem.userId, userId)));
	if (!row) throw new ORPCError("NOT_FOUND");
	return row;
}

function normalizeTags(tags: string[]) {
	return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 50);
}

function cleanText(value: unknown) {
	return JSON.stringify(value)
		.replace(/<[^>]*>/g, " ")
		.replace(/&[a-z]+;/gi, " ")
		.replace(/[^a-zA-Z0-9+#.\-/]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function tokenize(value: string) {
	return [
		...new Set(
			value
				.toLowerCase()
				.match(/[a-z0-9][a-z0-9+#.\-/]{1,}/g)
				?.filter((token) => !stopWords.has(token)) ?? [],
		),
	];
}

export function getVaultItemLabel(type: VaultItemType, content: VaultItemContent) {
	const item = content as Record<string, unknown>;
	const candidates: Record<VaultItemType, string[]> = {
		summary: ["content"],
		profiles: ["network", "username"],
		experience: ["company", "position"],
		education: ["school", "degree"],
		projects: ["name"],
		skills: ["name"],
		languages: ["language"],
		interests: ["name"],
		awards: ["title", "awarder"],
		certifications: ["title", "issuer"],
		publications: ["title", "publisher"],
		volunteer: ["organization"],
		references: ["name", "position"],
	};

	for (const key of candidates[type]) {
		const value = item[key];
		if (typeof value === "string" && value.trim()) {
			return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
		}
	}

	return type === "summary" ? "Professional Summary" : "Untitled Vault Item";
}

const builtInLayoutSections = new Set<string>(["summary", ...sectionTypes]);
const defaultMainSections = new Set(defaultResumeData.metadata.layout.pages[0]?.main ?? []);

function clearResumeContent(data: ResumeData) {
	data.summary.content = "";
	for (const type of sectionTypes) data.sections[type].items = [] as never[];
	data.customSections = [];
	for (const page of data.metadata.layout.pages) {
		page.main = page.main.filter((sectionId) => builtInLayoutSections.has(sectionId));
		page.sidebar = page.sidebar.filter((sectionId) => builtInLayoutSections.has(sectionId));
	}
	return data;
}

function ensureVaultSectionsAreVisible(data: ResumeData, types: VaultItemType[]) {
	const firstPage = data.metadata.layout.pages[0];
	if (!firstPage) return;
	const displayed = new Set(data.metadata.layout.pages.flatMap((page) => [...page.main, ...page.sidebar]));
	for (const type of [...new Set(types)]) {
		if (displayed.has(type)) continue;
		if (defaultMainSections.has(type)) firstPage.main.push(type);
		else firstPage.sidebar.push(type);
		displayed.add(type);
	}
}

function cloneVaultContent(content: VaultItemContent): VaultItemContent {
	return { ...structuredClone(content), id: generateId(), hidden: false } as VaultItemContent;
}

function addContentToResume(data: ResumeData, type: VaultItemType, content: VaultItemContent) {
	const item = cloneVaultContent(content);
	if (type === "summary") {
		data.summary.hidden = false;
		data.summary.content = (item as { content: string }).content;
		return;
	}

	data.sections[type].hidden = false;
	data.sections[type].items.push(item as never);
}

export function buildResumeDataFromVault(input: {
	baseData?: ResumeData;
	items: { type: VaultItemType; content: VaultItemContent }[];
}) {
	const data = clearResumeContent(structuredClone(input.baseData ?? defaultResumeData));
	for (const item of input.items) addContentToResume(data, item.type, item.content);
	ensureVaultSectionsAreVisible(
		data,
		input.items.filter((item) => item.type === "summary" || !item.content.hidden).map((item) => item.type),
	);
	return data;
}

export const vaultService = {
	list: async (input: {
		userId: string;
		search?: string;
		types?: VaultItemType[];
		tags?: string[];
		includeArchived?: boolean;
		sourceResumeId?: string;
	}) => {
		const search = input.search?.trim();
		const rows = await db
			.select()
			.from(schema.vaultItem)
			.where(
				and(
					eq(schema.vaultItem.userId, input.userId),
					input.includeArchived ? undefined : eq(schema.vaultItem.archived, false),
					input.types && input.types.length > 0 ? inArray(schema.vaultItem.type, input.types) : undefined,
					input.tags && input.tags.length > 0 ? arrayContains(schema.vaultItem.tags, input.tags) : undefined,
					input.sourceResumeId ? eq(schema.vaultItem.sourceResumeId, input.sourceResumeId) : undefined,
					search
						? or(
							ilike(schema.vaultItem.label, `%${search}%`),
							ilike(schema.vaultItem.notes, `%${search}%`),
							sql`${schema.vaultItem.content}::text ILIKE ${`%${search}%`}`,
							sql`array_to_string(${schema.vaultItem.tags}, ' ') ILIKE ${`%${search}%`}`,
						)
						: undefined,
				),
			)
			.orderBy(desc(schema.vaultItem.updatedAt));

		return rows.map(stripUserId);
	},

	getById: async (input: { id: string; userId: string }) => stripUserId(await requireOwned(input.id, input.userId)),

	create: async (input: {
		userId: string;
		type: VaultItemType;
		label: string;
		content: unknown;
		tags: string[];
		notes: string | null;
		sourceResumeId: string | null;
		sourceItemId: string | null;
	}) => {
		if (input.sourceResumeId) await resumeService.getById({ id: input.sourceResumeId, userId: input.userId });
		const id = generateId();
		await db.insert(schema.vaultItem).values({
			id,
			userId: input.userId,
			type: input.type,
			label: input.label.trim(),
			content: parseVaultItemContent(input.type, input.content),
			tags: normalizeTags(input.tags),
			notes: input.notes,
			sourceResumeId: input.sourceResumeId,
			sourceItemId: input.sourceItemId,
		});
		return id;
	},

	update: async (input: {
		id: string;
		userId: string;
		type?: VaultItemType;
		label?: string;
		content?: unknown;
		tags?: string[];
		notes?: string | null;
		archived?: boolean;
		sourceResumeId?: string | null;
		sourceItemId?: string | null;
	}) => {
		const existing = await requireOwned(input.id, input.userId);
		const type = input.type ?? existing.type;
		if (input.type !== undefined && input.content === undefined) parseVaultItemContent(type, existing.content);
		if (input.sourceResumeId) await resumeService.getById({ id: input.sourceResumeId, userId: input.userId });
		const [updated] = await db
			.update(schema.vaultItem)
			.set({
				...(input.type !== undefined ? { type: input.type } : {}),
				...(input.label !== undefined ? { label: input.label.trim() } : {}),
				...(input.content !== undefined ? { content: parseVaultItemContent(type, input.content) } : {}),
				...(input.tags !== undefined ? { tags: normalizeTags(input.tags) } : {}),
				...(input.notes !== undefined ? { notes: input.notes } : {}),
				...(input.archived !== undefined ? { archived: input.archived } : {}),
				...(input.sourceResumeId !== undefined ? { sourceResumeId: input.sourceResumeId } : {}),
				...(input.sourceItemId !== undefined ? { sourceItemId: input.sourceItemId } : {}),
				version: sql`${schema.vaultItem.version} + 1`,
			})
			.where(and(eq(schema.vaultItem.id, input.id), eq(schema.vaultItem.userId, input.userId)))
			.returning();
		if (!updated) throw new ORPCError("NOT_FOUND");
		return stripUserId(updated);
	},

	delete: async (input: { id: string; userId: string }) => {
		const rows = await db
			.delete(schema.vaultItem)
			.where(and(eq(schema.vaultItem.id, input.id), eq(schema.vaultItem.userId, input.userId)))
			.returning({ id: schema.vaultItem.id });
		if (rows.length === 0) throw new ORPCError("NOT_FOUND");
	},

	bulkUpdate: async (input: {
		ids: string[];
		userId: string;
		archived?: boolean;
		addTags?: string[];
	}) => {
		const rows = await db
			.update(schema.vaultItem)
			.set({
				...(input.archived !== undefined ? { archived: input.archived } : {}),
				...(input.addTags && input.addTags.length > 0
					? { tags: sql`array(select distinct unnest(${schema.vaultItem.tags} || ${normalizeTags(input.addTags)}::text[]))` }
					: {}),
				version: sql`${schema.vaultItem.version} + 1`,
			})
			.where(and(eq(schema.vaultItem.userId, input.userId), inArray(schema.vaultItem.id, input.ids)))
			.returning({ id: schema.vaultItem.id });
		return { updated: rows.length };
	},

	bulkDelete: async (input: { ids: string[]; userId: string }) => {
		const rows = await db
			.delete(schema.vaultItem)
			.where(and(eq(schema.vaultItem.userId, input.userId), inArray(schema.vaultItem.id, input.ids)))
			.returning({ id: schema.vaultItem.id });
		return { deleted: rows.length };
	},

	tags: async (input: { userId: string }) => {
		const rows = await db
			.select({ tags: schema.vaultItem.tags })
			.from(schema.vaultItem)
			.where(eq(schema.vaultItem.userId, input.userId));
		const tags = rows.flatMap((row) => row.tags as string[]);
		return [...new Set<string>(tags)].sort((a, b) => a.localeCompare(b));
	},

	importFromResume: async (input: { userId: string; resumeId: string; types?: VaultItemType[] }) => {
		const resume = await resumeService.getById({ id: input.resumeId, userId: input.userId });
		const allowed = new Set(input.types ?? vaultTypes);
		const candidates: { type: VaultItemType; content: VaultItemContent; sourceItemId: string }[] = [];

		if (allowed.has("summary") && resume.data.summary.content.trim()) {
			candidates.push({
				type: "summary",
				content: { id: "summary", hidden: resume.data.summary.hidden, content: resume.data.summary.content },
				sourceItemId: "summary",
			});
		}

		for (const type of sectionTypes) {
			if (!allowed.has(type)) continue;
			for (const item of resume.data.sections[type].items) {
				candidates.push({ type, content: parseVaultItemContent(type, item), sourceItemId: item.id });
			}
		}

		for (const section of resume.data.customSections) {
			if (section.type === "cover-letter" || !allowed.has(section.type)) continue;
			for (const item of section.items) {
				candidates.push({
					type: section.type,
					content: parseVaultItemContent(section.type, item),
					sourceItemId: `${section.id}:${item.id}`,
				});
			}
		}

		let imported = 0;
		let updated = 0;
		for (const candidate of candidates) {
			const [existing] = await db
				.select({ id: schema.vaultItem.id })
				.from(schema.vaultItem)
				.where(
					and(
						eq(schema.vaultItem.userId, input.userId),
						eq(schema.vaultItem.sourceResumeId, input.resumeId),
						eq(schema.vaultItem.sourceItemId, candidate.sourceItemId),
					),
				);

			const label = getVaultItemLabel(candidate.type, candidate.content);
			if (existing) {
				await db
					.update(schema.vaultItem)
					.set({
						type: candidate.type,
						label,
						content: candidate.content,
						archived: false,
						version: sql`${schema.vaultItem.version} + 1`,
					})
					.where(eq(schema.vaultItem.id, existing.id));
				updated += 1;
			} else {
				await db.insert(schema.vaultItem).values({
					userId: input.userId,
					type: candidate.type,
					label,
					content: candidate.content,
					tags: resume.tags,
					sourceResumeId: input.resumeId,
					sourceItemId: candidate.sourceItemId,
				});
				imported += 1;
			}
		}

		return { imported, updated };
	},

	match: async (input: {
		userId: string;
		jobDescription: string;
		types?: VaultItemType[];
		limit: number;
	}) => {
		const items = await vaultService.list({
			userId: input.userId,
			includeArchived: false,
			...(input.types ? { types: input.types } : {}),
		});
		const jobTokens = tokenize(input.jobDescription).slice(0, 250);
		const jobTokenSet = new Set(jobTokens);

		return items
			.map((item) => {
				const itemTokens = tokenize(`${item.label} ${item.tags.join(" ")} ${cleanText(item.content)} ${item.notes ?? ""}`);
				const matches = itemTokens.filter((token) => jobTokenSet.has(token));
				const tagMatches = item.tags.filter((tag) =>
					jobTokens.some((token) => tag.toLowerCase().includes(token) || token.includes(tag.toLowerCase())),
				);
				const uniqueMatches = [...new Set([...matches, ...tagMatches.map((tag) => tag.toLowerCase())])];
				const denominator = Math.max(6, Math.min(30, jobTokens.length));
				const score = Math.min(100, Math.round((uniqueMatches.length / denominator) * 100 + tagMatches.length * 8));
				return { item, score, matchedKeywords: uniqueMatches.slice(0, 12) };
			})
			.sort((a, b) => b.score - a.score || b.item.updatedAt.getTime() - a.item.updatedAt.getTime())
			.slice(0, input.limit);
	},

	createResume: async (input: {
		userId: string;
		locale: Locale;
		name: string;
		baseResumeId?: string | null;
		itemIds: string[];
		tags: string[];
	}) => {
		const uniqueIds = [...new Set(input.itemIds)];
		const rows = await db
			.select()
			.from(schema.vaultItem)
			.where(and(eq(schema.vaultItem.userId, input.userId), inArray(schema.vaultItem.id, uniqueIds)));
		if (rows.length !== uniqueIds.length) throw new ORPCError("NOT_FOUND", { message: "One or more Vault items were not found." });

		const byId = new Map(rows.map((row) => [row.id, row]));
		const ordered = uniqueIds.map((id) => byId.get(id)).filter((item): item is (typeof rows)[number] => !!item);
		const baseResume = input.baseResumeId
			? await resumeService.getById({ id: input.baseResumeId, userId: input.userId })
			: null;
		const data = buildResumeDataFromVault({
			...(baseResume ? { baseData: baseResume.data } : {}),
			items: ordered.map((item) => ({ type: item.type, content: item.content })),
		});
		const name = input.name.trim();
		const id = await resumeService.create({
			userId: input.userId,
			name,
			slug: `${slugify(name)}-${generateId().slice(0, 6)}`,
			tags: normalizeTags([...(baseResume?.tags ?? []), ...input.tags, "vault"]),
			locale: input.locale,
			data,
		});
		return { id, name };
	},
};
