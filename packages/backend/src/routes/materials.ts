import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { materials, knowledgePoints, semanticChunks, config } from '../db/schema.js';
import { validateUploadFile } from '../services/upload.service.js';
import { DocumentProcessor } from '../processors/document.processor.js';
import { AIService } from '../services/ai.service.js';

const router = Router();

// Configure multer storage
const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, path.resolve(process.cwd(), 'data/uploads'));
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB, aligned with validateUploadFile
    files: 1,
  },
});

/**
 * GET /api/subjects/:subjectId/materials
 * 获取指定学科的资料列表
 */
router.get('/api/subjects/:subjectId/materials', async (req: Request, res: Response) => {
  try {
    const subjectId = req.params.subjectId as string;
    const rows = await db
      .select()
      .from(materials)
      .where(eq(materials.subjectId, subjectId));

    res.json({ success: true, data: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取资料列表失败';
    res.status(500).json({ success: false, error: { code: 'FETCH_MATERIALS_ERROR', message } });
  }
});

/**
 * POST /api/subjects/:subjectId/materials/upload
 * 上传文件（multer 中间件）
 */
router.post('/api/subjects/:subjectId/materials/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const subjectId = req.params.subjectId as string;
    const file = req.file;

    if (!file) {
      res.status(400).json({ success: false, error: { code: 'NO_FILE', message: '未提供上传文件' } });
      return;
    }

    // Validate file type and size
    const validation = validateUploadFile({ mimetype: file.mimetype, size: file.size });
    if (!validation.valid) {
      res.status(400).json({ success: false, error: { code: 'INVALID_FILE', message: validation.error! } });
      return;
    }

    // Fix Chinese filename encoding: multer reads multipart filename as latin1,
    // but browsers send UTF-8. Re-decode to get correct characters.
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf-8');

    // Determine file type from extension
    const ext = path.extname(originalName).toLowerCase();
    const fileType = ext === '.pdf' ? 'pdf' : 'docx';

    // Get material type from request body (default: reference)
    const materialType = (req.body?.materialType as string) || 'reference';

    // Set weight based on material type
    const MATERIAL_WEIGHTS: Record<string, number> = {
      exam_paper: 10,
      wrong_questions: 9,
      textbook: 8,
      formula_sheet: 7,
      cheat_sheet: 7,
      notes: 6,
      summary: 6,
      slides: 5,
      answer_sheet: 5,
      reference: 4,
    };
    const weight = MATERIAL_WEIGHTS[materialType] ?? 5;

    const materialId = uuidv4();
    const now = new Date().toISOString();

    // Insert material record with status 'processing'
    await db.insert(materials).values({
      id: materialId,
      subjectId,
      fileName: originalName,
      fileType,
      materialType,
      filePath: file.path,
      fileSize: file.size,
      status: 'processing',
      weight,
      examYear: (req.body?.examYear as string) || null,
      source: (req.body?.source as string) || null,
      uploadedAt: now,
    });

    // Asynchronously extract text and auto-chunk large files
    const processor = new DocumentProcessor();
    void (async () => {
      try {
        const chunks = await processor.extractAndChunk(file.path, fileType);

        // Check if extraction produced any meaningful text
        const hasContent = chunks.some((c) => c.text.trim().length > 50);

        if (!hasContent) {
          // Try OCR via SiliconFlow DeepSeek-OCR
          console.log(`[OCR] 文本提取为空，尝试 SiliconFlow OCR: ${originalName}`);
          const [ocrKeyRow] = await db.select().from(config).where(eq(config.key, 'siliconflow_api_key'));

          if (ocrKeyRow) {
            try {
              const { OCRService } = await import('../services/ocr.service.js');
              const ocrKey = Buffer.from(ocrKeyRow.value, 'base64').toString('utf-8');
              const ocrService = new OCRService(ocrKey);

              const pdfBuffer = await fs.readFile(file.path);
              const ocrText = await ocrService.extractTextFromPDF(pdfBuffer, originalName);

              if (ocrText.trim().length > 50) {
                await db.update(materials).set({ status: 'ready', extractedText: ocrText }).where(eq(materials.id, materialId));
                await db.insert(semanticChunks).values({
                  id: uuidv4(),
                  materialId,
                  subjectId,
                  title: 'OCR 识别',
                  content: ocrText,
                  tokens: Math.round(ocrText.length / 2),
                  sortOrder: 0,
                  createdAt: new Date().toISOString(),
                });
                console.log(`[OCR] 成功: ${originalName}, ${ocrText.length} 字符`);
                return;
              }
            } catch (ocrErr) {
              console.error('[OCR] SiliconFlow OCR 失败:', ocrErr instanceof Error ? ocrErr.message : ocrErr);
            }
          }

          await db.update(materials).set({
            status: 'failed',
            errorMessage: '无法提取文本内容（已尝试文字层提取和 OCR，均失败。请确保已配置 OCR 密钥或使用含文字层的 PDF）',
          }).where(eq(materials.id, materialId));
          return;
        }

        if (chunks.length === 1) {
          // Small file: store text directly in the original material
          await db
            .update(materials)
            .set({ status: 'ready', extractedText: chunks[0].text })
            .where(eq(materials.id, materialId));

          // Store as semantic chunk
          await db.insert(semanticChunks).values({
            id: uuidv4(),
            materialId,
            subjectId,
            title: chunks[0].title,
            content: chunks[0].text,
            tokens: Math.round(chunks[0].text.length / 2),
            sortOrder: 0,
            createdAt: new Date().toISOString(),
          });
        } else {
          // Large file: store first chunk in original, create additional materials for rest
          await db
            .update(materials)
            .set({
              status: 'ready',
              extractedText: chunks[0].text,
              fileName: `${originalName} - ${chunks[0].title}`,
            })
            .where(eq(materials.id, materialId));

          // Create additional material records for remaining chunks
          const now2 = new Date().toISOString();
          const additionalMaterials = chunks.slice(1).map((chunk) => ({
            id: uuidv4(),
            subjectId,
            fileName: `${originalName} - ${chunk.title}`,
            fileType,
            materialType,
            filePath: file.path,
            fileSize: Buffer.byteLength(chunk.text, 'utf-8'),
            status: 'ready' as const,
            extractedText: chunk.text,
            weight,
            uploadedAt: now2,
          }));

          if (additionalMaterials.length > 0) {
            await db.insert(materials).values(additionalMaterials);
          }

          // Store all chunks in semantic_chunks table
          const chunkRecords = chunks.map((chunk, idx) => ({
            id: uuidv4(),
            materialId,
            subjectId,
            title: chunk.title,
            content: chunk.text,
            tokens: Math.round(chunk.text.length / 2),
            sortOrder: idx,
            createdAt: new Date().toISOString(),
          }));
          if (chunkRecords.length > 0) {
            await db.insert(semanticChunks).values(chunkRecords);
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '文本抽取失败';
        console.error(`[材料处理失败] materialId=${materialId}, error:`, errorMessage);
        await db
          .update(materials)
          .set({ status: 'failed', errorMessage })
          .where(eq(materials.id, materialId));
      }
    })();

    // Return immediately with the material record
    res.status(201).json({
      success: true,
      data: {
        id: materialId,
        subjectId,
        fileName: originalName,
        fileType,
        materialType,
        filePath: file.path,
        fileSize: file.size,
        status: 'processing',
        weight,
        uploadedAt: now,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '文件上传失败';
    res.status(500).json({ success: false, error: { code: 'UPLOAD_ERROR', message } });
  }
});

/**
 * POST /api/materials/:id/analyze
 * 触发 AI 分析，提取知识点
 */
router.post('/api/materials/:id/analyze', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    // Get material record
    const [material] = await db
      .select()
      .from(materials)
      .where(eq(materials.id, id));

    if (!material) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '资料不存在' } });
      return;
    }

    if (material.status !== 'ready') {
      res.status(400).json({
        success: false,
        error: { code: 'NOT_READY', message: `资料状态为 "${material.status}"，需要 "ready" 状态才能分析` },
      });
      return;
    }

    if (!material.extractedText) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_TEXT', message: '资料文本内容为空，无法分析' },
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

    // Create AI service and analyze
    const apiKey = Buffer.from(apiKeyRow.value, 'base64').toString('utf-8');
    const aiService = new AIService(apiKey);
    const points = await aiService.analyzeKnowledgePoints(material.extractedText);

    // Store knowledge points in database
    const savedPoints = points.map((point) => ({
      id: uuidv4(),
      materialId: id,
      subjectId: material.subjectId,
      title: point.title,
      description: point.description ?? null,
    }));

    if (savedPoints.length > 0) {
      await db.insert(knowledgePoints).values(savedPoints);
    }

    res.json({ success: true, data: savedPoints });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 分析失败';
    res.status(500).json({ success: false, error: { code: 'ANALYZE_ERROR', message } });
  }
});

