import { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { config } from '../db/schema.js';

/**
 * API 密钥守卫中间件
 * 检查是否已配置 DeepSeek API 密钥，未配置时返回 403
 * 应用于需要 AI 服务的路由：analyze, generate, score-subjective, analyze-report
 */
export function apiKeyGuard(_req: Request, res: Response, next: NextFunction): void {
  const result = db
    .select()
    .from(config)
    .where(eq(config.key, 'deepseek_api_key'))
    .get();

  if (!result || !result.value) {
    res.status(403).json({
      success: false,
      error: {
        code: 'API_KEY_NOT_CONFIGURED',
        message: '请先在设置中配置 DeepSeek API 密钥',
      },
    });
    return;
  }

  next();
}
