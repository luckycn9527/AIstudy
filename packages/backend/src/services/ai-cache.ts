/**
 * AI 缓存服务
 * 通过 content_hash + prompt_type 避免重复 AI 调用
 */

import { createHash } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { aiCache } from '../db/schema.js';

/**
 * 计算内容 hash (SHA-256 前 16 字节 hex)
 */
export function computeContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 32);
}

/**
 * 查询缓存
 * @returns 缓存的响应内容，未命中返回 null
 */
export async function getCachedResponse(
  contentHash: string,
  promptType: string,
): Promise<string | null> {
  const rows = await db
    .select({ response: aiCache.response })
    .from(aiCache)
    .where(
      and(
        eq(aiCache.contentHash, contentHash),
        eq(aiCache.promptType, promptType),
      ),
    )
    .limit(1);

  return rows.length > 0 ? rows[0].response : null;
}

/**
 * 写入缓存
 */
export async function setCachedResponse(params: {
  contentHash: string;
  promptType: string;
  response: string;
  model: string;
  tokens?: number;
}): Promise<void> {
  await db.insert(aiCache).values({
    id: uuidv4(),
    contentHash: params.contentHash,
    promptType: params.promptType,
    response: params.response,
    model: params.model,
    tokens: params.tokens ?? null,
    createdAt: new Date().toISOString(),
  });
}

/**
 * 带缓存的 AI 调用包装器
 * @param content 输入内容 (用于计算 hash)
 * @param promptType 提示类型标识
 * @param callAI 实际的 AI 调用函数
 * @returns AI 响应内容
 */
export async function withCache(
  content: string,
  promptType: string,
  callAI: () => Promise<{ content: string; model: string; tokens?: number }>,
): Promise<string> {
  const hash = computeContentHash(content + '::' + promptType);

  // 1. 查缓存
  const cached = await getCachedResponse(hash, promptType);
  if (cached) {
    return cached;
  }

  // 2. 调用 AI
  const result = await callAI();

  // 3. 写缓存 (异步，不阻塞)
  void setCachedResponse({
    contentHash: hash,
    promptType,
    response: result.content,
    model: result.model,
    tokens: result.tokens,
  }).catch(() => { /* 缓存写入失败不影响主流程 */ });

  return result.content;
}
