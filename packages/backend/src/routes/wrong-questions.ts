import { Router } from 'express';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { wrongQuestionBook, questions } from '../db/schema.js';

const router = Router();

/**
 * GET /api/subjects/:subjectId/wrong-questions
 * 获取错题本列表（含题目详情）
 */
router.get('/:subjectId/wrong-questions', async (req, res) => {
  try {
    const { subjectId } = req.params;
    const statusFilter = req.query.status as string | undefined;

    // Get wrong question records
    let wrongRecords;
    if (statusFilter && ['new', 'reviewing', 'mastered'].includes(statusFilter)) {
      wrongRecords = await db
        .select()
        .from(wrongQuestionBook)
        .where(
          and(
            eq(wrongQuestionBook.subjectId, subjectId),
            eq(wrongQuestionBook.status, statusFilter),
          ),
        );
    } else {
      wrongRecords = await db
        .select()
        .from(wrongQuestionBook)
        .where(eq(wrongQuestionBook.subjectId, subjectId));
    }

    if (wrongRecords.length === 0) {
      res.json({ success: true, data: [] });
      return;
    }

    // Get question details
    const questionIds = wrongRecords.map((r) => r.questionId);
    const questionRows = await db
      .select()
      .from(questions)
      .where(inArray(questions.id, questionIds));

    const questionMap = new Map(questionRows.map((q) => [q.id, q]));

    // Combine data
    const data = wrongRecords.map((record) => {
      const question = questionMap.get(record.questionId);
      return {
        id: record.id,
        questionId: record.questionId,
        wrongCount: record.wrongCount,
        masteryLevel: record.masteryLevel,
        consecutiveCorrect: record.consecutiveCorrect,
        nextReviewAt: record.nextReviewAt,
        firstWrongAt: record.firstWrongAt,
        lastWrongAt: record.lastWrongAt,
        status: record.status,
        question: question ? {
          id: question.id,
          type: question.type,
          stem: question.stem,
          options: question.options ? JSON.parse(question.options) : null,
          correctAnswer: question.correctAnswer,
          explanation: question.explanation,
          difficulty: question.difficulty,
        } : null,
      };
    });

    // Sort: new first, then reviewing (by nextReviewAt), then mastered
    const statusOrder: Record<string, number> = { new: 0, reviewing: 1, mastered: 2 };
    data.sort((a, b) => {
      const orderDiff = (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1);
      if (orderDiff !== 0) return orderDiff;
      return new Date(a.nextReviewAt).getTime() - new Date(b.nextReviewAt).getTime();
    });

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '获取错题本失败' },
    });
  }
});

/**
 * GET /api/subjects/:subjectId/wrong-questions/stats
 * 错题本统计
 */
router.get('/:subjectId/wrong-questions/stats', async (req, res) => {
  try {
    const { subjectId } = req.params;

    const allRecords = await db
      .select()
      .from(wrongQuestionBook)
      .where(eq(wrongQuestionBook.subjectId, subjectId));

    const stats = {
      total: allRecords.length,
      new: allRecords.filter((r) => r.status === 'new').length,
      reviewing: allRecords.filter((r) => r.status === 'reviewing').length,
      mastered: allRecords.filter((r) => r.status === 'mastered').length,
      avgMastery: allRecords.length > 0
        ? Math.round(allRecords.reduce((sum, r) => sum + r.masteryLevel, 0) / allRecords.length)
        : 0,
      needReviewNow: allRecords.filter((r) => r.status !== 'mastered' && new Date(r.nextReviewAt) <= new Date()).length,
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '获取错题统计失败' },
    });
  }
});

export default router;
