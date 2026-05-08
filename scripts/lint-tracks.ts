#!/usr/bin/env npx tsx
/**
 * 埋点事件命名规范校验脚本（T3.3.4）
 *
 * 扫描项目源码中的埋点事件名并校验命名规范：
 * - HTML/TSX 中的 data-track-id="..." 属性
 * - TypeScript 中的 track("...") / GHealClaw.track("...") 调用
 * - data-track="..." 属性（作为 selector 使用时也应合规）
 *
 * 用法：pnpm lint:tracks [--fix-suggestion]
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { validateTrackName, type TrackNameIssue } from "../packages/shared/src/validation/track-name.js";

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly name: string;
  readonly source: "data-track-id" | "data-track" | "track-call";
  readonly issues: readonly TrackNameIssue[];
}

const SCAN_DIRS = [
  "apps/web",
  "examples/nextjs-demo",
  "packages/sdk",
];

const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".vue", ".html"]);

const IGNORE_DIRS = new Set([
  "node_modules",
  "dist",
  ".next",
  ".turbo",
  "coverage",
  "tests",
  "__tests__",
]);

// data-track-id="value" 或 data-track-id='value'
const DATA_TRACK_ID_RE = /data-track-id=["']([^"']+)["']/g;

// data-track="value" 或 data-track='value'（非 data-track-xxx）
const DATA_TRACK_RE = /data-track=["']([^"']+)["']/g;

// track("name") / track('name') / GHealClaw.track("name")
const TRACK_CALL_RE = /(?:GHealClaw\.)?track\(\s*["']([^"']+)["']/g;

function walk(dir: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full, { throwIfNoEntry: false });
    if (!stat) continue;
    if (stat.isDirectory()) {
      results.push(...walk(full));
    } else if (EXTENSIONS.has(extOf(entry))) {
      results.push(full);
    }
  }
  return results;
}

function extOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot);
}

function scanFile(filePath: string, rootDir: string): Finding[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const findings: Finding[] = [];
  const relPath = relative(rootDir, filePath).replace(/\\/g, "/");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNum = i + 1;

    for (const match of line.matchAll(DATA_TRACK_ID_RE)) {
      const name = match[1]!;
      const issues = validateTrackName(name);
      if (issues.length > 0) {
        findings.push({ file: relPath, line: lineNum, name, source: "data-track-id", issues });
      }
    }

    for (const match of line.matchAll(DATA_TRACK_RE)) {
      const name = match[1]!;
      const issues = validateTrackName(name);
      if (issues.length > 0) {
        findings.push({ file: relPath, line: lineNum, name, source: "data-track", issues });
      }
    }

    for (const match of line.matchAll(TRACK_CALL_RE)) {
      const name = match[1]!;
      const issues = validateTrackName(name);
      if (issues.length > 0) {
        findings.push({ file: relPath, line: lineNum, name, source: "track-call", issues });
      }
    }
  }

  return findings;
}

function main(): void {
  const rootDir = process.cwd();
  const allFindings: Finding[] = [];
  let scannedFiles = 0;

  for (const dir of SCAN_DIRS) {
    const absDir = join(rootDir, dir);
    const files = walk(absDir);
    for (const file of files) {
      scannedFiles++;
      allFindings.push(...scanFile(file, rootDir));
    }
  }

  const errors = allFindings.filter((f) => f.issues.some((i) => i.severity === "error"));
  const warnings = allFindings.filter((f) => f.issues.every((i) => i.severity === "warn"));

  console.log(`\n🔍 扫描完成：${scannedFiles} 个文件，${SCAN_DIRS.length} 个目录\n`);

  if (errors.length > 0) {
    console.log(`❌ 错误 (${errors.length}):\n`);
    for (const f of errors) {
      console.log(`  ${f.file}:${f.line}`);
      console.log(`    名称: "${f.name}" (来源: ${f.source})`);
      for (const issue of f.issues) {
        if (issue.severity === "error") {
          console.log(`    ✗ ${issue.message}`);
        }
      }
      console.log();
    }
  }

  if (warnings.length > 0) {
    console.log(`⚠️  警告 (${warnings.length}):\n`);
    for (const f of warnings) {
      console.log(`  ${f.file}:${f.line}`);
      console.log(`    名称: "${f.name}" (来源: ${f.source})`);
      for (const issue of f.issues) {
        console.log(`    ⚡ ${issue.message}`);
      }
      console.log();
    }
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log("✅ 所有埋点事件名均符合命名规范\n");
  }

  // 错误级别导致退出码非零（可用于 CI 卡点）
  if (errors.length > 0) {
    process.exit(1);
  }
}

main();
