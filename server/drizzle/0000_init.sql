CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"account_id" varchar(10) NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_owner_user_id_unique" UNIQUE("owner_user_id"),
	CONSTRAINT "accounts_account_id_unique" UNIQUE("account_id"),
	CONSTRAINT "accounts_account_id_format" CHECK ("accounts"."account_id" ~ '^[1-9][0-9]{9}$'),
	CONSTRAINT "accounts_balance_range" CHECK ("accounts"."balance" >= 0 AND "accounts"."balance" <= 100000000000)
);
--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"sender_account_id" uuid NOT NULL,
	"receiver_account_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"request_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_sender_request_key" UNIQUE("sender_account_id","request_key"),
	CONSTRAINT "transactions_amount_range" CHECK ("transactions"."amount" > 0 AND "transactions"."amount" <= 10000000),
	CONSTRAINT "transactions_not_to_self" CHECK ("transactions"."sender_account_id" <> "transactions"."receiver_account_id")
);
--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" varchar(50) NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_sender_account_id_accounts_id_fk" FOREIGN KEY ("sender_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_receiver_account_id_accounts_id_fk" FOREIGN KEY ("receiver_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_sender_idx" ON "transactions" USING btree ("sender_account_id","id");--> statement-breakpoint
CREATE INDEX "transactions_receiver_idx" ON "transactions" USING btree ("receiver_account_id","id");