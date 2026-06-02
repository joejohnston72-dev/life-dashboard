import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const supabase = createClient(
  'https://xjcnkivlkfzdycbyxxlx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqY25raXZsa2Z6ZHljYnl4eGx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MjQwODIsImV4cCI6MjA5NjAwMDA4Mn0.bt4X0cz2gu7GUdb8OC7uvVLPDKJWws8RyvSmwGkHcVI'
);
