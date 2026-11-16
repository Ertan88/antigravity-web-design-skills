ALTER TABLE "push_tokens" DROP CONSTRAINT IF EXISTS "push_tokens_token_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "push_tokens_token_user_uq" ON "push_tokens" USING btree ("token","user_id");
