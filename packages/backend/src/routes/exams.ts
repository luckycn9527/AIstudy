import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  examSessions,
  examAnswers,
  questions,
  materials,
  knowledgeMastery,
  analysisReports,
  config,
} from '../db/schema.js';
import { ScoringEngine } from '../services/scoring.engine.js';
import { AIService } from '../services/ai.service.js';
import { processExamResults } from '../services/learning-engine.js';
import type { QuestionType, ExamDataForAnalysis } from '../types.js';

const router = Router();
const scoringEngine = new ScoringEngine();

/**
 * 获取 AI 服务实例（需要从 config 表读取 API Key）
 */
async function getAIService(): Promise<AIService | null> {
  const rows = await db.select().from(config).where(eq(config.key, 'deepseek_api_key'));
  if (rows.length === 0 || !rows[0].value) {
    return null;
  }
  // Decode base64-encoded API key
  const apiKey = Buffer.from(rows[0].value, 'base64').toString('utf-8');
  return new AIService(apiKey);
}

/**
 * GET /api/subjects/:subjectId/exams/history
 * 获取考试历史列表
 */
router.get('/api/subjects/:subjectId/exams/history', async (req, res) => {
  try {
    const { subjectId } = req.params;

    const sessions = await db
      .select()
      .from(examSessions)
      .where(eq(examSessions.subjectId, subjectId));

    // Sort by startedAt descending (most recent first)
    const sorted = sessions.sort((a, b) => (a.startedAt > b.startedAt ? -1 : 1));

    const data = sorted.map((s) => ({
      id: s.id,
      totalScore: s.totalScore,
      maxScore: s.maxScore,
      accuracy: s.maxScore && s.maxScore > 0 ? (s.totalScore ?? 0) / s.maxScore : 0,
      startedAt: s.startedAt,
      submittedAt: s.submittedAt,
      status: s.status,
    }));

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '获取考试历史失败' },
    });
  }
});

/**
 * POST /api/subjects/:subjectId/exams/plan
 * 智能组卷：AI 从题库中选择题目，创建均衡的考试
 * Body: { questionCount?: number }
 */
router.post('/api/subjects/:subjectId/exams/plan', async (req, res) => {
  try {
    const { subjectId } = req.params;
    const { questionCount } = req.body as { questionCount?: number };

    // Get all questions for this subject
    const allQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.subjectId, subjectId));

    if (allQuestions.length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_QUESTIONS', message: '题库为空，请先提取或生成题目' },
      });
      return;
    }

    // Get materials for context
    const allMaterials = await db
      .select({ id: materials.id, fileName: materials.fileName })
      .from(materials)
      .where(eq(materials.subjectId, subjectId));

    // Get user's mastery levels for dynamic difficulty adjustment
    const masteryRows = await db
      .select({
        knowledgePointId: knowledgeMastery.knowledgePointId,
        masteryLevel: knowledgeMastery.masteryLevel,
      })
      .from(knowledgeMastery)
      .where(eq(knowledgeMastery.subjectId, subjectId));

    const masteryMap = new Map(masteryRows.map((r) => [r.knowledgePointId, r.masteryLevel]));

    // Dynamic difficulty: prioritize questions targeting weak knowledge points
    // and adjust difficulty based on overall mastery
    const avgMastery = masteryRows.length > 0
      ? masteryRows.reduce((sum, r) => sum + r.masteryLevel, 0) / masteryRows.length
      : 50;

    // Sort questions: weak knowledge first, then by appropriate difficulty
    const scoredQuestions = allQuestions.map((q) => {
      const kpMastery = q.knowledgePointId ? (masteryMap.get(q.knowledgePointId) ?? 50) : 50;
      // Priority score: lower mastery = higher priority (needs more practice)
      const weaknessScore = 100 - kpMastery;
      // Difficulty match: prefer questions slightly above current level
      const targetDifficulty = Math.min(5, Math.max(1, Math.round(avgMastery / 20)));
      const difficultyMatch = 5 - Math.abs(q.difficulty - targetDifficulty);
      return { ...q, priority: weaknessScore * 2 + difficultyMatch };
    }).sort((a, b) => b.priority - a.priority);

    // Get AI service for planning
    const aiService = await getAIService();

    let selectedIds: string[];

    if (aiService && allQuestions.length > (questionCount ?? 20)) {
      // Use AI to plan the exam (pass priority-sorted questions)
      selectedIds = await aiService.planExam({
        questions: scoredQuestions.map((q) => ({
          id: q.id,
          type: q.type,
          stem: q.stem,
          materialId: q.materialId,
        })),
        materialSummaries: allMaterials,
        totalQuestionCount: questionCount,
      });
    } else {
      // No AI or few questions: use priority-sorted top N
      selectedIds = scoredQuestions.slice(0, questionCount ?? 20).map((q) => q.id);
    }

    // Create exam session
    const sessionId = uuidv4();
    const now = new Date().toISOString();

    await db.insert(examSessions).values({
      id: sessionId,
      subjectId,
      totalScore: null,
      maxScore: null,
      startedAt: now,
      submittedAt: null,
      status: 'in_progress',
    });

    // Create answer records
    const answerRecords = selectedIds.map((questionId) => ({
      id: uuidv4(),
      sessionId,
      questionId,
      userAnswer: null,
      score: null,
      maxScore: 1,
      scoringReason: null,
      status: 'answered',
    }));

    if (answerRecords.length > 0) {
      await db.insert(examAnswers).values(answerRecords);
    }

    // Get selected questions details
    const selectedQuestions = allQuestions
      .filter((q) => selectedIds.includes(q.id))
      .map((q) => ({ ...q, options: q.options ? JSON.parse(q.options) : null }));

    res.status(201).json({
      success: true,
      data: {
        session: {
          id: sessionId,
          subjectId,
          startedAt: now,
          status: 'in_progress',
        },
        questions: selectedQuestions,
        totalSelected: selectedIds.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '智能组卷失败' },
    });
  }
});

