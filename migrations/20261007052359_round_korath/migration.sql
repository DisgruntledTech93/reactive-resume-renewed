CREATE TABLE IF NOT EXISTS "application_analysis" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"application_id" text NOT NULL UNIQUE,
	"result" jsonb NOT NULL,
	"job_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "resume_snapshot" (
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
CREATE TABLE IF NOT EXISTS "vault_import" (
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
CREATE TABLE IF NOT EXISTS "vault_item" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"label" text NOT NULL,
	"content" jsonb NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"technologies" text[] DEFAULT '{}'::text[] NOT NULL,
	"industries" text[] DEFAULT '{}'::text[] NOT NULL,
	"target_roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"importance" smallint DEFAULT 3 NOT NULL,
	"notes" text,
	"archived" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"content_fingerprint" text DEFAULT '' NOT NULL,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"source_name" text,
	"import_id" text,
	"source_resume_id" text,
	"source_item_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vault_item_user_id_source_resume_id_source_item_id_unique" UNIQUE("user_id","source_resume_id","source_item_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vault_item_version" (
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
CREATE INDEX IF NOT EXISTS "application_analysis_user_id_updated_at_index" ON "application_analysis" ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resume_snapshot_user_id_created_at_index" ON "resume_snapshot" ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resume_snapshot_resume_id_index" ON "resume_snapshot" ("resume_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vault_import_user_id_index" ON "vault_import" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vault_import_user_id_created_at_index" ON "vault_import" ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vault_item_user_id_index" ON "vault_item" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vault_item_user_id_type_index" ON "vault_item" ("user_id","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vault_item_user_id_updated_at_index" ON "vault_item" ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vault_item_user_id_content_fingerprint_index" ON "vault_item" ("user_id","content_fingerprint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vault_item_version_user_id_created_at_index" ON "vault_item_version" ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'application_analysis_user_id_user_id_fkey'
          AND conrelid = to_regclass('public.application_analysis')
    ) THEN
        ALTER TABLE "application_analysis" ADD CONSTRAINT "application_analysis_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
    END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'application_analysis_application_id_application_id_fkey'
          AND conrelid = to_regclass('public.application_analysis')
    ) THEN
        ALTER TABLE "application_analysis" ADD CONSTRAINT "application_analysis_application_id_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE CASCADE;
    END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'resume_snapshot_user_id_user_id_fkey'
          AND conrelid = to_regclass('public.resume_snapshot')
    ) THEN
        ALTER TABLE "resume_snapshot" ADD CONSTRAINT "resume_snapshot_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
    END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'resume_snapshot_resume_id_resume_id_fkey'
          AND conrelid = to_regclass('public.resume_snapshot')
    ) THEN
        ALTER TABLE "resume_snapshot" ADD CONSTRAINT "resume_snapshot_resume_id_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "resume"("id") ON DELETE CASCADE;
    END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'resume_snapshot_base_resume_id_resume_id_fkey'
          AND conrelid = to_regclass('public.resume_snapshot')
    ) THEN
        ALTER TABLE "resume_snapshot" ADD CONSTRAINT "resume_snapshot_base_resume_id_resume_id_fkey" FOREIGN KEY ("base_resume_id") REFERENCES "resume"("id") ON DELETE SET NULL;
    END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'resume_snapshot_application_id_application_id_fkey'
          AND conrelid = to_regclass('public.resume_snapshot')
    ) THEN
        ALTER TABLE "resume_snapshot" ADD CONSTRAINT "resume_snapshot_application_id_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE SET NULL;
    END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'vault_import_user_id_user_id_fkey'
          AND conrelid = to_regclass('public.vault_import')
    ) THEN
        ALTER TABLE "vault_import" ADD CONSTRAINT "vault_import_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
    END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'vault_import_source_resume_id_resume_id_fkey'
          AND conrelid = to_regclass('public.vault_import')
    ) THEN
        ALTER TABLE "vault_import" ADD CONSTRAINT "vault_import_source_resume_id_resume_id_fkey" FOREIGN KEY ("source_resume_id") REFERENCES "resume"("id") ON DELETE SET NULL;
    END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'vault_item_user_id_user_id_fkey'
          AND conrelid = to_regclass('public.vault_item')
    ) THEN
        ALTER TABLE "vault_item" ADD CONSTRAINT "vault_item_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
    END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'vault_item_import_id_vault_import_id_fkey'
          AND conrelid = to_regclass('public.vault_item')
    ) THEN
        ALTER TABLE "vault_item" ADD CONSTRAINT "vault_item_import_id_vault_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "vault_import"("id") ON DELETE SET NULL;
    END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'vault_item_source_resume_id_resume_id_fkey'
          AND conrelid = to_regclass('public.vault_item')
    ) THEN
        ALTER TABLE "vault_item" ADD CONSTRAINT "vault_item_source_resume_id_resume_id_fkey" FOREIGN KEY ("source_resume_id") REFERENCES "resume"("id") ON DELETE SET NULL;
    END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'vault_item_version_vault_item_id_vault_item_id_fkey'
          AND conrelid = to_regclass('public.vault_item_version')
    ) THEN
        ALTER TABLE "vault_item_version" ADD CONSTRAINT "vault_item_version_vault_item_id_vault_item_id_fkey" FOREIGN KEY ("vault_item_id") REFERENCES "vault_item"("id") ON DELETE CASCADE;
    END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'vault_item_version_user_id_user_id_fkey'
          AND conrelid = to_regclass('public.vault_item_version')
    ) THEN
        ALTER TABLE "vault_item_version" ADD CONSTRAINT "vault_item_version_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
    END IF;
END
$$;