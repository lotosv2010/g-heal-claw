#!/usr/bin/env bash
# Sourcemap 上传示例脚本（ADR-0031 · T1.5.4）
#
# 用法：
#   1. 确保 server 已启动：pnpm dev
#   2. 执行本脚本：bash examples/nextjs-demo/scripts/upload-sourcemap.sh
#
# 前提：
#   - Gateway 监听 http://localhost:3001
#   - dev-seed 已注入 secret_key = "sk_demo_secret_key_000000000000000000000"
#   - SDK init({ release: "demo-1.0.0" }) 已设置
#
# 观察：
#   1. curl 返回 release id 和 artifact 元数据
#   2. 触发异常后在 Dashboard /errors 可看到还原后的源码堆栈

set -euo pipefail

API="http://localhost:3001/sourcemap/v1"
SECRET_KEY="sk_demo_secret_key_000000000000000000000"
RELEASE="demo-1.0.0"

echo "=== 1. 创建 Release ==="
curl -s -X POST "$API/releases" \
  -H "X-Api-Key: $SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"version\": \"$RELEASE\"}" | jq .

echo ""
echo "=== 2. 上传 Artifact（示例 .map 文件）==="
# 生成一个最小有效 source map 用于演示
cat > /tmp/demo-sourcemap.map <<'MAPEOF'
{
  "version": 3,
  "file": "main.js",
  "sources": ["src/utils/parser.ts", "src/components/App.tsx"],
  "names": ["parseInput", "handleClick", "renderApp"],
  "mappings": "AAAA,IAAM,SAAS;AACf,OAAO"
}
MAPEOF

# 需要先获取 release id
RELEASE_ID=$(curl -s -X POST "$API/releases" \
  -H "X-Api-Key: $SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"version\": \"$RELEASE\"}" | jq -r '.data.id')

echo "Release ID: $RELEASE_ID"

curl -s -X POST "$API/releases/$RELEASE_ID/artifacts" \
  -H "X-Api-Key: $SECRET_KEY" \
  -F "filename=main.js" \
  -F "file=@/tmp/demo-sourcemap.map" | jq .

echo ""
echo "=== 3. 列出 Artifacts ==="
curl -s "$API/releases/$RELEASE_ID/artifacts" \
  -H "X-Api-Key: $SECRET_KEY" | jq .

echo ""
echo "=== 完成！==="
echo "现在触发异常后，ErrorProcessor 会使用 Sourcemap 还原堆栈。"
echo "观察 Dashboard /errors 页面查看还原效果。"

rm -f /tmp/demo-sourcemap.map
