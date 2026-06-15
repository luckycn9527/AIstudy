import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  subjects,
  materials,
  knowledgePoints,
  questions,
  examSessions,
  examAnswers,
  analysisReports,
} from '../db/schema.js';

const router = Router();

// GET /api/subjects - 获取所有学科
router.get('/', async (_req, res) => {
  try {
    const allSubjects = await db.select().from(subjects);
    res.json({ success: true, data: allSubjects });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '获取学科列表失败' },
    });
  }
});

// POST /api/subjects - 创建学科
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: '学科名称不能为空' },
      });
      return;
    }

    const newSubject = {
      id: uuidv4(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
    };

    await db.insert(subjects).values(newSubject);
    res.status(201).json({ success: true, data: newSubject });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '创建学科失败' },
    });
  }
});

// DELETE /api/subjects/:id - 级联删除学科
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 检查学科是否存在
    const existing = await db.select().from(subjects).where(eq(subjects.id, id));
    if (existing.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '学科不存在' },
      });
      return;
    }

    // 事务内级联删除，确保数据一致性
    // 删除顺序：analysisReports -> examAnswers -> examSessions -> questions -> knowledgePoints -> materials -> subjects
    db.transaction((tx) => {
      // 1. 删除分析报告（by subjectId）
      tx.delete(analysisReports).where(eq(analysisReports.subjectId, id)).run();

      // 2. 删除答题记录（by sessionId where session.subjectId matches）
      const sessions = tx
        .select({ id: examSessions.id })
        .from(examSessions)
        .where(eq(examSessions.subjectId, id))
        .all();

      if (sessions.length > 0) {
        const sessionIds = sessions.map((s) => s.id);
        tx.delete(examAnswers).where(inArray(examAnswers.sessionId, sessionIds)).run();
      }

      // 3. 删除考试会话（by subjectId）
      tx.delete(examSessions).where(eq(examSessions.subjectId, id)).run();

      // 4. 删除题目（by subjectId）
      tx.delete(questions).where(eq(questions.subjectId, id)).run();

      // 5. 删除知识点（by subjectId）
      tx.delete(knowledgePoints).where(eq(knowledgePoints.subjectId, id)).run();

      // 6. 删除资料（by subjectId）
      tx.delete(materials).where(eq(materials.subjectId, id)).run();

      // 7. 删除学科本身
      tx.delete(subjects).where(eq(subjects.id, id)).run();
    });

    res.json({ success: true, data: { id } });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '删除学科失败' },
    });
  }
});

export default router;
