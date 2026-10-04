-- ============================================================
-- CRIMEPATH FULL RESET
--
-- WARNING: deletes every CrimePath table and all of its data.
-- Afterwards, restart the backend (or run db/schema.sql) to
-- recreate the empty schema.
-- ============================================================

DROP TABLE IF EXISTS case_event_property_history CASCADE;
DROP TABLE IF EXISTS evidence_property_history CASCADE;
DROP TABLE IF EXISTS case_property_history CASCADE;

DROP TABLE IF EXISTS event_subjects CASCADE;
DROP TABLE IF EXISTS event_evidence CASCADE;
DROP TABLE IF EXISTS case_subjects CASCADE;

-- Older CrimePath tables, in case they still exist
DROP TABLE IF EXISTS evidence_attachments CASCADE;
DROP TABLE IF EXISTS photo_case_events CASCADE;
DROP TABLE IF EXISTS evidence_subjects CASCADE;

DROP TABLE IF EXISTS case_events CASCADE;
DROP TABLE IF EXISTS evidence CASCADE;
DROP TABLE IF EXISTS cases CASCADE;

DROP FUNCTION IF EXISTS track_case_property_changes() CASCADE;
DROP FUNCTION IF EXISTS track_evidence_property_changes() CASCADE;
DROP FUNCTION IF EXISTS track_event_property_changes() CASCADE;
DROP FUNCTION IF EXISTS track_event_subject_changes() CASCADE;
DROP FUNCTION IF EXISTS track_case_subject_changes() CASCADE;
DROP FUNCTION IF EXISTS track_case_created() CASCADE;
DROP FUNCTION IF EXISTS set_updated_at() CASCADE;
