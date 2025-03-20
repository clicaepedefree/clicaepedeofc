CREATE TABLE "configurations" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"default" text,
	"type" text DEFAULT 'switch' NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_configurations" (
	"user_id" integer NOT NULL,
	"configuration_id" integer NOT NULL,
	"value" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "store_configurations_user_id_configuration_id_pk" PRIMARY KEY("user_id","configuration_id")
);
--> statement-breakpoint
ALTER TABLE "store_configurations" ADD CONSTRAINT "store_configurations_user_id_stores_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_configurations" ADD CONSTRAINT "store_configurations_configuration_id_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."configurations"("id") ON DELETE cascade ON UPDATE no action;