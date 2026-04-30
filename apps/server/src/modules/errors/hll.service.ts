import { Injectable, Logger } from "@nestjs/common";
import type { ErrorEvent } from "@g-heal-claw/shared";
import { RedisService } from "../../shared/redis/redis.service.js";
import { computeFingerprint } from "./fingerprint.js";

/**
 * Issue 用户数 HLL 估算服务（T1.4.3 / ADR-0016 §3.4）
 *
 * 目标：用 Redis HyperLogLog 对每个 (projectId, fingerprint) 的 distinct sessionId
 * 做 O(1) 空间估算（每 key ≤ 12KB，误差 ~0.81%），解决多批次合并时
 * `issues.impacted_sessions` 只能按批 lower-bound 累加的偏差问题。
 *
 * 两个方法：
 * - `pfAdd(events)`：写入路径，追加 sessionId；同批多事件归一到同指纹
 * - `pfCount(projectId, fingerprint)`：读取路径，供回写 cron / 查询使用
 *
 * Redis 缺席时：pfAdd 静默（warn 日志），pfCount 返回 null → 上层回写 cron 短路
 */
@Injectable()
export class IssueUserHllService {
  private readonly logger = new Logger(IssueUserHllService.name);

  /** HLL key TTL：30 天，覆盖 Issue 活跃窗口 */
  private static readonly DEFAULT_TTL_SEC = 30 * 24 * 60 * 60;

  public constructor(private readonly redis: RedisService) {}

  /**
   * 追加一批事件的 sessionId 到对应 Issue 的 HLL 集合
   *
   * 按 (projectId, fingerprint) 聚合后再 PFADD；单指纹一次调用，降低 round-trip。
   * 所有异常降级为 warn，不阻断主 saveBatch 路径。
   */
  public async pfAdd(events: readonly ErrorEvent[]): Promise<void> {
    if (events.length === 0) return;
    const client = this.redis.client;
    if (!client) return;

    const grouped = groupSessionsByFingerprint(events);
    if (grouped.size === 0) return;

    try {
      const pipeline = client.pipeline();
      for (const [key, sessions] of grouped.entries()) {
        if (sessions.size === 0) continue;
        pipeline.pfadd(key, ...sessions);
        pipeline.expire(key, IssueUserHllService.DEFAULT_TTL_SEC);
      }
      await pipeline.exec();
    } catch (err) {
      this.logger.warn(
        `HLL pfadd 异常（跳过，issue.impacted_sessions 保持 raw 估算）：${
          (err as Error).message
        }`,
      );
    }
  }

  /**
   * 读取单个 Issue 的 distinct session 估算值
   *
   * 返回 null：Redis 缺席 / 读取异常 / key 尚未建立 → 回写 cron 应保持原值
   */
  public async pfCount(
    projectId: string,
    fingerprint: string,
  ): Promise<number | null> {
    const client = this.redis.client;
    if (!client) return null;
    try {
      const v = await client.pfcount(buildKey(projectId, fingerprint));
      return typeof v === "number" ? v : Number(v);
    } catch (err) {
      this.logger.warn(
        `HLL pfcount 异常 key=${buildKey(projectId, fingerprint)}：${
          (err as Error).message
        }`,
      );
      return null;
    }
  }
}

function buildKey(projectId: string, fingerprint: string): string {
  return `iss:hll:${projectId}:${fingerprint}`;
}

/**
 * 批内归并：同指纹事件合并 sessionId 集合，减少 pfadd 次数
 *
 * 返回 Map<key, Set<sessionId>>，key 已经构造好，上层直接 pipeline.pfadd
 */
function groupSessionsByFingerprint(
  events: readonly ErrorEvent[],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const ev of events) {
    if (!ev.sessionId) continue;
    const fp = computeFingerprint(ev);
    const key = buildKey(ev.projectId, fp);
    const bucket = map.get(key);
    if (bucket) {
      bucket.add(ev.sessionId);
    } else {
      map.set(key, new Set([ev.sessionId]));
    }
  }
  return map;
}
