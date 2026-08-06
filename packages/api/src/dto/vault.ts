import { createSelectSchema } from "drizzle-zod";
import z from "zod";
import * as schema from "@reactive-resume/db/schema";
import {
	vaultItemContentSchema,
	vaultItemTypeSchema,
} from "@reactive-resume/schema/vault/data";

const vaultItemSchema = createSelectSchema(schema.vaultItem, {
	id: z.string().describe("The ID of the Vault item."),
	type: vaultItemTypeSchema,
	label: z.string().trim().min(1).max(160),
	content: vaultItemContentSchema,
	tags: z.array(z.string().trim().min(1).max(60)).max(50),
	notes: z.string().max(10_000).nullable(),
	archived: z.boolean(),
	version: z.number().int().min(1),
	sourceResumeId: z.string().nullable(),
	sourceItemId: z.string().nullable(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

const editableSchema = vaultItemSchema.pick({
	type: true,
	label: true,
	content: true,
	tags: true,
	notes: true,
	sourceResumeId: true,
	sourceItemId: true,
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
			itemIds: z.array(z.string()).min(1).max(200),
			tags: z.array(z.string()).optional().default([]),
		}),
		output: z.object({ id: z.string(), name: z.string() }),
	},
};
