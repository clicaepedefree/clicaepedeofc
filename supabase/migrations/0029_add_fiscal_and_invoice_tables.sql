CREATE TYPE "public"."fiscal_config_status" AS ENUM('pending_setup', 'pending_certificate', 'active', 'error');--> statement-breakpoint
CREATE TYPE "public"."nfeio_environment" AS ENUM('sandbox', 'production');--> statement-breakpoint
CREATE TYPE "public"."service_invoice_status" AS ENUM('pending', 'processing', 'issued', 'error', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."service_invoice_type" AS ENUM('NFCE');--> statement-breakpoint
CREATE TYPE "public"."tax_regime" AS ENUM('simplesNacional', 'simplesNacionalExcessoSublimite', 'regimeNormal', 'mei');--> statement-breakpoint
CREATE TABLE "service_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"type" "service_invoice_type" DEFAULT 'NFCE' NOT NULL,
	"series" integer NOT NULL,
	"invoice_number" integer NOT NULL,
	"nfeio_invoice_id" text,
	"status" "service_invoice_status" DEFAULT 'pending' NOT NULL,
	"customer_cpf" text,
	"pdf_url" text,
	"xml_url" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_auto_emission_payment_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"payment_method" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "store_auto_emission_payment_methods_store_method_unique" UNIQUE("store_id","payment_method")
);
--> statement-breakpoint
CREATE TABLE "store_fiscal_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"nfeio_api_key" text,
	"nfeio_company_id" text,
	"environment" "nfeio_environment" DEFAULT 'sandbox' NOT NULL,
	"status" "fiscal_config_status" DEFAULT 'pending_setup' NOT NULL,
	"federal_tax_number" text,
	"name" text,
	"trade_name" text,
	"tax_regime" "tax_regime",
	"address_street" text,
	"address_number" text,
	"address_complement" text,
	"address_neighborhood" text,
	"address_city" text,
	"address_state" text,
	"address_postal_code" text,
	"address_city_code" text,
	"email" text,
	"phone" text,
	"state_registration" text,
	"municipal_registration" text,
	"csc_id" text,
	"csc_code" text,
	"nfce_series" integer DEFAULT 1 NOT NULL,
	"next_nfce_number" integer DEFAULT 1 NOT NULL,
	"accountant_email" text,
	"certificate_valid_until" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "store_fiscal_configs_store_id_unique" UNIQUE("store_id")
);
--> statement-breakpoint
ALTER TABLE "service_invoices" ADD CONSTRAINT "service_invoices_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_invoices" ADD CONSTRAINT "service_invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_auto_emission_payment_methods" ADD CONSTRAINT "store_auto_emission_payment_methods_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_fiscal_configs" ADD CONSTRAINT "store_fiscal_configs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;