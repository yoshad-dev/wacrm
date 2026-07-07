-- ============================================================
-- whatsapp_config: track when /register was deliberately skipped
--
-- Why this exists:
--   Meta test numbers (Developer Console) are pre-registered by
--   Meta and have no two-step verification PIN. wacrm already
--   skips POST /{phone_number_id}/register when no PIN is supplied
--   on first save, but without a persisted flag the UI cannot tell
--   "skipped for a test number" apart from "not registered".
--
--   This boolean is set to TRUE on first save when /register is
--   skipped because the user provided no PIN. It is reset to FALSE
--   when /register later succeeds. The verify-registration endpoint
--   treats a skipped-but-otherwise-healthy config as live, so test
--   numbers show the green "events will be delivered" state.
--
-- Backfill: existing rows get FALSE, which preserves the current
--   "Not registered" semantics. Rows that were genuinely skipped
--   before this migration will need one re-save (with PIN left blank)
--   to set the flag.
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS registration_skipped BOOLEAN DEFAULT FALSE;