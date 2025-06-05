CREATE TABLE "order_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"value" numeric(19, 4) NOT NULL,
	"type" text NOT NULL,
	"method" text NOT NULL,
	"change_for" text,
	CONSTRAINT "change_for_required_for_cash" CHECK ("order_payments"."method" != 'CASH' OR "order_payments"."change_for" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;