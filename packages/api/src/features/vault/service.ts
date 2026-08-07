import type { ResumeData, SectionType } from "@reactive-resume/schema/resume/data";
import type {
	VaultImportCandidate,
	VaultImportFileType,
	VaultItemContent,
	VaultItemMetadata,
	VaultItemType,
	VaultSourceType,
} from "@reactive-resume/schema/vault/data";
import type { ApplicationAnalysisResult, VaultSnapshotItem } from "@reactive-resume/schema/vault/intelligence";
import type { Locale } from "@reactive-resume/utils/locale";
import { createHash } from "node:crypto";
import { ORPCError } from "@orpc/client";
import { and, arrayContains, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@reactive-resume/db/client";
import * as schema from "@reactive-resume/db/schema";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import {
	parseVaultItemContent,
	vaultItemMetadataSchema,
	vaultItemTypeSchema,
} from "@reactive-resume/schema/vault/data";
import { generateId, slugify } from "@reactive-resume/utils/string";
import { resumeService } from "../resume/service";
import { parseImportDocument, resumeDataToCandidates } from "./document-import";
import { analyzeJobDescription } from "./intelligence";

const vaultTypes = vaultItemTypeSchema.options;
const sectionTypes = vaultTypes.filter((type): type is SectionType => type !== "summary");
const builtInLayoutSections = new Set<string>(["summary", ...sectionTypes]);
const defaultMainSections = new Set(defaultResumeData.metadata.layout.pages[0]?.main ?? []);

type VaultRow = typeof schema.vaultItem.$inferSelect;

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

function normalizeList(values: string[], limit = 100) {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit);
}

function normalizeMetadata(metadata: VaultItemMetadata): VaultItemMetadata {
	const parsed = vaultItemMetadataSchema.parse(metadata);
	return {
		keywords: normalizeList(parsed.keywords),
		technologies: normalizeList(parsed.technologies),
		industries: normalizeList(parsed.industries, 50),
		targetRoles: normalizeList(parsed.targetRoles, 50),
		importance: parsed.importance,
	};
}

function stableValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stableValue);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, nested]) => [key, stableValue(nested)]),
		);
	}
	return value;
}

export function createContentFingerprint(type: VaultItemType, content: VaultItemContent): string {
	const normalized = stableValue({ type, content: { ...(content as Record<string, unknown>), id: "", hidden: false } });
	return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function contentMetadata(row: VaultRow) {
	return {
		tags: row.tags,
		keywords: row.keywords,
		technologies: row.technologies,
		industries: row.industries,
		targetRoles: row.targetRoles,
		importance: row.importance,
		notes: row.notes,
		archived: row.archived,
		sourceType: row.sourceType,
		sourceName: row.sourceName,
		importId: row.importId,
		sourceResumeId: row.sourceResumeId,
		sourceItemId: row.sourceItemId,
	};
}

async function recordVersion(row: VaultRow, reason: string) {
	await db.insert(schema.vaultItemVersion).values({
		vaultItemId: row.id,
		userId: row.userId,
		version: row.version,
		label: row.label,
		content: row.content,
		metadata: contentMetadata(row),
		changeReason: reason,
	});
}

export function getVaultItemLabel(type: VaultItemType, content: VaultItemContent) {
	const item = content as Record<string, unknown>;
	const candidates: Record<VaultItemType, string[]> = {
		summary: ["content"],
		profiles: ["network", "username"],
		experience: ["position", "company"],
		education: ["degree", "school"],
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
			return value
				.replace(/<[^>]*>/g, " ")
				.replace(/\s+/g, " ")
				.trim()
				.slice(0, 160);
		}
	}
	return type === "summary" ? "Professional Summary" : "Untitled Vault Item";
}

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

