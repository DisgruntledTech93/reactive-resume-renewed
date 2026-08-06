import type { VaultItemContent, VaultItemType } from "@reactive-resume/schema/vault/data";
import * as pg from "drizzle-orm/pg-core";
import { generateId } from "@reactive-resume/utils/string";
import { user } from "./auth";
import { resume } from "./resume";

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
		notes: pg.text("notes"),
		archived: pg.boolean("archived").notNull().default(false),
		version: pg.integer("version").notNull().default(1),
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
		pg.unique().on(t.userId, t.sourceResumeId, t.sourceItemId),
	],
);
