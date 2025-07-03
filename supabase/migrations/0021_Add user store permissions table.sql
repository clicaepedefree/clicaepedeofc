CREATE TABLE "user_store_permissions" (
	"user_id" uuid NOT NULL,
	"store_id" integer NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "user_store_permissions_user_id_store_id_pk" PRIMARY KEY("user_id","store_id")
);
--> statement-breakpoint
ALTER TABLE "user_store_permissions" ADD CONSTRAINT "user_store_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_store_permissions" ADD CONSTRAINT "user_store_permissions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;