async function beginImportPreview(input: {
	userId: string;
	fileName: string;
	fileType: VaultImportFileType;
	contentHash: string;
	candidates: Array<Omit<VaultImportCandidate, "fingerprint" | "duplicateOfId">>;
	sourceResumeId?: string | null;
}) {
	const existing = await db
		.select({
			id: schema.vaultItem.id,
			type: schema.vaultItem.type,
			content: schema.vaultItem.content,
			fingerprint: schema.vaultItem.contentFingerprint,
		})
		.from(schema.vaultItem)
		.where(eq(schema.vaultItem.userId, input.userId));
	const byFingerprint = new Map(
		existing.map((item) => [item.fingerprint || createContentFingerprint(item.type, item.content), item.id]),
	);
	const candidates = input.candidates.map((item) => {
		const fingerprint = createContentFingerprint(item.type, item.content);
		const duplicateOfId = byFingerprint.get(fingerprint) ?? null;
		if (!duplicateOfId) byFingerprint.set(fingerprint, item.id);
		return { ...item, fingerprint, duplicateOfId };
	});
	const importId = generateId();
	await db.insert(schema.vaultImport).values({
		id: importId,
		userId: input.userId,
		fileName: input.fileName,
		fileType: input.fileType,
		sourceResumeId: input.sourceResumeId ?? null,
		contentHash: input.contentHash,
		candidates,
		discoveredCount: candidates.length,
		duplicateCount: candidates.filter((item) => item.duplicateOfId).length,
	});
	return {
		importId,
		fileName: input.fileName,
		fileType: input.fileType,
		candidates,
		duplicateCount: candidates.filter((item) => item.duplicateOfId).length,
	};
}

function toSnapshotItem(row: VaultRow): VaultSnapshotItem {
	return {
		vaultItemId: row.id,
		label: row.label,
		type: row.type,
		version: row.version,
		content: structuredClone(row.content),
		keywords: [...row.keywords],
		technologies: [...row.technologies],
		industries: [...row.industries],
		targetRoles: [...row.targetRoles],
		importance: row.importance,
	};
}

function portableMarkdown(items: VaultRow[]) {
	const lines = ["# Career Vault", "", `Exported: ${new Date().toISOString()}`, ""];
	for (const item of items) {
		lines.push(
			`## ${item.label}`,
			"",
			`- Type: ${item.type}`,
			`- Version: ${item.version}`,
			`- Importance: ${item.importance}/5`,
		);
		if (item.keywords.length) lines.push(`- Keywords: ${item.keywords.join(", ")}`);
		if (item.technologies.length) lines.push(`- Technologies: ${item.technologies.join(", ")}`);
		if (item.industries.length) lines.push(`- Industries: ${item.industries.join(", ")}`);
		if (item.targetRoles.length) lines.push(`- Target roles: ${item.targetRoles.join(", ")}`);
		if (item.sourceName) lines.push(`- Source: ${item.sourceName}`);
		lines.push("", JSON.stringify(item.content, null, 2), "");
	}
	return lines.join("\n");
}

