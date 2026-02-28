CREATE TABLE "ifood_oauth_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"user_code" text NOT NULL,
	"authorization_code_verifier" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ifood_integrations" ADD COLUMN "catalog_id" text;--> statement-breakpoint
ALTER TABLE "ifood_integrations" ADD COLUMN "catalog_name" text;--> statement-breakpoint
ALTER TABLE "ifood_integrations" ADD COLUMN "merchant_name" text;--> statement-breakpoint
ALTER TABLE "ifood_oauth_sessions" ADD CONSTRAINT "ifood_oauth_sessions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;