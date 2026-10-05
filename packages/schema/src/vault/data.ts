import z from "zod";
import {
	awardItemSchema,
	certificationItemSchema,
	educationItemSchema,
	experienceItemSchema,
	interestItemSchema,
	languageItemSchema,
	profileItemSchema,
	projectItemSchema,
	publicationItemSchema,
	referenceItemSchema,
	skillItemSchema,
	summaryItemSchema,
	volunteerItemSchema,
} from "../resume/data";

export const vaultItemTypeSchema = z.enum([
	"summary",
	"profiles",
	"experience",
	"education",
	"projects",
	"skills",
	"languages",
	"interests",
	"awards",
	"certifications",
	"publications",
	"volunteer",
	"references",
]);

export type VaultItemType = z.infer<typeof vaultItemTypeSchema>;

export const vaultItemContentSchemaByType = {
	summary: summaryItemSchema,
	profiles: profileItemSchema,
	experience: experienceItemSchema,
	education: educationItemSchema,
	projects: projectItemSchema,
	skills: skillItemSchema,
	languages: languageItemSchema,
	interests: interestItemSchema,
	awards: awardItemSchema,
	certifications: certificationItemSchema,
	publications: publicationItemSchema,
	volunteer: volunteerItemSchema,
	references: referenceItemSchema,
} as const satisfies Record<VaultItemType, z.ZodType>;

export const vaultItemContentSchema = z.union([
	summaryItemSchema,
	profileItemSchema,
	experienceItemSchema,
	educationItemSchema,
	projectItemSchema,
	skillItemSchema,
	languageItemSchema,
	interestItemSchema,
	awardItemSchema,
	certificationItemSchema,
	publicationItemSchema,
	volunteerItemSchema,
	referenceItemSchema,
]);

export type VaultItemContent = z.infer<typeof vaultItemContentSchema>;

export const vaultSourceTypeSchema = z.enum(["manual", "resume", "file", "generated"]);
export type VaultSourceType = z.infer<typeof vaultSourceTypeSchema>;

export const vaultImportFileTypeSchema = z.enum(["reactive-resume-json", "pdf", "docx", "txt"]);
export type VaultImportFileType = z.infer<typeof vaultImportFileTypeSchema>;

export const vaultItemMetadataSchema = z.object({
	keywords: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
	technologies: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
	industries: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
	targetRoles: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
	importance: z.number().int().min(1).max(5).default(3),
});

export type VaultItemMetadata = z.infer<typeof vaultItemMetadataSchema>;

export const vaultImportCandidateSchema = vaultItemMetadataSchema.extend({
	id: z.string(),
	type: vaultItemTypeSchema,
	label: z.string().trim().min(1).max(160),
	content: vaultItemContentSchema,
	fingerprint: z.string(),
	duplicateOfId: z.string().nullable().default(null),
});

export type VaultImportCandidate = z.infer<typeof vaultImportCandidateSchema>;

export const vaultItemPayloadSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("summary"), content: summaryItemSchema }),
	z.object({ type: z.literal("profiles"), content: profileItemSchema }),
	z.object({ type: z.literal("experience"), content: experienceItemSchema }),
	z.object({ type: z.literal("education"), content: educationItemSchema }),
	z.object({ type: z.literal("projects"), content: projectItemSchema }),
	z.object({ type: z.literal("skills"), content: skillItemSchema }),
	z.object({ type: z.literal("languages"), content: languageItemSchema }),
	z.object({ type: z.literal("interests"), content: interestItemSchema }),
	z.object({ type: z.literal("awards"), content: awardItemSchema }),
	z.object({ type: z.literal("certifications"), content: certificationItemSchema }),
	z.object({ type: z.literal("publications"), content: publicationItemSchema }),
	z.object({ type: z.literal("volunteer"), content: volunteerItemSchema }),
	z.object({ type: z.literal("references"), content: referenceItemSchema }),
]);

export type VaultItemPayload = z.infer<typeof vaultItemPayloadSchema>;

export function parseVaultItemContent(type: VaultItemType, content: unknown): VaultItemContent {
	return vaultItemContentSchemaByType[type].parse(content) as VaultItemContent;
}
