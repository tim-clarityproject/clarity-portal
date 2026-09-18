-- Remove unique constraint to allow multiple reviews of same type per day
ALTER TABLE journal_entries DROP CONSTRAINT journal_entries_user_id_entry_date_review_type_key;
