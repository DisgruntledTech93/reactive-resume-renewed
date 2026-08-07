CREATE TABLE "application_analysis" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"application_id" text NOT NULL UNIQUE,
	"result" jsonb NOT NULL,
	"job_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_snapshot" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"resume_id" text NOT NULL,
	"base_resume_id" text,
	"application_id" text,
	"vault_items" jsonb NOT NULL,
	"analysis" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_import" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"source_resume_id" text,
	"status" text DEFAULT 'review' NOT NULL,
	"content_hash" text NOT NULL,
	"candidates" jsonb DEFAULT '[]' NOT NULL,
	"discovered_count" integer DEFAULT 0 NOT NULL,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "vault_item_version" (
	"id" text PRIMARY KEY,
	"vault_item_id" text NOT NULL,
	"user_id" text NOT NULL,
	"version" integer NOT NULL,
	"label" text NOT NULL,
	"content" jsonb NOT NULL,
	"metadata" jsonb NOT NULL,
	"change_reason" text DEFAULT 'updated' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vault_item_version_vault_item_id_version_unique" UNIQUE("vault_item_id","version")
);
--> statement-breakpoint
ALTER TABLE "vault_item" ADD COLUMN "keywords" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "vault_item" ADD COLUMN "technologies" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "vault_item" ADD COLUMN "industries" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "vault_item" ADD COLUMN "target_roles" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "vault_item" ADD COLUMN "importance" smallint DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "vault_item" ADD COLUMN "content_fingerprint" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "vault_item" ADD COLUMN "source_type" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "vault_item" ADD COLUMN "source_name" text;--> statement-breakpoint
ALTER TABLE "vault_item" ADD COLUMN "import_id" text;--> statement-breakpoint
INSERT INTO "vault_item_version" (
	"id", "vault_item_id", "user_id", "version", "label", "content", "metadata", "change_reason", "created_at"
)
SELECT
	md5("id" || ':career-intelligence-v' || "version"::text),
	"id",
	"user_id",
	"version",
	"label",
	"content",
	jsonb_build_object(
		'tags', "tags",
		'keywords', '{}'::text[],
		'technologies', '{}'::text[],
		'industries', '{}'::text[],
		'targetRoles', '{}'::text[],
		'importance', 3,
		'notes', "notes",
		'archived', "archived",
		'sourceType', 'manual',
		'sourceName', NULL,
		'importId', NULL,
		'sourceResumeId', "source_resume_id",
		'sourceItemId', "source_item_id"
	),
	'migrated from v5.3',
	"updated_at"
FROM "vault_item";--> statement-breakpoint
CREATE INDEX "application_analysis_user_id_updated_at_index" ON "application_analysis" ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "resume_snapshot_user_id_created_at_index" ON "resume_snapshot" ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "resume_snapshot_resume_id_index" ON "resume_snapshot" ("resume_id");--> statement-breakpoint
CREATE INDEX "vault_import_user_id_index" ON "vault_import" ("user_id");--> statement-breakpoint
CREATE INDEX "vault_import_user_id_created_at_index" ON "vault_import" ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "vault_item_user_id_content_fingerprint_index" ON "vault_item" ("user_id","content_fingerprint");--> statement-breakpoint
CREATE INDEX "vault_item_version_user_id_created_at_index" ON "vault_item_version" ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "application_analysis" ADD CONSTRAINT "application_analysis_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "application_analysis" ADD CONSTRAINT "application_analysis_application_id_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "resume_snapshot" ADD CONSTRAINT "resume_snapshot_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "resume_snapshot" ADD CONSTRAINT "resume_snapshot_resume_id_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "resume"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "resume_snapshot" ADD CONSTRAINT "resume_snapshot_base_resume_id_resume_id_fkey" FOREIGN KEY ("base_resume_id") REFERENCES "resume"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "resume_snapshot" ADD CONSTRAINT "resume_snapshot_application_id_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "vault_import" ADD CONSTRAINT "vault_import_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "vault_import" ADD CONSTRAINT "vault_import_source_resume_id_resume_id_fkey" FOREIGN KEY ("source_resume_id") REFERENCES "resume"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "vault_item" ADD CONSTRAINT "vault_item_import_id_vault_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "vault_import"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "vault_item_version" ADD CONSTRAINT "vault_item_version_vault_item_id_vault_item_id_fkey" FOREIGN KEY ("vault_item_id") REFERENCES "vault_item"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "vault_item_version" ADD CONSTRAINT "vault_item_version_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
