CREATE TABLE "counter_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"counter_id" integer NOT NULL,
	"operator_id" uuid NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"open_amount" numeric(19, 4) NOT NULL,
	"open_notes" text,
	"closed_at" timestamp with time zone,
	"close_amount" numeric(19, 4),
	"close_notes" text,
	"closed_by_operator_id" uuid,
	CONSTRAINT "closed_session_has_amount_and_closed_at" CHECK ("counter_sessions"."status" != 'CLOSED' OR ("counter_sessions"."close_amount" IS NOT NULL AND "counter_sessions"."closed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "counter_sessions" ADD CONSTRAINT "counter_sessions_counter_id_counters_id_fk" FOREIGN KEY ("counter_id") REFERENCES "public"."counters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counter_sessions" ADD CONSTRAINT "counter_sessions_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counter_sessions" ADD CONSTRAINT "counter_sessions_closed_by_operator_id_users_id_fk" FOREIGN KEY ("closed_by_operator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "counter_sessions_counter_id_idx" ON "counter_sessions" USING btree ("counter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "single_open_session_per_counter_id" ON "counter_sessions" USING btree ("counter_id") WHERE "counter_sessions"."status" = 'OPEN';--> statement-breakpoint
ALTER TABLE "counters" DROP COLUMN "is_available";