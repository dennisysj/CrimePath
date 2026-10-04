-- ============================================================
-- CRIMEPATH DATABASE SCHEMA
--
--                            CASES
--                              │
--               ┌──────────────┼──────────────────┐
--               ▼              ▼                  ▼
--         CASE SUBJECTS     EVIDENCE          CASE EVENTS 🐯
--                              │                  │
--                   ┌──────────┴──────┐      ┌────┴─────────────┐
--                   ▼                 ▼      ▼                  ▼
--              EVIDENCE          EVIDENCE   EVENT             EVENT
--              ATTACHMENTS       PROPERTY   EVIDENCE          SUBJECTS
--                                HISTORY 🐯
--
--   cases       ── case_property_history 🐯
--   case_events ── case_event_property_history 🐯
--
-- 🐯 = TigerData hypertable
--
-- Idempotent: safe to run on an empty database or an existing one.
-- The backend runs this file automatically every time it starts. To
-- start over from nothing, run db/reset.sql, then restart the backend.
-- ============================================================


CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- 1. cases — one row = one investigation
-- ============================================================

CREATE TABLE IF NOT EXISTS cases (
    case_id BIGSERIAL PRIMARY KEY,

    case_number TEXT UNIQUE,                    -- e.g. CASE-001
    case_name TEXT NOT NULL,
    description TEXT,

    case_status TEXT NOT NULL DEFAULT 'open',   -- open | closed | archived

    created_by_id TEXT NOT NULL,
    created_by_name TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 2. case_subjects — master list of people/things in a case
--
-- subject_id:   PER-001 | VEH-001 | DEV-001 | ORG-001 | LOC-001 | OTH-001
--               (numbered per case, so the key is (case_id, subject_id))
-- subject_type: Person | Vehicle | Device | Organization | Location | Other
--               (WHAT the subject is; its role in a given event is
--               event_subjects.subject_role)
-- ============================================================

CREATE TABLE IF NOT EXISTS case_subjects (
    case_id BIGINT NOT NULL
        REFERENCES cases(case_id)
        ON DELETE CASCADE,

    subject_id TEXT NOT NULL,
    subject_name TEXT,
    subject_type TEXT,
    description TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (case_id, subject_id)
);


-- ============================================================
-- 3. evidence — one row = one LOGICAL evidence item/source
-- ("East Parking Lot CCTV", "Witness A Interview"). It can have
-- zero, one, or many files; those live in evidence_attachments.
--
-- evidence_type: Photo | Video | CCTV | Document | Witness Statement
--                | GPS | Transaction | Other
-- ============================================================

CREATE TABLE IF NOT EXISTS evidence (
    evidence_id BIGSERIAL PRIMARY KEY,

    case_id BIGINT NOT NULL
        REFERENCES cases(case_id)
        ON DELETE CASCADE,

    evidence_type TEXT NOT NULL,

    title TEXT NOT NULL,
    description TEXT,

    source TEXT,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    added_by_id TEXT NOT NULL,
    added_by_name TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 4. evidence_attachments — one row = one file of an evidence item
--
-- attachment_type: image | video | audio | document | archive | other
-- captured_at:     when the file was originally captured (e.g. a
--                  photo's EXIF time), NOT when it was uploaded
-- file_url:        CrimePath has no object storage yet, so this holds
--                  the file itself as a data: URL. The API serves it
--                  from /api/cases/:caseId/attachments/:attachmentId and
--                  never returns it inline.
-- ============================================================

CREATE TABLE IF NOT EXISTS evidence_attachments (
    attachment_id BIGSERIAL PRIMARY KEY,

    evidence_id BIGINT NOT NULL
        REFERENCES evidence(evidence_id)
        ON DELETE CASCADE,

    attachment_type TEXT,

    file_name TEXT NOT NULL,
    file_type TEXT,
    file_size BIGINT,
    file_url TEXT NOT NULL,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    captured_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 5. case_events 🐯 — the reconstructed timeline.
-- One row = one reported/observed/reconstructed occurrence.
--
-- event_type:  Observation | Movement | Communication | Transaction | Crime
--              | Statement | Other   (Crime = the offence itself: no subjects/evidence)
-- reliability: unknown | uncertain | verified | corroborated | disputed
--              (human-entered; never an AI probability)
--
-- event_id is the stable logical identifier; start_datetime is in the
-- primary key only because TigerData requires the time column there.
-- ============================================================

CREATE TABLE IF NOT EXISTS case_events (
    event_id UUID NOT NULL DEFAULT gen_random_uuid(),

    case_id BIGINT NOT NULL
        REFERENCES cases(case_id)
        ON DELETE CASCADE,

    start_datetime TIMESTAMPTZ NOT NULL,
    end_datetime TIMESTAMPTZ,

    event_type TEXT,

    title TEXT NOT NULL,
    description TEXT NOT NULL,

    location TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,

    reliability TEXT NOT NULL DEFAULT 'unknown',

    investigator_notes TEXT,

    created_by_id TEXT NOT NULL,
    created_by_name TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (start_datetime, event_id),

    CONSTRAINT valid_event_time
        CHECK (end_datetime IS NULL OR end_datetime >= start_datetime)
);

SELECT create_hypertable('case_events', by_range('start_datetime'), if_not_exists => TRUE);


-- ============================================================
-- 6. event_evidence — which evidence relates to which event
-- (many-to-many). relationship_type: supports | contradicts | related
-- ============================================================

CREATE TABLE IF NOT EXISTS event_evidence (
    event_id UUID NOT NULL,

    evidence_id BIGINT NOT NULL
        REFERENCES evidence(evidence_id)
        ON DELETE CASCADE,

    relationship_type TEXT NOT NULL DEFAULT 'supports',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (event_id, evidence_id)
);


-- ============================================================
-- 7. event_subjects — which case subjects take part in which event
--
-- subject_role: Victim | Witness | Person of Interest | Vehicle
--               | Device | Organization | Other | Unknown
--               (the subject's ROLE in this event)
--
-- The first row for an event (lowest event_subject_id) is the event's
-- primary subject; further rows are other involved subjects.
-- ============================================================

CREATE TABLE IF NOT EXISTS event_subjects (
    event_subject_id BIGSERIAL PRIMARY KEY,

    event_id UUID NOT NULL,

    subject_id TEXT NOT NULL,
    subject_name TEXT,
    subject_role TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 8-10. PROPERTY HISTORY 🐯 (audit time: when stored info changed)
-- ============================================================

CREATE TABLE IF NOT EXISTS case_property_history (
    history_id BIGSERIAL,

    case_id BIGINT NOT NULL
        REFERENCES cases(case_id)
        ON DELETE CASCADE,

    property_name TEXT NOT NULL,

    old_value JSONB,
    new_value JSONB,

    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    changed_by_id TEXT,
    changed_by_name TEXT,

    PRIMARY KEY (changed_at, history_id)
);

SELECT create_hypertable('case_property_history', by_range('changed_at'), if_not_exists => TRUE);


CREATE TABLE IF NOT EXISTS evidence_property_history (
    history_id BIGSERIAL,

    evidence_id BIGINT NOT NULL,

    property_name TEXT NOT NULL,

    old_value JSONB,
    new_value JSONB,

    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    changed_by_id TEXT,
    changed_by_name TEXT,

    PRIMARY KEY (changed_at, history_id)
);

SELECT create_hypertable('evidence_property_history', by_range('changed_at'), if_not_exists => TRUE);


CREATE TABLE IF NOT EXISTS case_event_property_history (
    history_id BIGSERIAL,

    event_id UUID NOT NULL,

    property_name TEXT NOT NULL,

    old_value JSONB,
    new_value JSONB,

    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    changed_by_id TEXT,
    changed_by_name TEXT,

    PRIMARY KEY (changed_at, history_id)
);

SELECT create_hypertable('case_event_property_history', by_range('changed_at'), if_not_exists => TRUE);


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_evidence_case ON evidence(case_id);
CREATE INDEX IF NOT EXISTS idx_evidence_attachments_evidence ON evidence_attachments(evidence_id);
CREATE INDEX IF NOT EXISTS idx_case_events_event_id ON case_events(event_id);
CREATE INDEX IF NOT EXISTS idx_case_events_case_time ON case_events(case_id, start_datetime DESC);
CREATE INDEX IF NOT EXISTS idx_event_evidence_event ON event_evidence(event_id);
CREATE INDEX IF NOT EXISTS idx_event_evidence_evidence ON event_evidence(evidence_id);
CREATE INDEX IF NOT EXISTS idx_event_subjects_event ON event_subjects(event_id);
CREATE INDEX IF NOT EXISTS idx_event_subjects_subject ON event_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_case_property_history_case ON case_property_history(case_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_property_history_evidence ON evidence_property_history(evidence_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_property_history_event ON case_event_property_history(event_id, changed_at DESC);


-- ============================================================
-- AUTOMATIC updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cases_updated_at ON cases;
CREATE TRIGGER trg_cases_updated_at
BEFORE UPDATE ON cases
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_case_subjects_updated_at ON case_subjects;
CREATE TRIGGER trg_case_subjects_updated_at
BEFORE UPDATE ON case_subjects
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_evidence_updated_at ON evidence;
CREATE TRIGGER trg_evidence_updated_at
BEFORE UPDATE ON evidence
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_case_events_updated_at ON case_events;
CREATE TRIGGER trg_case_events_updated_at
BEFORE UPDATE ON case_events
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- PROPERTY HISTORY TRIGGERS
--
-- UPDATE cases       -> case_property_history       +1 per changed property
-- UPDATE evidence    -> evidence_property_history   +1 per changed property
-- UPDATE case_events -> case_event_property_history +1 per changed property
-- INSERTs record nothing: history starts at the first modification.
--
-- Session settings read by the triggers:
--   app.user_id / app.user_name  -> changed_by_id / changed_by_name
--   app.skip_history = 'on'      -> don't log (schema data migrations)
-- ============================================================

CREATE OR REPLACE FUNCTION track_case_property_changes()
RETURNS TRIGGER AS $$
DECLARE
    old_json JSONB := to_jsonb(OLD);
    new_json JSONB := to_jsonb(NEW);
    key TEXT;
    actor_id TEXT := NULLIF(current_setting('app.user_id', true), '');
    actor_name TEXT := NULLIF(current_setting('app.user_name', true), '');
BEGIN
    IF current_setting('app.skip_history', true) = 'on' THEN
        RETURN NEW;
    END IF;

    FOR key IN SELECT jsonb_object_keys(new_json) LOOP
        IF key IN ('created_at', 'updated_at') THEN
            CONTINUE;
        END IF;

        IF old_json -> key IS DISTINCT FROM new_json -> key THEN
            INSERT INTO case_property_history (
                case_id, property_name, old_value, new_value, changed_by_id, changed_by_name
            )
            VALUES (NEW.case_id, key, old_json -> key, new_json -> key, actor_id, actor_name);
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_case_property_history ON cases;
CREATE TRIGGER trg_case_property_history
AFTER UPDATE ON cases
FOR EACH ROW EXECUTE FUNCTION track_case_property_changes();


CREATE OR REPLACE FUNCTION track_evidence_property_changes()
RETURNS TRIGGER AS $$
DECLARE
    old_json JSONB := to_jsonb(OLD);
    new_json JSONB := to_jsonb(NEW);
    key TEXT;
    actor_id TEXT := NULLIF(current_setting('app.user_id', true), '');
    actor_name TEXT := NULLIF(current_setting('app.user_name', true), '');
BEGIN
    IF current_setting('app.skip_history', true) = 'on' THEN
        RETURN NEW;
    END IF;

    FOR key IN SELECT jsonb_object_keys(new_json) LOOP
        IF key IN ('created_at', 'updated_at', 'evidence_id') THEN
            CONTINUE;
        END IF;

        IF old_json -> key IS DISTINCT FROM new_json -> key THEN
            INSERT INTO evidence_property_history (
                evidence_id, property_name, old_value, new_value, changed_by_id, changed_by_name
            )
            VALUES (NEW.evidence_id, key, old_json -> key, new_json -> key, actor_id, actor_name);
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_evidence_property_history ON evidence;
CREATE TRIGGER trg_evidence_property_history
AFTER UPDATE ON evidence
FOR EACH ROW EXECUTE FUNCTION track_evidence_property_changes();


CREATE OR REPLACE FUNCTION track_event_property_changes()
RETURNS TRIGGER AS $$
DECLARE
    old_json JSONB := to_jsonb(OLD);
    new_json JSONB := to_jsonb(NEW);
    key TEXT;
    actor_id TEXT := NULLIF(current_setting('app.user_id', true), '');
    actor_name TEXT := NULLIF(current_setting('app.user_name', true), '');
BEGIN
    IF current_setting('app.skip_history', true) = 'on' THEN
        RETURN NEW;
    END IF;

    FOR key IN SELECT jsonb_object_keys(new_json) LOOP
        IF key IN ('created_at', 'updated_at', 'event_id') THEN
            CONTINUE;
        END IF;

        IF old_json -> key IS DISTINCT FROM new_json -> key THEN
            INSERT INTO case_event_property_history (
                event_id, property_name, old_value, new_value, changed_by_id, changed_by_name
            )
            VALUES (NEW.event_id, key, old_json -> key, new_json -> key, actor_id, actor_name);
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_property_history ON case_events;
CREATE TRIGGER trg_event_property_history
AFTER UPDATE ON case_events
FOR EACH ROW EXECUTE FUNCTION track_event_property_changes();


-- EXTENSION beyond the schema doc: moving an event to a different
-- subject (Person A -> Person B, or a subject rename) is a change to
-- the event, so it is recorded in case_event_property_history as
-- property "subject". To match the doc exactly, drop this trigger.
CREATE OR REPLACE FUNCTION track_event_subject_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.skip_history', true) = 'on' THEN
        RETURN NEW;
    END IF;

    IF (OLD.subject_id, OLD.subject_name, OLD.subject_role)
        IS DISTINCT FROM (NEW.subject_id, NEW.subject_name, NEW.subject_role) THEN
        INSERT INTO case_event_property_history (
            event_id, property_name, old_value, new_value, changed_by_id, changed_by_name
        )
        VALUES (
            NEW.event_id,
            'subject',
            jsonb_build_object('id', OLD.subject_id, 'name', OLD.subject_name, 'role', OLD.subject_role),
            jsonb_build_object('id', NEW.subject_id, 'name', NEW.subject_name, 'role', NEW.subject_role),
            NULLIF(current_setting('app.user_id', true), ''),
            NULLIF(current_setting('app.user_name', true), '')
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_subject_history ON event_subjects;
CREATE TRIGGER trg_event_subject_history
AFTER UPDATE ON event_subjects
FOR EACH ROW EXECUTE FUNCTION track_event_subject_changes();