// POST /api/subjects/:subjectId/exams - 创建考试会话
router.post('/api/subjects/:subjectId/exams', async (req, res) => {
  try {
    const { subjectId } = req.params;
    const { questionIds } = req.body;

    if (!questionIds || !Array.isArray(questionIds) || questionIds.length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: '题目ID列表不能为空' },
      });
      return;
    }

    // 验证题目是否存在
    const questionRows = await db
      .select()
      .from(questions)
      .where(eq(questions.subjectId, subjectId));

    const validQuestionIds = new Set(questionRows.map((q) => q.id));
    const invalidIds = questionIds.filter((id: string) => !validQuestionIds.has(id));

    if (invalidIds.length > 0) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: `以下题目ID无效: ${invalidIds.join(', ')}` },
      });
      return;
    }

    // 创建考试会话
    const sessionId = uuidv4();
    const now = new Date().toISOString();

    const session = {
      id: sessionId,
      subjectId,
      totalScore: null,
      maxScore: null,
      startedAt: now,
      submittedAt: null,
      status: 'in_progress',
    };

    await db.insert(examSessions).values(session);

    // 创建答题记录
    const answerRecords = questionIds.map((questionId: string) => ({
      id: uuidv4(),
      sessionId,
      questionId,
      userAnswer: null,
      score: null,
      maxScore: 1,
      scoringReason: null,
      status: 'answered',
    }));

    if (answerRecords.length > 0) {
      await db.insert(examAnswers).values(answerRecords);
    }

    // 获取题目详情
    const selectedQuestions = questionRows
      .filter((q) => questionIds.includes(q.id))
      .map((q) => ({ ...q, options: q.options ? JSON.parse(q.options) : null }));

    res.status(201).json({
      success: true,
      data: {
        session,
        questions: selectedQuestions,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '创建考试会话失败' },
    });
  }
});

// GET /api/exams/:id - 获取考试详情
router.get('/api/exams/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const sessionRows = await db
      .select()
      .from(examSessions)
      .where(eq(examSessions.id, id));

    if (sessionRows.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '考试会话不存在' },
      });
      return;
    }

    const session = sessionRows[0];

    // 获取答题记录
    const answers = await db
      .select()
      .from(examAnswers)
      .where(eq(examAnswers.sessionId, id));

    // 获取关联题目（精确查询，避免全表扫描）
    const questionIds = answers.map((a) => a.questionId);
    const sessionQuestions = questionIds.length > 0
      ? await db.select().from(questions).where(inArray(questions.id, questionIds))
      : [];

    res.json({
      success: true,
      data: {
        session,
        questions: sessionQuestions,
        answers,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '获取考试详情失败' },
    });
  }
});

