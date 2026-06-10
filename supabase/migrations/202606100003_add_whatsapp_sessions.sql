-- Create whatsapp_sessions table for storing Baileys authentication session states
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service_role to do everything (REST API bypass)
CREATE POLICY "Allow service role full access" ON whatsapp_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
