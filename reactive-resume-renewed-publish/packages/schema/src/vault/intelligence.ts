import z from "zod";
import {
	vaultImportCandidateSchema,
	vaultItemContentSchema,
	vaultItemMetadataSchema,
	vaultItemTypeSchema,
} from "./data";

export const jobRequirementSchema = z.object({
	id: z.string(),
	label: z.string(),
	canonical: z.string(),
	priority: z.enum(["required", "preferred", "general"]),
	weight: z.number().positive(),
});

export type JobRequirement = z.infer<typeof jobRequirementSchema>;

export const vaultRecommendationSnapshotSchema = z.object({
	vaultItemId: z.string(),
	label: z.string(),
	type: vaultItemTypeSchema,
	version: z.number().int().positive(),
	score: z.number().int().min(0).max(100),
	matchedRequirements: z.array(z.string()),
	rationale: z.string(),
});

export type VaultRecommendationSnapshot = z.infer<typeof vaultRecommendationSnapshotSchema>;

export const applicationAnalysisResultSchema = z.object({
	score: z.number().int().min(0).max(100),
	jobFingerprint: z.string(),
	requirements: z.array(jobRequirementSchema),
	matchedRequirements: z.array(z.string()),
	missingKeywords: z.array(z.string()),
	recommendations: z.array(vaultRecommendationSnapshotSchema),
	analyzedAt: z.coerce.date(),
});

export type ApplicationAnalysisResult = z.infer<typeof applicationAnalysisResultSchema>;

export const vaultImportPreviewSchema = z.object({
	importId: z.string(),
	fileName: z.string(),
	fileType: z.string(),
	candidates: z.array(vaultImportCandidateSchema),
	duplicateCount: z.number().int().nonnegative(),
});

export type VaultImportPreview = z.infer<typeof vaultImportPreviewSchema>;

export const vaultSnapshotItemSchema = vaultItemMetadataSchema.extend({
	vaultItemId: z.string(),
	label: z.string(),
	type: vaultItemTypeSchema,
	version: z.number().int().positive(),
	content: vaultItemContentSchema,
});

export type VaultSnapshotItem = z.infer<typeof vaultSnapshotItemSchema>;