// POST /api/exams/:id/submit - 提交答卷并触发判分
router.post('/api/exams/:id/submit', async (req, res) => {
  try {
    const { id } = req.params;
    const { answers } = req.body;

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: '答案列表不能为空' },
      });
      return;
    }

    // 验证考试会话存在且状态为 in_progress
    const sessionRows = await db
      .select()
      .from(examSessions)
      .where(eq(examSessions.id, id));

    if (sessionRows.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '考试会话不存在' },
      });
      return;
    }

    const session = sessionRows[0];
    if (session.status !== 'in_progress') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_STATE', message: '考试已提交，不能重复提交' },
      });
      return;
    }

    // 获取答题记录和题目信息
    const examAnswerRows = await db
      .select()
      .from(examAnswers)
      .where(eq(examAnswers.sessionId, id));

    const questionIds = examAnswerRows.map((a) => a.questionId);
    const sessionQuestions = questionIds.length > 0
      ? await db.select().from(questions).where(inArray(questions.id, questionIds))
      : [];

    const questionMap = new Map(sessionQuestions.map((q) => [q.id, q]));

    // 获取 AI 服务（用于主观题评分）
    const aiService = await getAIService();

    let totalScore = 0;
    let maxScore = 0;
    const scoringResults: Array<{
      questionId: string;
      score: number;
      maxScore: number;
      reason?: string;
      status: string;
    }> = [];

    // 逐题判分
    for (const answer of answers as Array<{ questionId: string; userAnswer: string; timeSpent?: number }>) {
      const question = questionMap.get(answer.questionId);
      if (!question) continue;

      // 更新用户答案
      const answerRecord = examAnswerRows.find((a) => a.questionId === answer.questionId);
      if (!answerRecord) continue;

      const questionType = question.type as QuestionType;

      if (questionType === 'short_answer') {
        // 主观题：尝试 AI 评分
        let score = 0;
        let reason = '';
        let status = 'pending_score';

        if (aiService) {
          try {
            const aiResult = await aiService.scoreSubjectiveAnswer({
              stem: question.stem,
              referenceAnswer: question.correctAnswer,
              userAnswer: answer.userAnswer,
            });
            score = aiResult.score;
            reason = aiResult.reason;
            status = 'scored';
          } catch {
            // AI 评分失败，标记为待评分
            status = 'pending_score';
          }
        }

        await db
          .update(examAnswers)
          .set({
            userAnswer: answer.userAnswer,
            score,
            maxScore: 1,
            scoringReason: reason || null,
            status,
            timeSpent: answer.timeSpent ?? null,
          })
          .where(eq(examAnswers.id, answerRecord.id));

        totalScore += score;
        maxScore += 1;
        scoringResults.push({
          questionId: answer.questionId,
          score,
          maxScore: 1,
          reason: reason || undefined,
          status,
        });
      } else {
        // 客观题：本地判分
        const result = scoringEngine.scoreObjectiveQuestion(
          {
            id: question.id,
            type: questionType,
            correctAnswer: question.correctAnswer,
          },
          answer.userAnswer,
        );

        await db
          .update(examAnswers)
          .set({
            userAnswer: answer.userAnswer,
            score: result.score,
            maxScore: result.maxScore,
            scoringReason: null,
            status: 'scored',
            timeSpent: answer.timeSpent ?? null,
          })
          .where(eq(examAnswers.id, answerRecord.id));

        totalScore += result.score;
        maxScore += result.maxScore;
        scoringResults.push({
          questionId: answer.questionId,
          score: result.score,
          maxScore: result.maxScore,
          status: 'scored',
        });
      }
    }

    // 更新考试会话状态
    const submittedAt = new Date().toISOString();
    await db
      .update(examSessions)
      .set({
        totalScore,
        maxScore,
        submittedAt,
        status: 'scored',
      })
      .where(eq(examSessions.id, id));

    // ─── 学习引擎：更新错题本 + 知识掌握度 (异步，不阻塞响应) ───
    void processExamResults(
      session.subjectId,
      scoringResults.map((r) => ({
        questionId: r.questionId,
        isCorrect: r.score >= r.maxScore,
        score: r.score,
        maxScore: r.maxScore,
        timeSpent: (answers as Array<{ questionId: string; timeSpent?: number }>).find((a) => a.questionId === r.questionId)?.timeSpent,
      })),
    ).catch((err) => {
      console.error('[学习引擎] 处理考试结果失败:', err instanceof Error ? err.message : err);
    });

    res.json({
      success: true,
      data: {
        sessionId: id,
        totalScore,
        maxScore,
        submittedAt,
        status: 'scored',
        results: scoringResults,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '提交答卷失败' },
    });
  }
});

