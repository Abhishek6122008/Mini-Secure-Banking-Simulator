-- Completed transfers are history: nobody, not even a bug in the API, may change or delete them.
CREATE FUNCTION reject_transaction_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'transactions are immutable' USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER transactions_immutable
  BEFORE UPDATE OR DELETE ON "transactions"
  FOR EACH ROW EXECUTE FUNCTION reject_transaction_change();
--> statement-breakpoint
CREATE TRIGGER transactions_no_truncate
  BEFORE TRUNCATE ON "transactions"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_transaction_change();
