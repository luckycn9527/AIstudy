import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { questions, materials, config } from '../db/schema.js';
import { AIService } from '../services/ai.service.js';
import { getProcessingStrategy } from '../processors/material-strategy.js';
import type { QuestionType, GenerateQuestionsParams } from '../types.js';

const router = Router();

/**
 * GET /api/subjects/:subjectId/questions
 * 获取指定学科的题目列表，支持按题型筛选
 */
router.get('/api/subjects/:subjectId/questions', async (req: Request, res: Response) => {
  try {
    const subjectId = req.params.subjectId as string;
    const typeFilter = req.query.type as QuestionType | undefined;

    let rows;
    if (typeFilter) {
      rows = await db
        .select()
        .from(questions)
        .where(and(eq(questions.subjectId, subjectId), eq(questions.type, typeFilter)));
    } else {
      rows = await db
        .select()
        .from(questions)
        .where(eq(questions.subjectId, subjectId));
    }

    // Parse options JSON for each question
    const data = rows.map((row) => ({
      ...row,
      options: row.options ? JSON.parse(row.options) : null,
    }));

    res.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取题目列表失败';
    res.status(500).json({ success: false, error: { code: 'FETCH_QUESTIONS_ERROR', message } });
  }
});

/**
 * DELETE /api/questions/:id
 * 删除单道题目
 */
router.delete('/api/questions/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const [existing] = await db.select().from(questions).where(eq(questions.id, id));
    if (!existing) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '题目不存在' } });
      return;
    }

    await db.delete(questions).where(eq(questions.id, id));
    res.json({ success: true, data: { id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除题目失败';
    res.status(500).json({ success: false, error: { code: 'DELETE_QUESTION_ERROR', message } });
  }
});

/**
 * POST /api/subjects/:subjectId/questions/generate
 * AI 生成/提取考题
 * Body: { materialIds: string[], mode?: 'extract' | 'generate', counts?: Record<QuestionType, number> }
 *   - extract: 从试卷中提取已有题目和答案（适用于带答案的试卷）
 *   - generate: AI 自动生成新题目（自动决定题型和数量）
 *   - 如果提供了 counts，使用旧版指定题型数量的方式生成
 */
router.post('/api/subjects/:subjectId/questions/generate', async (req: Request, res: Response) => {
  try {
    const subjectId = req.params.subjectId as string;
    const { materialIds, mode, counts } = req.body as GenerateQuestionsParams;

    if (!materialIds || !Array.isArray(materialIds) || materialIds.length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: '请提供至少一个资料 ID' },
      });
      return;
    }

    // Get API key from config table
    const [apiKeyRow] = await db
      .select()
      .from(config)
      .where(eq(config.key, 'deepseek_api_key'));

    if (!apiKeyRow) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_API_KEY', message: '未配置 AI API 密钥，请先在设置中配置' },
      });
      return;
    }

    // Get materials' extractedText (batch query)
    const materialRows = await db
      .select()
      .from(materials)
      .where(inArray(materials.id, materialIds));

    // Validate all materials exist and have extracted text
    const validMaterials = materialRows.filter((m) => m && m.extractedText);
    if (validMaterials.length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_VALID_MATERIALS', message: '所选资料均无可用文本内容，请确保资料已完成处理' },
      });
      return;
    }

    // Call AI service based on mode
    const apiKey = Buffer.from(apiKeyRow.value, 'base64').toString('utf-8');
    const aiService = new AIService(apiKey);
    const now = new Date().toISOString();

    // Process EACH material separately so questions keep correct materialId attribution
    // and each material uses its own type-specific strategy
    const savedQuestions: Array<{
      id: string; subjectId: string; materialId: string; type: string; stem: string;
      options: string | null; correctAnswer: string; explanation: string;
      knowledgePointId: string | null; createdAt: string;
    }> = [];

    for (const material of validMaterials) {
      const strategy = getProcessingStrategy(material.materialType);
      const text = material.extractedText!;

      let generatedQuestions;
      if (counts && typeof counts === 'object') {
        // Legacy mode: specified counts (applied per material)
        generatedQuestions = await aiService.generateQuestions({
          text,
          knowledgePoints: [],
          counts: counts as Record<QuestionType, number>,
        });
      } else if (mode === 'generate') {
        generatedQuestions = await aiService.autoGenerateQuestions(text, strategy.extractionHint);
      } else {
        generatedQuestions = await aiService.extractQuestionsFromPaper(text, strategy.extractionHint);
      }

      for (const q of generatedQuestions) {
        savedQuestions.push({
          id: uuidv4(),
          subjectId,
          materialId: material.id, // Correct attribution per source material
          type: q.type,
          stem: q.stem,
          options: q.options ? JSON.stringify(q.options) : null,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          knowledgePointId: q.knowledgePointId ?? null,
          createdAt: now,
        });
      }
    }

    if (savedQuestions.length > 0) {
      await db.insert(questions).values(savedQuestions);
    }

    // Return questions with parsed options
    const data = savedQuestions.map((q) => ({
      ...q,
      options: q.options ? JSON.parse(q.options) : null,
    }));

    res.status(201).json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '考题生成失败，请稍后重试';
    res.status(500).json({ success: false, error: { code: 'GENERATE_QUESTIONS_ERROR', message } });
  }
});

export default router;
