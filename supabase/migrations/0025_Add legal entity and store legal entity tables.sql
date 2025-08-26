CREATE TABLE "legal_entities" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"trade_name" text NOT NULL,
	"federal_tax_number" text NOT NULL,
	"tax_regime" text NOT NULL,
	"postal_code" text NOT NULL,
	"street" text NOT NULL,
	"number" text NOT NULL,
	"complement" text,
	"district" text NOT NULL,
	"city_name" text NOT NULL,
	"city_code" text NOT NULL,
	"state_code" char(2) NOT NULL,
	"country_code" char(3) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "legal_entities_federal_tax_number_unique" UNIQUE("federal_tax_number")
);
--> statement-breakpoint
CREATE TABLE "stores_legal_entity" (
	"store_id" integer NOT NULL,
	"legal_entity_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "stores_legal_entity_store_id_unique" UNIQUE("store_id")
);
--> statement-breakpoint
ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores_legal_entity" ADD CONSTRAINT "stores_legal_entity_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores_legal_entity" ADD CONSTRAINT "stores_legal_entity_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;