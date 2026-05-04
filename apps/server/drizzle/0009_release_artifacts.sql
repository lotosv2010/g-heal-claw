-- ADR-0031: release_artifacts 表（Sourcemap .map 文件元数据）
CREATE TABLE IF NOT EXISTS release_artifacts (
  id              varchar(32) PRIMARY KEY,
  release_id      varchar(32) NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  project_id      varchar(32) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename        varchar(512) NOT NULL,
  map_filename    varchar(512) NOT NULL,
  storage_key     varchar(1024) NOT NULL,
  file_size       integer NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_artifacts_release_filename UNIQUE (release_id, filename)
);

CREATE INDEX IF NOT EXISTS idx_artifacts_project_release
  ON release_artifacts (project_id, release_id);
