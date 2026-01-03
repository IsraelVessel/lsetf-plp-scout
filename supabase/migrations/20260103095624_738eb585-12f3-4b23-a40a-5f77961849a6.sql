-- Add retry tracking columns to notification_history
ALTER TABLE public.notification_history 
ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_retry_at timestamp with time zone;

-- Enable realtime for notification_history table
ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_history;