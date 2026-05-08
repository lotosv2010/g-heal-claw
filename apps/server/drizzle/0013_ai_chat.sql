-- AI 对话会话表
CREATE TABLE IF NOT EXISTS ai_conversations (
  id            VARCHAR(32) PRIMARY KEY,
  project_id    VARCHAR(32) NOT NULL,
  user_id       VARCHAR(32) NOT NULL,
  title         VARCHAR(256) NOT NULL DEFAULT '新对话',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conv_user ON ai_conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_conv_project ON ai_conversations(project_id, updated_at DESC);

-- AI 对话消息表
CREATE TABLE IF NOT EXISTS ai_messages (
  id                VARCHAR(32) PRIMARY KEY,
  conversation_id   VARCHAR(32) NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role              VARCHAR(16) NOT NULL,
  content           TEXT NOT NULL,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_msg_conv ON ai_messages(conversation_id, created_at);
