import type {
	VaultImportCandidate,
	VaultImportFileType,
	VaultItemContent,
	VaultItemType,
	VaultSourceType,
} from "@reactive-resume/schema/vault/data";
import type { ApplicationAnalysisResult, VaultSnapshotItem } from "@reactive-resume/schema/vault/intelligence";
import * as pg from "drizzle-orm/pg-core";
import { generateId } from "@reactive-resume/utils/string";
import { application } from "./applications";
import { user } from "./auth";
import { resume } from "./resume";

export const vaultImport = pg.pgTable(
	"vault_import",
	{
		id: pg
			.text("id")
			.notNull()
			.primaryKey()
			.$defaultFn(() => generateId()),
		userId: pg
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		fileName: pg.text("file_name").notNull(),
		fileType: pg.text("file_type").$type<VaultImportFileType>().notNull(),
		sourceResumeId: pg.text("source_resume_id").references(() => resume.id, { onDelete: "set null" }),
		status: pg.text("status").$type<"review" | "completed" | "cancelled" | "failed">().notNull().default("review"),
		contentHash: pg.text("content_hash").notNull(),
		candidates: pg.jsonb("candidates").$type<VaultImportCandidate[]>().notNull().default([]),
		discoveredCount: pg.integer("discovered_count").notNull().default(0),
		importedCount: pg.integer("imported_count").notNull().default(0),
		duplicateCount: pg.integer("duplicate_count").notNull().default(0),
		createdAt: pg.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		completedAt: pg.timestamp("completed_at", { withTimezone: true }),
	},
	(t) => [pg.index().on(t.userId), pg.index().on(t.userId, t.createdAt.desc())],
);

export const vaultItem = pg.pgTable(
	"vault_item",
	{
		id: pg
			.text("id")
			.notNull()
			.primaryKey()
			.$defaultFn(() => generateId()),
		userId: pg
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		type: pg.text("type").$type<VaultItemType>().notNull(),
		label: pg.text("label").notNull(),
		content: pg.jsonb("content").$type<VaultItemContent>().notNull(),
		tags: pg.text("tags").array().notNull().default([]),
		keywords: pg.text("keywords").array().notNull().default([]),
		technologies: pg.text("technologies").array().notNull().default([]),
		industries: pg.text("industries").array().notNull().default([]),
		targetRoles: pg.text("target_roles").array().notNull().default([]),
		importance: pg.smallint("importance").notNull().default(3),
		notes: pg.text("notes"),
		archived: pg.boolean("archived").notNull().default(false),
		version: pg.integer("version").notNull().default(1),
		contentFingerprint: pg.text("content_fingerprint").notNull().default(""),
		sourceType: pg.text("source_type").$type<VaultSourceType>().notNull().default("manual"),
		sourceName: pg.text("source_name"),
		importId: pg.text("import_id").references(() => vaultImport.id, { onDelete: "set null" }),
		sourceResumeId: pg.text("source_resume_id").references(() => resume.id, { onDelete: "set null" }),
		sourceItemId: pg.text("source_item_id"),
		createdAt: pg.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: pg
			.timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date()),
	},
	(t) => [
		pg.index().on(t.userId),
		pg.index().on(t.userId, t.type),
		pg.index().on(t.userId, t.updatedAt.desc()),
		pg.index().on(t.userId, t.contentFingerprint),
		pg.unique().on(t.userId, t.sourceResumeId, t.sourceItemId),
	],
);

export const vaultItemVersion = pg.pgTable(
	"vault_item_version",
	{
		id: pg
			.text("id")
			.notNull()
			.primaryKey()
			.$defaultFn(() => generateId()),
		vaultItemId: pg
			.text("vault_item_id")
			.notNull()
			.references(() => vaultItem.id, { onDelete: "cascade" }),
		userId: pg
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		version: pg.integer("version").notNull(),
		label: pg.text("label").notNull(),
		content: pg.jsonb("content").$type<VaultItemContent>().notNull(),
		metadata: pg.jsonb("metadata").$type<Record<string, unknown>>().notNull(),
		changeReason: pg.text("change_reason").notNull().default("updated"),
		createdAt: pg.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [pg.unique().on(t.vaultItemId, t.version), pg.index().on(t.userId, t.createdAt.desc())],
);

export const applicationAnalysis = pg.pgTable(
	"application_analysis",
	{
		id: pg
			.text("id")
			.notNull()
			.primaryKey()
			.$defaultFn(() => generateId()),
		userId: pg
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		applicationId: pg
			.text("application_id")
			.notNull()
			.references(() => application.id, { onDelete: "cascade" }),
		result: pg.jsonb("result").$type<ApplicationAnalysisResult>().notNull(),
		jobFingerprint: pg.text("job_fingerprint").notNull(),
		createdAt: pg.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: pg
			.timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date()),
	},
	(t) => [pg.unique().on(t.applicationId), pg.index().on(t.userId, t.updatedAt.desc())],
);

export const resumeSnapshot = pg.pgTable(
	"resume_snapshot",
	{
		id: pg
			.text("id")
			.notNull()
			.primaryKey()
			.$defaultFn(() => generateId()),
		userId: pg
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		resumeId: pg
			.text("resume_id")
			.notNull()
			.references(() => resume.id, { onDelete: "cascade" }),
		baseResumeId: pg.text("base_resume_id").references(() => resume.id, { onDelete: "set null" }),
		applicationId: pg.text("application_id").references(() => application.id, { onDelete: "set null" }),
		vaultItems: pg.jsonb("vault_items").$type<VaultSnapshotItem[]>().notNull(),
		analysis: pg.jsonb("analysis").$type<ApplicationAnalysisResult>(),
		createdAt: pg.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [pg.index().on(t.userId, t.createdAt.desc()), pg.index().on(t.resumeId)],
);
