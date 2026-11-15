-- Create system_settings table for dynamic system configurations
CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Grant permissions to service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO service_role;

-- Create policy to allow service_role to do everything (REST API bypass)
DROP POLICY IF EXISTS "Allow service role full access" ON public.system_settings;
CREATE POLICY "Allow service role full access" ON public.system_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);
