-- Remove obsolete Fast2SMS / provider-switch settings (SMSGate is now the only SMS sender).
DELETE FROM public.system_settings
WHERE key IN ('fast2sms_api_key', 'sms_provider');
