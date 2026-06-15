import { Router } from 'express';
import { eq, and, lte, sql, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  wrongQuestionBook,
  knowledgeMastery,
  questions,
  knowledgePoints,
} from '../db/schema.js';

const router = Router();

/**
 * GET /api/subjects/:subjectId/review/today
 * 复习引擎：AI 决定今天学什么
 * 返回：紧急复习题、薄弱知识点、推荐题目、预计时间
 */
router.get('/:subjectId/review/today', async (req, res) => {
  try {
    const { subjectId } = req.params;
    const now = new Date().toISOString();

    // 1. 紧急复习：错题本中 nextReviewAt <= now 且未掌握的题目
    const urgentReviewRows = await db
      .select({
        id: wrongQuestionBook.id,
        questionId: wrongQuestionBook.questionId,
        wrongCount: wrongQuestionBook.wrongCount,
        masteryLevel: wrongQuestionBook.masteryLevel,
        lastWrongAt: wrongQuestionBook.lastWrongAt,
      })
      .from(wrongQuestionBook)
      .where(
        and(
          eq(wrongQuestionBook.subjectId, subjectId),
          lte(wrongQuestionBook.nextReviewAt, now),
          sql`${wrongQuestionBook.status} != 'mastered'`,
        ),
      )
      .limit(15);

    // Get question details for urgent reviews
    const urgentQuestionIds = urgentReviewRows.map((r) => r.questionId);
    let urgentQuestions: Array<{ id: string; type: string; stem: string; difficulty: number }> = [];
    if (urgentQuestionIds.length > 0) {
      urgentQuestions = await db
        .select({
          id: questions.id,
          type: questions.type,
          stem: questions.stem,
          difficulty: questions.difficulty,
        })
        .from(questions)
        .where(inArray(questions.id, urgentQuestionIds));
    }

    // 2. 薄弱知识点：掌握度最低的知识点
    const weakKnowledgeRows = await db
      .select({
        id: knowledgeMastery.id,
        knowledgePointId: knowledgeMastery.knowledgePointId,
        masteryLevel: knowledgeMastery.masteryLevel,
        memoryScore: knowledgeMastery.memoryScore,
        understandingScore: knowledgeMastery.understandingScore,
        applicationScore: knowledgeMastery.applicationScore,
        learningState: knowledgeMastery.learningState,
      })
      .from(knowledgeMastery)
      .where(
        and(
          eq(knowledgeMastery.subjectId, subjectId),
          sql`${knowledgeMastery.masteryLevel} < 60`,
        ),
      )
      .limit(10);

    // Get knowledge point titles
    const weakKpIds = weakKnowledgeRows.map((r) => r.knowledgePointId);
    let weakKnowledgeDetails: Array<{ id: string; title: string; masteryLevel: number; learningState: string }> = [];
    if (weakKpIds.length > 0) {
      const kpRows = await db
        .select({ id: knowledgePoints.id, title: knowledgePoints.title })
        .from(knowledgePoints)
        .where(inArray(knowledgePoints.id, weakKpIds));
      const kpTitleMap = new Map(kpRows.map((k) => [k.id, k.title]));

      weakKnowledgeDetails = weakKnowledgeRows.map((r) => ({
        id: r.knowledgePointId,
        title: kpTitleMap.get(r.knowledgePointId) ?? '未知',
        masteryLevel: r.masteryLevel,
        learningState: r.learningState,
      }));
    }

    // 3. 推荐题目：从题库中选择适合当前水平的题目
    //    优先：错题关联的知识点 + 薄弱知识点的题目
    const allWeakKpIds = [...new Set([...weakKpIds])];
    let recommendedQuestions: Array<{ id: string; type: string; stem: string; difficulty: number; cognitiveLevel: string }> = [];
    if (allWeakKpIds.length > 0) {
      recommendedQuestions = await db
        .select({
          id: questions.id,
          type: questions.type,
          stem: questions.stem,
          difficulty: questions.difficulty,
          cognitiveLevel: questions.cognitiveLevel,
        })
        .from(questions)
        .where(
          and(
            eq(questions.subjectId, subjectId),
            inArray(questions.knowledgePointId, allWeakKpIds),
          ),
        )
        .limit(10);
    }

    // If not enough from weak knowledge, fill with random questions
    if (recommendedQuestions.length < 5) {
      const additionalQuestions = await db
        .select({
          id: questions.id,
          type: questions.type,
          stem: questions.stem,
          difficulty: questions.difficulty,
          cognitiveLevel: questions.cognitiveLevel,
        })
        .from(questions)
        .where(eq(questions.subjectId, subjectId))
        .limit(10);

      const existingIds = new Set(recommendedQuestions.map((q) => q.id));
      for (const q of additionalQuestions) {
        if (!existingIds.has(q.id) && recommendedQuestions.length < 10) {
          recommendedQuestions.push(q);
        }
      }
    }

    // 4. 预计时间 (粗略估算: 每题 2-5 分钟)
    const totalQuestions = urgentQuestions.length + recommendedQuestions.length;
    const estimatedMinutes = Math.max(5, Math.round(totalQuestions * 3));

    res.json({
      success: true,
      data: {
        urgentReviews: urgentQuestions.map((q) => {
          const wrongInfo = urgentReviewRows.find((r) => r.questionId === q.id);
          return {
            ...q,
            wrongCount: wrongInfo?.wrongCount ?? 0,
            masteryLevel: wrongInfo?.masteryLevel ?? 0,
          };
        }),
        weakKnowledge: weakKnowledgeDetails,
        recommendedQuestions,
        summary: {
          urgentCount: urgentQuestions.length,
          weakKnowledgeCount: weakKnowledgeDetails.length,
          recommendedCount: recommendedQuestions.length,
          estimatedMinutes,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '获取今日复习计划失败' },
    });
  }
});

export default router;