export const vaultService = {
	list: async (input: {
		userId: string;
		search?: string | undefined;
		types?: VaultItemType[] | undefined;
		tags?: string[] | undefined;
		includeArchived?: boolean | undefined;
		sourceResumeId?: string | undefined;
	}) => {
		const search = input.search?.trim();
		const rows = await db
			.select()
			.from(schema.vaultItem)
			.where(
				and(
					eq(schema.vaultItem.userId, input.userId),
					input.includeArchived ? undefined : eq(schema.vaultItem.archived, false),
					input.types?.length ? inArray(schema.vaultItem.type, input.types) : undefined,
					input.tags?.length ? arrayContains(schema.vaultItem.tags, input.tags) : undefined,
					input.sourceResumeId ? eq(schema.vaultItem.sourceResumeId, input.sourceResumeId) : undefined,
					search
						? or(
								ilike(schema.vaultItem.label, `%${search}%`),
								ilike(schema.vaultItem.notes, `%${search}%`),
								sql`${schema.vaultItem.content}::text ILIKE ${`%${search}%`}`,
								sql`array_to_string(${schema.vaultItem.tags} || ${schema.vaultItem.keywords} || ${schema.vaultItem.technologies} || ${schema.vaultItem.targetRoles}, ' ') ILIKE ${`%${search}%`}`,
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
		keywords: string[];
		technologies: string[];
		industries: string[];
		targetRoles: string[];
		importance: number;
		notes: string | null;
		sourceType: VaultSourceType;
		sourceName: string | null;
		sourceResumeId: string | null;
		sourceItemId: string | null;
	}) => {
		if (input.sourceResumeId) await resumeService.getById({ id: input.sourceResumeId, userId: input.userId });
		const id = generateId();
		const content = parseVaultItemContent(input.type, input.content);
		const metadata = normalizeMetadata(input);
		const [created] = await db
			.insert(schema.vaultItem)
			.values({
				id,
				userId: input.userId,
				type: input.type,
				label: input.label.trim(),
				content,
				contentFingerprint: createContentFingerprint(input.type, content),
				tags: normalizeList(input.tags, 50),
				...metadata,
				notes: input.notes,
				sourceType: input.sourceType,
				sourceName: input.sourceName,
				sourceResumeId: input.sourceResumeId,
				sourceItemId: input.sourceItemId,
			})
			.returning();
		if (created) await recordVersion(created, "created");
		return id;
	},

	update: async (input: {
		id: string;
		userId: string;
		type?: VaultItemType | undefined;
		label?: string | undefined;
		content?: unknown | undefined;
		tags?: string[] | undefined;
		keywords?: string[] | undefined;
		technologies?: string[] | undefined;
		industries?: string[] | undefined;
		targetRoles?: string[] | undefined;
		importance?: number | undefined;
		notes?: string | null | undefined;
		archived?: boolean | undefined;
		sourceType?: VaultSourceType | undefined;
		sourceName?: string | null | undefined;
		sourceResumeId?: string | null | undefined;
		sourceItemId?: string | null | undefined;
	}) => {
		const existing = await requireOwned(input.id, input.userId);
		const type = input.type ?? existing.type;
		const content = input.content !== undefined ? parseVaultItemContent(type, input.content) : existing.content;
		if (input.type !== undefined && input.content === undefined) parseVaultItemContent(type, existing.content);
		if (input.sourceResumeId) await resumeService.getById({ id: input.sourceResumeId, userId: input.userId });
		const [updated] = await db
			.update(schema.vaultItem)
			.set({
				...(input.type !== undefined ? { type: input.type } : {}),
				...(input.label !== undefined ? { label: input.label.trim() } : {}),
				...(input.content !== undefined ? { content } : {}),
				...(input.type !== undefined || input.content !== undefined
					? { contentFingerprint: createContentFingerprint(type, content) }
					: {}),
				...(input.tags !== undefined ? { tags: normalizeList(input.tags, 50) } : {}),
				...(input.keywords !== undefined ? { keywords: normalizeList(input.keywords) } : {}),
				...(input.technologies !== undefined ? { technologies: normalizeList(input.technologies) } : {}),
				...(input.industries !== undefined ? { industries: normalizeList(input.industries, 50) } : {}),
				...(input.targetRoles !== undefined ? { targetRoles: normalizeList(input.targetRoles, 50) } : {}),
				...(input.importance !== undefined ? { importance: input.importance } : {}),
				...(input.notes !== undefined ? { notes: input.notes } : {}),
				...(input.archived !== undefined ? { archived: input.archived } : {}),
				...(input.sourceType !== undefined ? { sourceType: input.sourceType } : {}),
				...(input.sourceName !== undefined ? { sourceName: input.sourceName } : {}),
				...(input.sourceResumeId !== undefined ? { sourceResumeId: input.sourceResumeId } : {}),
				...(input.sourceItemId !== undefined ? { sourceItemId: input.sourceItemId } : {}),
				version: sql`${schema.vaultItem.version} + 1`,
			})
			.where(and(eq(schema.vaultItem.id, input.id), eq(schema.vaultItem.userId, input.userId)))
			.returning();
		if (!updated) throw new ORPCError("NOT_FOUND");
		await recordVersion(updated, "updated");
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
		archived?: boolean | undefined;
		addTags?: string[] | undefined;
	}) => {
		const rows = await db
			.update(schema.vaultItem)
			.set({
				...(input.archived !== undefined ? { archived: input.archived } : {}),
				...(input.addTags?.length
					? {
							tags: sql`array(select distinct unnest(${schema.vaultItem.tags} || ${normalizeList(input.addTags, 50)}::text[]))`,
						}
					: {}),
				version: sql`${schema.vaultItem.version} + 1`,
			})
			.where(and(eq(schema.vaultItem.userId, input.userId), inArray(schema.vaultItem.id, input.ids)))
			.returning();
		for (const row of rows) await recordVersion(row, "bulk updated");
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
		return [...new Set(rows.flatMap((row) => row.tags))].sort((a, b) => a.localeCompare(b));
	},

	previewFileImport: async (input: { userId: string; fileName: string; contentType: string; data: Uint8Array }) => {
		if (input.data.byteLength > 10 * 1024 * 1024)
			throw new ORPCError("BAD_REQUEST", { message: "Resume files must be 10 MB or smaller." });
		try {
			const parsed = await parseImportDocument({
				name: input.fileName,
				contentType: input.contentType,
				data: input.data,
			});
			return beginImportPreview({
				userId: input.userId,
				fileName: input.fileName,
				fileType: parsed.fileType,
				contentHash: createHash("sha256").update(input.data).digest("hex"),
				candidates: parsed.candidates,
			});
		} catch (error) {
			throw new ORPCError("BAD_REQUEST", {
				message: error instanceof Error ? error.message : "The resume could not be parsed.",
			});
		}
	},

	previewResumeImport: async (input: { userId: string; resumeId: string }) => {
		const resume = await resumeService.getById({ id: input.resumeId, userId: input.userId });
		return beginImportPreview({
			userId: input.userId,
			fileName: `${resume.name}.json`,
			fileType: "reactive-resume-json",
			contentHash: createHash("sha256").update(JSON.stringify(resume.data)).digest("hex"),
			candidates: resumeDataToCandidates(resume.data),
			sourceResumeId: resume.id,
		});
	},

	commitImport: async (input: { userId: string; importId: string; selectedCandidateIds: string[] }) => {
		const [importRow] = await db
			.select()
			.from(schema.vaultImport)
			.where(and(eq(schema.vaultImport.id, input.importId), eq(schema.vaultImport.userId, input.userId)));
		if (!importRow) throw new ORPCError("NOT_FOUND");
		if (importRow.status !== "review")
			throw new ORPCError("CONFLICT", { message: "This import has already been completed." });
		const selected = new Set(input.selectedCandidateIds);
		let imported = 0;
		let skippedDuplicates = 0;
		for (const item of importRow.candidates.filter((candidate) => selected.has(candidate.id))) {
			if (item.duplicateOfId) {
				skippedDuplicates += 1;
				continue;
			}
			const [duplicate] = await db
				.select({ id: schema.vaultItem.id })
				.from(schema.vaultItem)
				.where(
					and(eq(schema.vaultItem.userId, input.userId), eq(schema.vaultItem.contentFingerprint, item.fingerprint)),
				);
			if (duplicate) {
				skippedDuplicates += 1;
				continue;
			}
			const [created] = await db
				.insert(schema.vaultItem)
				.values({
					userId: input.userId,
					type: item.type,
					label: item.label,
					content: item.content,
					contentFingerprint: item.fingerprint,
					keywords: normalizeList(item.keywords),
					technologies: normalizeList(item.technologies),
					industries: normalizeList(item.industries, 50),
					targetRoles: normalizeList(item.targetRoles, 50),
					importance: item.importance,
					sourceType: importRow.sourceResumeId ? "resume" : "file",
					sourceName: importRow.fileName,
					importId: importRow.id,
					sourceResumeId: importRow.sourceResumeId,
					sourceItemId: importRow.sourceResumeId ? item.content.id : null,
				})
				.returning();
			if (created) {
				await recordVersion(created, "imported");
				imported += 1;
			}
		}
		await db
			.update(schema.vaultImport)
			.set({ status: "completed", importedCount: imported, duplicateCount: skippedDuplicates, completedAt: new Date() })
			.where(eq(schema.vaultImport.id, importRow.id));
		return { imported, skippedDuplicates };
	},

	importFromResume: async (input: { userId: string; resumeId: string; types?: VaultItemType[] | undefined }) => {
		const preview = await vaultService.previewResumeImport({ userId: input.userId, resumeId: input.resumeId });
		const allowed = new Set(input.types ?? vaultTypes);
		const selectedCandidateIds = preview.candidates.filter((item) => allowed.has(item.type)).map((item) => item.id);
		const result = await vaultService.commitImport({
			userId: input.userId,
			importId: preview.importId,
			selectedCandidateIds,
		});
		return { imported: result.imported, updated: 0 };
	},

	versions: async (input: { userId: string; id: string }) => {
		await requireOwned(input.id, input.userId);
		return db
			.select({
				id: schema.vaultItemVersion.id,
				version: schema.vaultItemVersion.version,
				changeReason: schema.vaultItemVersion.changeReason,
				createdAt: schema.vaultItemVersion.createdAt,
			})
			.from(schema.vaultItemVersion)
			.where(and(eq(schema.vaultItemVersion.vaultItemId, input.id), eq(schema.vaultItemVersion.userId, input.userId)))
			.orderBy(desc(schema.vaultItemVersion.version));
	},

	restoreVersion: async (input: { userId: string; id: string; versionId: string }) => {
		const current = await requireOwned(input.id, input.userId);
		const [version] = await db
			.select()
			.from(schema.vaultItemVersion)
			.where(
				and(
					eq(schema.vaultItemVersion.id, input.versionId),
					eq(schema.vaultItemVersion.vaultItemId, input.id),
					eq(schema.vaultItemVersion.userId, input.userId),
				),
			);
		if (!version) throw new ORPCError("NOT_FOUND");
		const metadata = version.metadata as ReturnType<typeof contentMetadata>;
		const [updated] = await db
			.update(schema.vaultItem)
			.set({
				label: version.label,
				content: version.content,
				contentFingerprint: createContentFingerprint(current.type, version.content),
				tags: metadata.tags,
				keywords: metadata.keywords,
				technologies: metadata.technologies,
				industries: metadata.industries,
				targetRoles: metadata.targetRoles,
				importance: metadata.importance,
				notes: metadata.notes,
				archived: metadata.archived,
				version: sql`${schema.vaultItem.version} + 1`,
			})
			.where(and(eq(schema.vaultItem.id, input.id), eq(schema.vaultItem.userId, input.userId)))
			.returning();
		if (!updated) throw new ORPCError("NOT_FOUND");
		await recordVersion(updated, `restored version ${version.version}`);
		return stripUserId(updated);
	},

	match: async (input: {
		userId: string;
		jobDescription: string;
		types?: VaultItemType[] | undefined;
		limit: number;
	}) => {
		const items = await db
			.select()
			.from(schema.vaultItem)
			.where(
				and(
					eq(schema.vaultItem.userId, input.userId),
					eq(schema.vaultItem.archived, false),
					input.types?.length ? inArray(schema.vaultItem.type, input.types) : undefined,
				),
			);
		const analysis = analyzeJobDescription(input.jobDescription, items);
		const byId = new Map(items.map((item) => [item.id, item]));
		return analysis.recommendations.slice(0, input.limit).flatMap((recommendation) => {
			const item = byId.get(recommendation.vaultItemId);
			return item
				? [
						{
							item: stripUserId(item),
							score: recommendation.score,
							matchedKeywords: recommendation.matchedRequirements,
						},
					]
				: [];
		});
	},

	analyzeApplication: async (input: { userId: string; applicationId: string }) => {
		const [application] = await db
			.select()
			.from(schema.application)
			.where(and(eq(schema.application.id, input.applicationId), eq(schema.application.userId, input.userId)));
		if (!application) throw new ORPCError("NOT_FOUND");
		if (!application.jobDescription?.trim())
			throw new ORPCError("BAD_REQUEST", { message: "Add a job description before running analysis." });
		const items = await db
			.select()
			.from(schema.vaultItem)
			.where(and(eq(schema.vaultItem.userId, input.userId), eq(schema.vaultItem.archived, false)));
		const result = analyzeJobDescription(application.jobDescription, items);
		await db
			.insert(schema.applicationAnalysis)
			.values({ userId: input.userId, applicationId: application.id, result, jobFingerprint: result.jobFingerprint })
			.onConflictDoUpdate({
				target: schema.applicationAnalysis.applicationId,
				set: { result, jobFingerprint: result.jobFingerprint },
			});
		await db
			.update(schema.application)
			.set({ matchScore: result.score })
			.where(eq(schema.application.id, application.id));
		return result;
	},

	getApplicationAnalysis: async (input: { userId: string; applicationId: string }) => {
		const [row] = await db
			.select({ result: schema.applicationAnalysis.result })
			.from(schema.applicationAnalysis)
			.where(
				and(
					eq(schema.applicationAnalysis.applicationId, input.applicationId),
					eq(schema.applicationAnalysis.userId, input.userId),
				),
			);
		return row?.result ?? null;
	},

	createResume: async (input: {
		userId: string;
		locale: Locale;
		name: string;
		baseResumeId?: string | null | undefined;
		applicationId?: string | null | undefined;
		itemIds: string[];
		tags: string[];
	}) => {
		const uniqueIds = [...new Set(input.itemIds)];
		const rows = await db
			.select()
			.from(schema.vaultItem)
			.where(and(eq(schema.vaultItem.userId, input.userId), inArray(schema.vaultItem.id, uniqueIds)));
		if (rows.length !== uniqueIds.length)
			throw new ORPCError("NOT_FOUND", { message: "One or more Vault items were not found." });
		const byId = new Map(rows.map((row) => [row.id, row]));
		const ordered = uniqueIds.map((id) => byId.get(id)).filter((item): item is VaultRow => !!item);
		const baseResume = input.baseResumeId
			? await resumeService.getById({ id: input.baseResumeId, userId: input.userId })
			: null;
		let analysis: ApplicationAnalysisResult | null = null;
		if (input.applicationId) {
			analysis = await vaultService.getApplicationAnalysis({
				userId: input.userId,
				applicationId: input.applicationId,
			});
		}
		const data = buildResumeDataFromVault({
			...(baseResume ? { baseData: baseResume.data } : {}),
			items: ordered.map((item) => ({ type: item.type, content: item.content })),
		});
		const name = input.name.trim();
		const id = await resumeService.create({
			userId: input.userId,
			name,
			slug: `${slugify(name)}-${generateId().slice(0, 6)}`,
			tags: normalizeList(
				[...(baseResume?.tags ?? []), ...input.tags, "vault", ...(input.applicationId ? ["targeted"] : [])],
				50,
			),
			locale: input.locale,
			data,
		});
		await db.insert(schema.resumeSnapshot).values({
			userId: input.userId,
			resumeId: id,
			baseResumeId: baseResume?.id ?? null,
			applicationId: input.applicationId ?? null,
			vaultItems: ordered.map(toSnapshotItem),
			analysis,
		});
		return { id, name };
	},

	exportPortable: async (input: { userId: string; format: "json" | "markdown"; includeArchived: boolean }) => {
		const rows = await db
			.select()
			.from(schema.vaultItem)
			.where(
				and(
					eq(schema.vaultItem.userId, input.userId),
					input.includeArchived ? undefined : eq(schema.vaultItem.archived, false),
				),
			)
			.orderBy(desc(schema.vaultItem.importance), desc(schema.vaultItem.updatedAt));
		const date = new Date().toISOString().slice(0, 10);
		if (input.format === "markdown") {
			return { fileName: `career-vault-${date}.md`, mimeType: "text/markdown", content: portableMarkdown(rows) };
		}
		const payload = {
			format: "reactive-resume-career-vault",
			version: "5.4",
			exportedAt: new Date().toISOString(),
			items: rows.map(({ userId: _userId, ...row }) => row),
		};
		return {
			fileName: `career-vault-${date}.json`,
			mimeType: "application/json",
			content: JSON.stringify(payload, null, 2),
		};
	},

	exportResumeData: async (input: {
		userId: string;
		baseResumeId?: string | null | undefined;
		itemIds?: string[] | undefined;
	}) => {
		const rows = await db
			.select()
			.from(schema.vaultItem)
			.where(
				and(
					eq(schema.vaultItem.userId, input.userId),
					eq(schema.vaultItem.archived, false),
					input.itemIds?.length ? inArray(schema.vaultItem.id, input.itemIds) : undefined,
				),
			)
			.orderBy(desc(schema.vaultItem.importance), desc(schema.vaultItem.updatedAt));
		const baseResume = input.baseResumeId
			? await resumeService.getById({ id: input.baseResumeId, userId: input.userId })
			: null;
		return {
			name: "Career Vault Export",
			data: buildResumeDataFromVault({
				...(baseResume ? { baseData: baseResume.data } : {}),
				items: rows.map((item) => ({ type: item.type, content: item.content })),
			}),
		};
	},
};
