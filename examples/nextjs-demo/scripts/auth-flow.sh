#!/usr/bin/env bash
# Auth API 完整流程 Demo（ADR-0032 / T1.1.7）
# 前置：pnpm dev:server 或 docker compose up
# 文档：apps/docs/docs/reference/auth.mdx
#
# 用法：bash examples/nextjs-demo/scripts/auth-flow.sh

set -euo pipefail

BASE="http://localhost:3001"
echo "=== 1. 注册 ==="
REGISTER=$(curl -s -X POST "$BASE/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"demo1234","displayName":"Demo User"}')
echo "$REGISTER" | jq .

ACCESS_TOKEN=$(echo "$REGISTER" | jq -r '.data.accessToken')
REFRESH_TOKEN=$(echo "$REGISTER" | jq -r '.data.refreshToken')

echo ""
echo "=== 2. 获取当前用户 ==="
curl -s "$BASE/api/v1/auth/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

echo ""
echo "=== 3. 刷新 Token ==="
REFRESHED=$(curl -s -X POST "$BASE/api/v1/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}")
echo "$REFRESHED" | jq .

ACCESS_TOKEN=$(echo "$REFRESHED" | jq -r '.data.accessToken')
REFRESH_TOKEN=$(echo "$REFRESHED" | jq -r '.data.refreshToken')

echo ""
echo "=== 4. 创建项目 ==="
PROJECT=$(curl -s -X POST "$BASE/api/v1/projects" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My App","slug":"my-app","platform":"web"}')
echo "$PROJECT" | jq .

PROJECT_ID=$(echo "$PROJECT" | jq -r '.data.id')

echo ""
echo "=== 5. 列出项目 ==="
curl -s "$BASE/api/v1/projects" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

echo ""
echo "=== 6. 查看项目详情 ==="
curl -s "$BASE/api/v1/projects/$PROJECT_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

echo ""
echo "=== 7. 列出项目成员 ==="
curl -s "$BASE/api/v1/projects/$PROJECT_ID/members" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

echo ""
echo "=== 8. 创建 API Token ==="
TOKEN=$(curl -s -X POST "$BASE/api/v1/projects/$PROJECT_ID/tokens" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"label":"ci-token"}')
echo "$TOKEN" | jq .

echo ""
echo "=== 9. 列出 API Tokens（secretKey 脱敏）==="
curl -s "$BASE/api/v1/projects/$PROJECT_ID/tokens" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

echo ""
echo "=== 10. 查看 Dashboard（需 Bearer + projectId query）==="
curl -s "$BASE/dashboard/v1/errors/overview?projectId=$PROJECT_ID&windowHours=24" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

echo ""
echo "=== 11. 登出 ==="
curl -s -X POST "$BASE/api/v1/auth/logout" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}" \
  -o /dev/null -w "HTTP %{http_code}\n"

echo ""
echo "=== Done! 完整认证流程演示完成 ==="
