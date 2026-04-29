/**
 * Dev 种子数据（仅在 NODE_ENV !== production 时注入）
 *
 * 目的：让 `examples/nextjs-demo` 的 DSN `http://publicKey@localhost:3001/demo`
 * 能通过 Gateway DsnAuthGuard 鉴权，不用手工建库建 key。
 *
 * 幂等策略：全部 ON CONFLICT DO NOTHING；重启 / DDL 重跑零副作用。
 * FK 顺序：users → projects → project_keys。
 *
 * 生产注意：此文件只负责 dev / test 便捷路径。生产环境通过
 * 正式的后台管理界面 / CLI 创建项目；运行时跳过此 SEED。
 */
export const DEV_SEED_SQL: readonly string[] = [
  // 默认 owner：固定 id，便于 projects.owner_user_id FK 引用
  `
INSERT INTO users (id, email, password_hash, display_name, role)
VALUES ('usr_devowner_00000000000000', 'dev-owner@localhost', 'x-dev-no-login', 'Dev Owner', 'admin')
ON CONFLICT (id) DO NOTHING;
`.trim(),

  // Demo project：id = 'demo'，与 DSN path `/demo` 对齐
  `
INSERT INTO projects (id, slug, name, platform, owner_user_id, retention_days, is_active)
VALUES ('demo', 'demo', 'Demo Project', 'web', 'usr_devowner_00000000000000', 30, true)
ON CONFLICT (id) DO NOTHING;
`.trim(),

  // Demo public key：与 `NEXT_PUBLIC_GHC_DSN=http://publicKey@localhost:3001/demo` 对齐
  // secret_key 仅作占位；UNIQUE 约束要求非空
  `
INSERT INTO project_keys (id, project_id, public_key, secret_key, label, is_active)
VALUES ('pk_demo_00000000000000000000', 'demo', 'publicKey', 'sk_demo_placeholder_00000000', 'demo-default', true)
ON CONFLICT (public_key) DO NOTHING;
`.trim(),

  // 默认环境
  `
INSERT INTO environments (project_id, name, description, is_production)
VALUES ('demo', 'development', '本地 dev 环境', false)
ON CONFLICT (project_id, name) DO NOTHING;
`.trim(),
];
