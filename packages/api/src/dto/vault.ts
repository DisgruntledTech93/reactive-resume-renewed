import { createSelectSchema } from "drizzle-zod";
import z from "zod";
import * as schema from "@reactive-resume/db/schema";
import { resumeDataSchema } from "@reactive-resume/schema/resume/data";
import {
	vaultItemContentSchema,
	vaultItemMetadataSchema,
	vaultItemTypeSchema,
	vaultSourceTypeSchema,
} from "@reactive-resume/schema/vault/data";
import { applicationAnalysisResultSchema, vaultImportPreviewSchema } from "@reactive-resume/schema/vault/intelligence";

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const importFileSchema = z.file().max(MAX_IMPORT_BYTES, "Resume files must be 10 MB or smaller.");

const vaultItemSchema = createSelectSchema(schema.vaultItem, {
	id: z.string().describe("The ID of the Vault item."),
	type: vaultItemTypeSchema,
	label: z.string().trim().min(1).max(160),
	content: vaultItemContentSchema,
	tags: z.array(z.string().trim().min(1).max(60)).max(50),
	keywords: vaultItemMetadataSchema.shape.keywords,
	technologies: vaultItemMetadataSchema.shape.technologies,
	industries: vaultItemMetadataSchema.shape.industries,
	targetRoles: vaultItemMetadataSchema.shape.targetRoles,
	importance: vaultItemMetadataSchema.shape.importance,
	notes: z.string().max(10_000).nullable(),
	archived: z.boolean(),
	version: z.number().int().min(1),
	contentFingerprint: z.string(),
	sourceType: vaultSourceTypeSchema,
	sourceName: z.string().max(255).nullable(),
	importId: z.string().nullable(),
	sourceResumeId: z.string().nullable(),
	sourceItemId: z.string().nullable(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

const editableSchema = vaultItemSchema
	.pick({
		type: true,
		label: true,
		content: true,
		tags: true,
		keywords: true,
		technologies: true,
		industries: true,
		targetRoles: true,
		importance: true,
		notes: true,
		sourceType: true,
		sourceName: true,
		sourceResumeId: true,
		sourceItemId: true,
	})
	.extend({
		tags: vaultItemSchema.shape.tags.default([]),
		keywords: vaultItemSchema.shape.keywords.default([]),
		technologies: vaultItemSchema.shape.technologies.default([]),
		industries: vaultItemSchema.shape.industries.default([]),
		targetRoles: vaultItemSchema.shape.targetRoles.default([]),
		importance: vaultItemSchema.shape.importance.default(3),
		notes: vaultItemSchema.shape.notes.default(null),
		sourceType: vaultItemSchema.shape.sourceType.default("manual"),
		sourceName: vaultItemSchema.shape.sourceName.default(null),
		sourceResumeId: vaultItemSchema.shape.sourceResumeId.default(null),
		sourceItemId: vaultItemSchema.shape.sourceItemId.default(null),
	});

export const vaultDto = {
	list: {
		input: z
			.object({
				search: z.string().trim().max(200).optional(),
				types: z.array(vaultItemTypeSchema).optional(),
				tags: z.array(z.string()).optional(),
				includeArchived: z.boolean().optional().default(false),
				sourceResumeId: z.string().optional(),
			})
			.optional()
			.default({ includeArchived: false }),
		output: z.array(vaultItemSchema.omit({ userId: true })),
	},

	getById: {
		input: vaultItemSchema.pick({ id: true }),
		output: vaultItemSchema.omit({ userId: true }),
	},

	create: {
		input: editableSchema,
		output: z.string(),
	},

	update: {
		input: editableSchema.partial().extend({ id: z.string(), archived: z.boolean().optional() }),
		output: vaultItemSchema.omit({ userId: true }),
	},

	delete: {
		input: vaultItemSchema.pick({ id: true }),
		output: z.void(),
	},

	bulkUpdate: {
		input: z.object({
			ids: z.array(z.string()).min(1).max(200),
			archived: z.boolean().optional(),
			addTags: z.array(z.string()).optional(),
		}),
		output: z.object({ updated: z.number() }),
	},

	bulkDelete: {
		input: z.object({ ids: z.array(z.string()).min(1).max(200) }),
		output: z.object({ deleted: z.number() }),
	},

	tags: {
		input: z.object({}).optional().default({}),
		output: z.array(z.string()),
	},

	importFromResume: {
		input: z.object({
			resumeId: z.string(),
			types: z.array(vaultItemTypeSchema).optional(),
		}),
		output: z.object({ imported: z.number(), updated: z.number() }),
	},

	previewFileImport: {
		input: z.object({ file: importFileSchema }),
		output: vaultImportPreviewSchema,
	},

	previewResumeImport: {
		input: z.object({ resumeId: z.string() }),
		output: vaultImportPreviewSchema,
	},

	commitImport: {
		input: z.object({ importId: z.string(), selectedCandidateIds: z.array(z.string()).max(500) }),
		output: z.object({ imported: z.number().int().nonnegative(), skippedDuplicates: z.number().int().nonnegative() }),
	},

	versions: {
		input: z.object({ id: z.string() }),
		output: z.array(
			z.object({
				id: z.string(),
				version: z.number().int().positive(),
				changeReason: z.string(),
				createdAt: z.date(),
			}),
		),
	},

	restoreVersion: {
		input: z.object({ id: z.string(), versionId: z.string() }),
		output: vaultItemSchema.omit({ userId: true }),
	},

	match: {
		input: z.object({
			jobDescription: z.string().trim().min(20).max(20_000),
			types: z.array(vaultItemTypeSchema).optional(),
			limit: z.number().int().min(1).max(200).optional().default(100),
		}),
		output: z.array(
			z.object({
				item: vaultItemSchema.omit({ userId: true }),
				score: z.number().int().min(0).max(100),
				matchedKeywords: z.array(z.string()),
			}),
		),
	},

	createResume: {
		input: z.object({
			name: z.string().trim().min(1).max(100),
			baseResumeId: z.string().nullable().optional(),
			applicationId: z.string().nullable().optional(),
			itemIds: z.array(z.string()).min(1).max(200),
			tags: z.array(z.string()).optional().default([]),
		}),
		output: z.object({ id: z.string(), name: z.string() }),
	},

	applicationAnalysis: {
		input: z.object({ applicationId: z.string() }),
		output: applicationAnalysisResultSchema,
	},

	getApplicationAnalysis: {
		input: z.object({ applicationId: z.string() }),
		output: applicationAnalysisResultSchema.nullable(),
	},

	exportPortable: {
		input: z.object({ format: z.enum(["json", "markdown"]), includeArchived: z.boolean().optional().default(false) }),
		output: z.object({ fileName: z.string(), mimeType: z.string(), content: z.string() }),
	},

	exportResumeData: {
		input: z.object({
			baseResumeId: z.string().nullable().optional(),
			itemIds: z.array(z.string()).max(500).optional(),
		}),
		output: z.object({ name: z.string(), data: resumeDataSchema }),
	},
};
