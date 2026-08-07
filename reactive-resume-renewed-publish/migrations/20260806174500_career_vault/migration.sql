CREATE TABLE "vault_item" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"label" text NOT NULL,
	"content" jsonb NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"notes" text,
	"archived" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"source_resume_id" text,
	"source_item_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vault_item_user_id_source_resume_id_source_item_id_unique" UNIQUE("user_id","source_resume_id","source_item_id")
);
--> statement-breakpoint
ALTER TABLE "vault_item" ADD CONSTRAINT "vault_item_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vault_item" ADD CONSTRAINT "vault_item_source_resume_id_resume_id_fkey" FOREIGN KEY ("source_resume_id") REFERENCES "public"."resume"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "vault_item_user_id_index" ON "vault_item" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "vault_item_user_id_type_index" ON "vault_item" USING btree ("user_id","type");
--> statement-breakpoint
CREATE INDEX "vault_item_user_id_updated_at_index" ON "vault_item" USING btree ("user_id","updated_at" DESC NULLS LAST);