/**
 * GET /api/materials/:id/knowledge-points
 * 获取资料关联的知识点列表
 */
router.get('/api/materials/:id/knowledge-points', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    // Check material exists
    const [material] = await db
      .select()
      .from(materials)
      .where(eq(materials.id, id));

    if (!material) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '资料不存在' } });
      return;
    }

    const points = await db
      .select()
      .from(knowledgePoints)
      .where(eq(knowledgePoints.materialId, id));

    res.json({ success: true, data: points });
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取知识点失败';
    res.status(500).json({ success: false, error: { code: 'FETCH_KNOWLEDGE_POINTS_ERROR', message } });
  }
});

/**
 * DELETE /api/materials/:id
 * 删除资料及其关联的知识点，可选同步删除关联题目
 * Query: ?deleteQuestions=true 同时删除关联题目
 */
router.delete('/api/materials/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const deleteQuestions = req.query.deleteQuestions === 'true';

    // Check material exists
    const [material] = await db
      .select()
      .from(materials)
      .where(eq(materials.id, id));

    if (!material) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '资料不存在' } });
      return;
    }

    // Optionally delete associated questions
    if (deleteQuestions) {
      const { questions } = await import('../db/schema.js');
      await db.delete(questions).where(eq(questions.materialId, id));
    }

    // Delete associated knowledge points
    await db.delete(knowledgePoints).where(eq(knowledgePoints.materialId, id));

    // Delete associated semantic chunks
    await db.delete(semanticChunks).where(eq(semanticChunks.materialId, id));

    // Delete the material record
    await db.delete(materials).where(eq(materials.id, id));

    // Try to delete the physical file (non-blocking, best effort)
    if (material.filePath) {
      try {
        await fs.unlink(material.filePath);
      } catch {
        // File may already be deleted or inaccessible - that's fine
      }
    }

    res.json({ success: true, data: { id, questionsDeleted: deleteQuestions } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除资料失败';
    res.status(500).json({ success: false, error: { code: 'DELETE_MATERIAL_ERROR', message } });
  }
});

export default router;
