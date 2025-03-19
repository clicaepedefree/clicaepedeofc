CREATE TABLE "stores" (
	"id" serial PRIMARY KEY NOT NULL,
	"subdomain" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "stores_subdomain_unique" UNIQUE("subdomain")
);
