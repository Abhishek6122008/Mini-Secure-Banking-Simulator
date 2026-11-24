ALTER TABLE "transactions" DROP CONSTRAINT "transactions_amount_range";
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_range"
	CHECK ("transactions"."amount" > 0 AND "transactions"."amount" <= 100000000000);
