CREATE TABLE IF NOT EXISTS "whatsapp_auth_state" (
  "key" text PRIMARY KEY NOT NULL,
  "value" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "whatsapp_chats" (
  "jid" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "phone" text NOT NULL,
  "unread" integer DEFAULT 0 NOT NULL,
  "last_message" text,
  "last_message_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "whatsapp_messages" (
  "id" text PRIMARY KEY NOT NULL,
  "chat_jid" text NOT NULL REFERENCES "whatsapp_chats"("jid") ON DELETE CASCADE,
  "text" text NOT NULL,
  "from_me" boolean DEFAULT false NOT NULL,
  "timestamp" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'sent' NOT NULL
);
CREATE INDEX IF NOT EXISTS "whatsapp_messages_chat_idx" ON "whatsapp_messages" ("chat_jid", "timestamp");