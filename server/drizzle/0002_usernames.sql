ALTER TABLE "users" ADD COLUMN "username" varchar(30);
--> statement-breakpoint
UPDATE "users" u SET "username" = a."account_id" FROM "accounts" a WHERE a."owner_user_id" = u."id";
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_number" varchar(16);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_phone_number_unique" UNIQUE("phone_number");
