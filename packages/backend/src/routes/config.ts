import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { config } from '../db/schema.js';
import { AIService } from '../services/ai.service.js';
import { OCRService } from '../services/ocr.service.js';

const router = Router();

/**
 * GET /api/config/api-key-status
 * 获取 API 密钥配置状态
 */
router.get('/api-key-status', async (_req, res) => {
  try {
    const result = await db
      .select()
      .from(config)
      .where(eq(config.key, 'deepseek_api_key'));

    const configured = result.length > 0 && result[0].value.length > 0;
    res.json({ success: true, data: { configured } });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '获取 API 密钥状态失败' },
    });
  }
});

/**
 * POST /api/config/api-key
 * 保存 API 密钥（base64 编码存储）
 */
router.post('/api-key', async (req, res) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'API 密钥不能为空' },
      });
      return;
    }

    // Base64 encode for simple local storage obfuscation
    const encoded = Buffer.from(apiKey.trim()).toString('base64');

    // Upsert: insert or update the key
    const existing = await db
      .select()
      .from(config)
      .where(eq(config.key, 'deepseek_api_key'));

    if (existing.length > 0) {
      await db
        .update(config)
        .set({ value: encoded })
        .where(eq(config.key, 'deepseek_api_key'));
    } else {
      await db.insert(config).values({ key: 'deepseek_api_key', value: encoded });
    }

    res.json({ success: true, data: { configured: true } });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '保存 API 密钥失败' },
    });
  }
});

/**
 * POST /api/config/api-key/test
 * 测试 API 连接
 */
router.post('/api-key/test', async (_req, res) => {
  try {
    const result = await db
      .select()
      .from(config)
      .where(eq(config.key, 'deepseek_api_key'));

    if (result.length === 0 || !result[0].value) {
      res.status(400).json({
        success: false,
        error: { code: 'NOT_CONFIGURED', message: 'API 密钥未配置' },
      });
      return;
    }

    // Decode the stored base64 key
    const apiKey = Buffer.from(result[0].value, 'base64').toString('utf-8');

    const aiService = new AIService(apiKey);
    const connected = await aiService.testConnection();

    res.json({ success: true, data: { connected } });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '测试 API 连接失败' },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SiliconFlow OCR API Key (用于扫描版 PDF 文字识别)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/config/ocr-key-status
 */
router.get('/ocr-key-status', async (_req, res) => {
  try {
    const result = await db.select().from(config).where(eq(config.key, 'siliconflow_api_key'));
    const configured = result.length > 0 && result[0].value.length > 0;
    res.json({ success: true, data: { configured } });
  } catch {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: '获取 OCR 密钥状态失败' } });
  }
});

/**
 * POST /api/config/ocr-key
 */
router.post('/ocr-key', async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'API 密钥不能为空' } });
      return;
    }

    const encoded = Buffer.from(apiKey.trim()).toString('base64');
    const existing = await db.select().from(config).where(eq(config.key, 'siliconflow_api_key'));

    if (existing.length > 0) {
      await db.update(config).set({ value: encoded }).where(eq(config.key, 'siliconflow_api_key'));
    } else {
      await db.insert(config).values({ key: 'siliconflow_api_key', value: encoded });
    }

    res.json({ success: true, data: { configured: true } });
  } catch {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: '保存 OCR 密钥失败' } });
  }
});

/**
 * POST /api/config/ocr-key/test
 */
router.post('/ocr-key/test', async (_req, res) => {
  try {
    const result = await db.select().from(config).where(eq(config.key, 'siliconflow_api_key'));
    if (result.length === 0 || !result[0].value) {
      res.status(400).json({ success: false, error: { code: 'NOT_CONFIGURED', message: 'OCR 密钥未配置' } });
      return;
    }

    const apiKey = Buffer.from(result[0].value, 'base64').toString('utf-8');
    const ocrService = new OCRService(apiKey);
    const connected = await ocrService.testConnection();

    res.json({ success: true, data: { connected } });
  } catch {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: '测试 OCR 连接失败' } });
  }
});

export default router;