// GET /api/exams/:id/result - 获取判分结果
router.get('/api/exams/:id/result', async (req, res) => {
  try {
    const { id } = req.params;

    const sessionRows = await db
      .select()
      .from(examSessions)
      .where(eq(examSessions.id, id));

    if (sessionRows.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '考试会话不存在' },
      });
      return;
    }

    const session = sessionRows[0];

    // 获取所有答题记录
    const answers = await db
      .select()
      .from(examAnswers)
      .where(eq(examAnswers.sessionId, id));

    // 获取关联题目（精确查询）
    const questionIds = answers.map((a) => a.questionId);
    const sessionQuestions = questionIds.length > 0
      ? await db.select().from(questions).where(inArray(questions.id, questionIds))
      : [];

    res.json({
      success: true,
      data: {
        session,
        questions: sessionQuestions,
        answers,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '获取判分结果失败' },
    });
  }
});

// POST /api/exams/:id/analyze - 触发考后分析
router.post('/api/exams/:id/analyze', async (req, res) => {
  try {
    const { id } = req.params;

    // 验证考试会话存在且已评分
    const sessionRows = await db
      .select()
      .from(examSessions)
      .where(eq(examSessions.id, id));

    if (sessionRows.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '考试会话不存在' },
      });
      return;
    }

    const session = sessionRows[0];
    if (session.status !== 'scored' && session.status !== 'analyzed') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_STATE', message: '考试尚未完成评分，无法进行分析' },
      });
      return;
    }

    // 获取 AI 服务
    const aiService = await getAIService();
    if (!aiService) {
      res.status(500).json({
        success: false,
        error: { code: 'AI_SERVICE_UNAVAILABLE', message: 'AI 服务不可用，请先配置 API Key' },
      });
      return;
    }

    // 获取答题记录和题目信息
    const answers = await db
      .select()
      .from(examAnswers)
      .where(eq(examAnswers.sessionId, id));

    const questionIds = answers.map((a) => a.questionId);
    const sessionQuestions = questionIds.length > 0
      ? await db.select().from(questions).where(inArray(questions.id, questionIds))
      : [];

    // 构建分析数据
    const examData: ExamDataForAnalysis = {
      sessionId: id,
      questions: sessionQuestions.map((q) => ({
        id: q.id,
        type: q.type as QuestionType,
        stem: q.stem,
        correctAnswer: q.correctAnswer,
        knowledgePointId: q.knowledgePointId ?? undefined,
      })),
      answers: answers.map((a) => ({
        questionId: a.questionId,
        userAnswer: a.userAnswer ?? '',
        score: a.score ?? 0,
        maxScore: a.maxScore,
      })),
    };

    // 调用 AI 生成分析报告
    const report = await aiService.generateAnalysisReport(examData);

    // 删除旧报告，存储新报告
    await db.delete(analysisReports).where(eq(analysisReports.sessionId, id));

    const reportId = uuidv4();
    const now = new Date().toISOString();

    await db.insert(analysisReports).values({
      id: reportId,
      sessionId: id,
      subjectId: session.subjectId,
      weakPoints: JSON.stringify(report.weakPoints),
      errorAnalysis: JSON.stringify(report.errorAnalysis),
      suggestions: JSON.stringify(report.suggestions),
      createdAt: now,
    });

    // 更新考试会话状态为已分析
    await db
      .update(examSessions)
      .set({ status: 'analyzed' })
      .where(eq(examSessions.id, id));

    res.json({
      success: true,
      data: {
        id: reportId,
        sessionId: id,
        weakPoints: report.weakPoints,
        errorAnalysis: report.errorAnalysis,
        suggestions: report.suggestions,
        createdAt: now,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '生成分析报告失败';
    console.error('[分析报告] 生成失败:', message);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '生成分析报告失败，请稍后重试' },
    });
  }
});

// GET /api/exams/:id/report - 获取分析报告
router.get('/api/exams/:id/report', async (req, res) => {
  try {
    const { id } = req.params;

    // 验证考试会话存在
    const sessionRows = await db
      .select()
      .from(examSessions)
      .where(eq(examSessions.id, id));

    if (sessionRows.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '考试会话不存在' },
      });
      return;
    }

    // 获取分析报告（取最新的一条）
    const reportRows = await db
      .select()
      .from(analysisReports)
      .where(eq(analysisReports.sessionId, id));

    if (reportRows.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '分析报告不存在，请先触发分析' },
      });
      return;
    }

    // Sort by createdAt descending, take latest
    const report = reportRows.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))[0];

    res.json({
      success: true,
      data: {
        id: report.id,
        sessionId: report.sessionId,
        subjectId: report.subjectId,
        weakPoints: JSON.parse(report.weakPoints),
        errorAnalysis: JSON.parse(report.errorAnalysis),
        suggestions: JSON.parse(report.suggestions),
        createdAt: report.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '获取分析报告失败' },
    });
  }
});

export default router;
