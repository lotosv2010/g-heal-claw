# nextjs-demo

最小化 Next.js 15 App Router 示例，用于本地验证 `@g-heal-claw/sdk` 的浏览器端采集链路。

## 快速开始

```bash
# 1. 确保 monorepo 根目录已安装依赖
pnpm install

# 2. 复制环境变量模板，按需修改 DSN 指向 apps/server
cp examples/nextjs-demo/.env.example examples/nextjs-demo/.env.local

# 3. 启动（端口 3100，避免和 apps/server 3001 / apps/web 3000 冲突）
pnpm -F nextjs-demo dev
```

打开 <http://localhost:3100>，点击三个按钮观察 Network 面板中的
`POST /ingest/v1/events` 请求。

## 说明

- 通过 `next.config.ts` 的 `transpilePackages` 直接编译 workspace 源码，SDK 改动无需重新 build
- `app/ghc-provider.tsx` 在客户端挂载时执行 `init()`，避免 SSR 阶段访问 `window`
- 三个测试按钮覆盖 T1.2.1 骨架阶段全部公开 API

## 留存造数（ADR-0028 / TM.2.E）

留存矩阵需要跨多天的 `page_view_raw` 数据才能可视化 cohort × day_offset；demo 页面的硬刷新只覆盖 day 0。想快速验证大盘，用下面的 psql 脚本批量生成**最近 3 天、3 个 cohort、每 cohort 3 个 session** 的典型留存（day 0 = 100% / day 1 ≈ 66% / day 2 ≈ 33%）。

```sql
-- 连接：psql 'postgresql://gheal:gheal@localhost:5432/gheal'
-- 清理：仅删除示例 project_id=demo 的最近 10 天数据（不影响真实数据）
DELETE FROM page_view_raw
 WHERE project_id = 'demo'
   AND session_id LIKE 'seed-retention-%'
   AND ts_ms >= (EXTRACT(EPOCH FROM (NOW() - INTERVAL '10 days')) * 1000)::bigint;

-- 生成：3 个 cohort 日 × 3 个 session × 变化的 day_offset
INSERT INTO page_view_raw (
  event_id, project_id, public_key, session_id, ts_ms,
  url, path, referrer, referrer_host,
  load_type, is_spa_nav, ua, browser, os, device_type
)
SELECT
  gen_random_uuid(),
  'demo',
  'demo_pk',
  's.session_id',
  s.ts_ms,
  'http://localhost:3100' || s.path,
  s.path,
  NULL, NULL,
  'reload', false,
  'Mozilla/5.0 seed', 'Chrome', 'macOS', 'desktop'
FROM (
  -- Cohort = 今天-2：3 个 session，day 0/1/2 全留存，仅 1 个掉队（session C 只 day 0）
  SELECT 'seed-retention-A-1' AS session_id, '/'     AS path, (EXTRACT(EPOCH FROM (NOW() - INTERVAL '2 days' + INTERVAL '10 hours')) * 1000)::bigint AS ts_ms
  UNION ALL SELECT 'seed-retention-A-1', '/home',    (EXTRACT(EPOCH FROM (NOW() - INTERVAL '1 days' + INTERVAL '11 hours')) * 1000)::bigint
  UNION ALL SELECT 'seed-retention-A-1', '/pricing', (EXTRACT(EPOCH FROM (NOW() + INTERVAL ' 0 hours')) * 1000)::bigint
  UNION ALL SELECT 'seed-retention-A-2', '/',        (EXTRACT(EPOCH FROM (NOW() - INTERVAL '2 days' + INTERVAL '12 hours')) * 1000)::bigint
  UNION ALL SELECT 'seed-retention-A-2', '/home',    (EXTRACT(EPOCH FROM (NOW() - INTERVAL '1 days' + INTERVAL '12 hours')) * 1000)::bigint
  UNION ALL SELECT 'seed-retention-A-3', '/',        (EXTRACT(EPOCH FROM (NOW() - INTERVAL '2 days' + INTERVAL '14 hours')) * 1000)::bigint
  -- Cohort = 今天-1：3 个 session，2 个 day0+1 留存
  UNION ALL SELECT 'seed-retention-B-1', '/',     (EXTRACT(EPOCH FROM (NOW() - INTERVAL '1 days' + INTERVAL ' 9 hours')) * 1000)::bigint
  UNION ALL SELECT 'seed-retention-B-1', '/docs', (EXTRACT(EPOCH FROM (NOW() - INTERVAL ' 0 hours')) * 1000)::bigint
  UNION ALL SELECT 'seed-retention-B-2', '/',     (EXTRACT(EPOCH FROM (NOW() - INTERVAL '1 days' + INTERVAL '10 hours')) * 1000)::bigint
  UNION ALL SELECT 'seed-retention-B-2', '/docs', (EXTRACT(EPOCH FROM (NOW() - INTERVAL ' 1 hours')) * 1000)::bigint
  UNION ALL SELECT 'seed-retention-B-3', '/',     (EXTRACT(EPOCH FROM (NOW() - INTERVAL '1 days' + INTERVAL '11 hours')) * 1000)::bigint
  -- Cohort = 今天：3 个 session，day 0 全留存（尚无观察期）
  UNION ALL SELECT 'seed-retention-C-1', '/',     (EXTRACT(EPOCH FROM (NOW() - INTERVAL ' 3 hours')) * 1000)::bigint
  UNION ALL SELECT 'seed-retention-C-2', '/',     (EXTRACT(EPOCH FROM (NOW() - INTERVAL ' 2 hours')) * 1000)::bigint
  UNION ALL SELECT 'seed-retention-C-3', '/',     (EXTRACT(EPOCH FROM (NOW() - INTERVAL ' 1 hours')) * 1000)::bigint
) s;
```

执行完成后访问 <http://localhost:3000/tracking/retention?cohortDays=7&returnDays=7&identity=session>，应看到 3 行 cohort（今天 / 今天-1 / 今天-2），其中最老 cohort 的 day 0/1/2 分别对应 3/2/1 留存。
