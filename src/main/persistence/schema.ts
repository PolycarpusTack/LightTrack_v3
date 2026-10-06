/**
 * Database schema as numbered, forward-only migrations (LT3-101, plan 6.3 and 6.4).
 *
 * Never edit a migration that has shipped; add a new one. Versions start at 1 and
 * have no gaps. Each migration runs inside the runner's transaction, so it must not
 * contain BEGIN or COMMIT.
 *
 * Conventions: ids are TEXT (v3 ids are strings and are kept on import); instants
 * are UTC ISO 8601 text (`*_at`); `local_date` (YYYY-MM-DD) and `time_zone` (IANA)
 * record the user's day where accounting rules depend on it; booleans are 0/1.
 */

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

const initial = `
CREATE TABLE project (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL COLLATE NOCASE UNIQUE,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  is_system   INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- SAP booking references change over time; worklogs point at the version they used.
CREATE TABLE project_code_version (
  id                  INTEGER PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  project_element_id  TEXT,
  service_product_id  TEXT,
  cost_center         TEXT,
  wbs_element         TEXT,
  valid_from          TEXT NOT NULL,
  valid_to            TEXT,
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);
CREATE INDEX idx_project_code_version_project ON project_code_version(project_id, valid_from);

-- Source evidence. Never updated in place; changes go to activity_revision.
CREATE TABLE raw_activity (
  id                TEXT PRIMARY KEY,
  source            TEXT NOT NULL CHECK (source IN ('capture', 'manual', 'calendar', 'browser', 'import')),
  source_id         TEXT,
  started_at        TEXT NOT NULL,
  ended_at          TEXT NOT NULL,
  duration_seconds  INTEGER NOT NULL CHECK (duration_seconds >= 0),
  local_date        TEXT NOT NULL,
  time_zone         TEXT NOT NULL,
  app               TEXT,
  title             TEXT,
  url               TEXT,
  details_json      TEXT,
  created_at        TEXT NOT NULL,
  CHECK (ended_at >= started_at)
);
-- Repeatable import: one row per source record.
CREATE UNIQUE INDEX idx_raw_activity_source ON raw_activity(source, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX idx_raw_activity_local_date ON raw_activity(local_date);
CREATE INDEX idx_raw_activity_started_at ON raw_activity(started_at);

CREATE TABLE activity_revision (
  id               INTEGER PRIMARY KEY,
  raw_activity_id  TEXT NOT NULL REFERENCES raw_activity(id) ON DELETE CASCADE,
  changes_json     TEXT NOT NULL,
  reason           TEXT,
  created_at       TEXT NOT NULL
);
CREATE INDEX idx_activity_revision_raw_activity ON activity_revision(raw_activity_id);

-- Ordered attribution rules. A project with rules is archived, not deleted.
CREATE TABLE mapping_rule (
  id             TEXT PRIMARY KEY,
  kind           TEXT NOT NULL CHECK (kind IN ('title', 'url', 'jira', 'meeting', 'app')),
  pattern        TEXT NOT NULL,
  position       INTEGER NOT NULL,
  project_id     TEXT NOT NULL REFERENCES project(id) ON DELETE RESTRICT,
  activity_type  TEXT,
  enabled        INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  UNIQUE (kind, pattern)
);
CREATE INDEX idx_mapping_rule_order ON mapping_rule(kind, position);
CREATE INDEX idx_mapping_rule_project ON mapping_rule(project_id);

-- Time blocks (ADR 0005). Booking lines are derived from these.
CREATE TABLE worklog (
  id                       TEXT PRIMARY KEY,
  started_at               TEXT NOT NULL,
  ended_at                 TEXT NOT NULL,
  local_date               TEXT NOT NULL,
  time_zone                TEXT NOT NULL,
  project_id               TEXT NOT NULL REFERENCES project(id) ON DELETE RESTRICT,
  project_code_version_id  INTEGER REFERENCES project_code_version(id) ON DELETE RESTRICT,
  activity_type            TEXT,
  billable                 INTEGER NOT NULL DEFAULT 1 CHECK (billable IN (0, 1)),
  jira_keys_json           TEXT,
  comment                  TEXT,
  state                    TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'approved', 'superseded')),
  superseded_by            TEXT REFERENCES worklog(id) ON DELETE RESTRICT,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL,
  CHECK (ended_at > started_at)
);
CREATE INDEX idx_worklog_local_date ON worklog(local_date);
CREATE INDEX idx_worklog_project ON worklog(project_id);
CREATE INDEX idx_worklog_state ON worklog(state);
CREATE INDEX idx_worklog_code_version ON worklog(project_code_version_id);
CREATE INDEX idx_worklog_superseded_by ON worklog(superseded_by);

-- Which evidence a time block is built from.
CREATE TABLE allocation (
  worklog_id       TEXT NOT NULL REFERENCES worklog(id) ON DELETE CASCADE,
  raw_activity_id  TEXT NOT NULL REFERENCES raw_activity(id) ON DELETE RESTRICT,
  seconds          INTEGER NOT NULL CHECK (seconds > 0),
  PRIMARY KEY (worklog_id, raw_activity_id)
);
CREATE INDEX idx_allocation_raw_activity ON allocation(raw_activity_id);

-- Kept for as long as the worklog exists; a worklog with history cannot be deleted.
CREATE TABLE worklog_audit (
  id           INTEGER PRIMARY KEY,
  worklog_id   TEXT NOT NULL REFERENCES worklog(id) ON DELETE RESTRICT,
  at           TEXT NOT NULL,
  actor        TEXT NOT NULL,
  action       TEXT NOT NULL CHECK (action IN ('create', 'update', 'split', 'merge', 'approve', 'supersede', 'delete')),
  before_json  TEXT,
  after_json   TEXT,
  reason       TEXT
);
CREATE INDEX idx_worklog_audit_worklog ON worklog_audit(worklog_id, at);

CREATE TABLE export_profile (
  id               TEXT NOT NULL,
  version          INTEGER NOT NULL CHECK (version >= 1),
  name             TEXT NOT NULL,
  definition_json  TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  PRIMARY KEY (id, version)
);

-- Immutable record of one export: profile version, period, rows and their hash.
CREATE TABLE export_run (
  id               TEXT PRIMARY KEY,
  profile_id       TEXT NOT NULL,
  profile_version  INTEGER NOT NULL,
  period_start     TEXT NOT NULL,
  period_end       TEXT NOT NULL,
  row_count        INTEGER NOT NULL CHECK (row_count >= 0),
  content_sha256   TEXT NOT NULL,
  rows_json        TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  FOREIGN KEY (profile_id, profile_version) REFERENCES export_profile(id, version) ON DELETE RESTRICT,
  CHECK (period_end >= period_start)
);
CREATE INDEX idx_export_run_profile ON export_run(profile_id, profile_version);
CREATE INDEX idx_export_run_period ON export_run(period_start, period_end);

CREATE TABLE export_run_worklog (
  export_run_id  TEXT NOT NULL REFERENCES export_run(id) ON DELETE RESTRICT,
  worklog_id     TEXT NOT NULL REFERENCES worklog(id) ON DELETE RESTRICT,
  PRIMARY KEY (export_run_id, worklog_id)
);
CREATE INDEX idx_export_run_worklog_worklog ON export_run_worklog(worklog_id);
`;

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'initial schema', sql: initial }
];
