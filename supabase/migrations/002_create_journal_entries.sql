-- Create journal_entries table for reviews
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  review_type TEXT NOT NULL CHECK (review_type IN ('after-action', 'progress')),
  title TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, entry_date, review_type)
);

-- Create indexes for better query performance
CREATE INDEX idx_journal_entries_user_id ON journal_entries(user_id);
CREATE INDEX idx_journal_entries_entry_date ON journal_entries(entry_date DESC);
CREATE INDEX idx_journal_entries_review_type ON journal_entries(review_type);

-- Enable Row Level Security
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

-- Create RLS policies - users can only see their own data
CREATE POLICY "Users can view their own journal entries" ON journal_entries
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own journal entries" ON journal_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own journal entries" ON journal_entries
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own journal entries" ON journal_entries
  FOR DELETE USING (auth.uid() = user_id);
