/**
 * 学习引擎
 * 负责在答题后更新错题本和知识掌握度
 */

import { v4 as uuidv4 } from 'uuid';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { wrongQuestionBook, knowledgeMastery, questions } from '../db/schema.js';
import {
  calculateNextReview,
  calculateMasteryChange,
  calculateLearningState,
  calculateForgettingRate,
} from './spaced-repetition.js';

interface AnswerResult {
  questionId: string;
  isCorrect: boolean;
  score: number;
  maxScore: number;
  timeSpent?: number;
}

/**
 * 考试提交后调用：更新错题本 + 知识掌握度
 */
export async function processExamResults(
  subjectId: string,
  results: AnswerResult[],
): Promise<void> {
  const now = new Date().toISOString();

  // Get question details for knowledge point mapping (precise query)
  const questionIds = results.map((r) => r.questionId);
  const questionRows = questionIds.length > 0
    ? await db.select().from(questions).where(inArray(questions.id, questionIds))
    : [];
  const questionMap = new Map(questionRows.map((q) => [q.id, q]));

  for (const result of results) {
    const question = questionMap.get(result.questionId);
    if (!question) continue;

    // 1. 更新错题本
    await updateWrongQuestionBook(subjectId, result, question.difficulty, now);

    // 2. 更新知识掌握度
    if (question.knowledgePointId) {
      await updateKnowledgeMastery(subjectId, question.knowledgePointId, result, question, now);
    }
  }
}

/**
 * 更新错题本
 */
async function updateWrongQuestionBook(
  subjectId: string,
  result: AnswerResult,
  difficulty: number,
  now: string,
): Promise<void> {
  const existing = await db
    .select()
    .from(wrongQuestionBook)
    .where(
      and(
        eq(wrongQuestionBook.subjectId, subjectId),
        eq(wrongQuestionBook.questionId, result.questionId),
      ),
    );

  if (!result.isCorrect) {
    // 答错：加入或更新错题本
    if (existing.length === 0) {
      // 新错题
      const { nextReviewAt } = calculateNextReview({
        consecutiveCorrect: 0,
        masteryLevel: 0,
        isCorrect: false,
      });

      await db.insert(wrongQuestionBook).values({
        id: uuidv4(),
        subjectId,
        questionId: result.questionId,
        firstWrongAt: now,
        wrongCount: 1,
        lastWrongAt: now,
        masteryLevel: 0,
        nextReviewAt,
        consecutiveCorrect: 0,
        status: 'new',
      }).onConflictDoNothing();
    } else {
      // 已有错题记录：更新
      const record = existing[0];
      const newMastery = calculateMasteryChange({
        currentMastery: record.masteryLevel,
        isCorrect: false,
        consecutiveCorrect: 0,
        difficulty,
      });
      const { nextReviewAt } = calculateNextReview({
        consecutiveCorrect: 0,
        masteryLevel: newMastery,
        isCorrect: false,
      });

      await db
        .update(wrongQuestionBook)
        .set({
          wrongCount: record.wrongCount + 1,
          lastWrongAt: now,
          masteryLevel: newMastery,
          nextReviewAt,
          consecutiveCorrect: 0,
          status: 'reviewing',
        })
        .where(eq(wrongQuestionBook.id, record.id));
    }
  } else if (existing.length > 0) {
    // 答对且在错题本中：更新掌握度
    const record = existing[0];
    const newConsecutive = record.consecutiveCorrect + 1;
    const newMastery = calculateMasteryChange({
      currentMastery: record.masteryLevel,
      isCorrect: true,
      consecutiveCorrect: newConsecutive,
      difficulty,
    });
    const { nextReviewAt } = calculateNextReview({
      consecutiveCorrect: newConsecutive,
      masteryLevel: newMastery,
      isCorrect: true,
    });

    const newStatus = newMastery >= 90 && newConsecutive >= 3 ? 'mastered' : 'reviewing';

    await db
      .update(wrongQuestionBook)
      .set({
        masteryLevel: newMastery,
        nextReviewAt,
        consecutiveCorrect: newConsecutive,
        status: newStatus,
      })
      .where(eq(wrongQuestionBook.id, record.id));
  }
}

/**
 * 更新知识掌握度 (5 维)
 */
async function updateKnowledgeMastery(
  subjectId: string,
  knowledgePointId: string,
  result: AnswerResult,
  question: { difficulty: number; cognitiveLevel: string },
  now: string,
): Promise<void> {
  const existing = await db
    .select()
    .from(knowledgeMastery)
    .where(
      and(
        eq(knowledgeMastery.subjectId, subjectId),
        eq(knowledgeMastery.knowledgePointId, knowledgePointId),
      ),
    );

  if (existing.length === 0) {
    // 首次接触该知识点
    const initialMastery = result.isCorrect ? 30 : 5;
    const { nextReviewAt } = calculateNextReview({
      consecutiveCorrect: result.isCorrect ? 1 : 0,
      masteryLevel: initialMastery,
      isCorrect: result.isCorrect,
    });

    await db.insert(knowledgeMastery).values({
      id: uuidv4(),
      subjectId,
      knowledgePointId,
      memoryScore: result.isCorrect ? 40 : 10,
      understandingScore: result.isCorrect ? 30 : 5,
      applicationScore: result.isCorrect && question.cognitiveLevel === 'apply' ? 30 : 0,
      speedScore: result.timeSpent && result.timeSpent < 60 ? 40 : 20,
      stabilityScore: 10,
      masteryLevel: initialMastery,
      learningState: 'seen',
      totalAttempts: 1,
      correctCount: result.isCorrect ? 1 : 0,
      consecutiveCorrect: result.isCorrect ? 1 : 0,
      avgTimeSpent: result.timeSpent ?? null,
      forgettingRate: 0.5,
      lastAttemptAt: now,
      nextReviewAt,
      updatedAt: now,
    }).onConflictDoNothing();
  } else {
    // 更新已有记录
    const record = existing[0];
    const newConsecutive = result.isCorrect ? record.consecutiveCorrect + 1 : 0;
    const newCorrectCount = record.correctCount + (result.isCorrect ? 1 : 0);
    const newTotalAttempts = record.totalAttempts + 1;

    // 更新各维度分数
    const memoryScore = calculateDimensionScore(record.memoryScore, result.isCorrect, 'memory', question);
    const understandingScore = calculateDimensionScore(record.understandingScore, result.isCorrect, 'understanding', question);
    const applicationScore = calculateDimensionScore(record.applicationScore, result.isCorrect, 'application', question);

    // 速度维度
    let speedScore = record.speedScore;
    if (result.timeSpent) {
      const avgTime = record.avgTimeSpent
        ? (record.avgTimeSpent * record.totalAttempts + result.timeSpent) / newTotalAttempts
        : result.timeSpent;
      // 越快越好 (基准: 60秒)
      speedScore = Math.min(100, Math.max(0, Math.round(100 - (avgTime / 60) * 30)));
    }

    // 稳定性维度 (连续正确越多越稳定)
    const stabilityScore = Math.min(100, Math.round((newConsecutive / 5) * 100));

    // 综合掌握度 (加权平均)
    const masteryLevel = Math.round(
      memoryScore * 0.2 +
      understandingScore * 0.25 +
      applicationScore * 0.25 +
      speedScore * 0.1 +
      stabilityScore * 0.2,
    );

    // 计算遗忘率
    const daysSinceLastAttempt = record.lastAttemptAt
      ? (Date.now() - new Date(record.lastAttemptAt).getTime()) / (24 * 60 * 60 * 1000)
      : 0;
    const forgettingRate = calculateForgettingRate({
      daysSinceLastAttempt,
      consecutiveCorrect: newConsecutive,
      currentMastery: masteryLevel,
    });

    // 学习状态转换
    const learningState = calculateLearningState({
      currentState: record.learningState,
      masteryLevel,
      consecutiveCorrect: newConsecutive,
      totalAttempts: newTotalAttempts,
      daysSinceLastAttempt,
    });

    // 下次复习时间
    const { nextReviewAt } = calculateNextReview({
      consecutiveCorrect: newConsecutive,
      masteryLevel,
      isCorrect: result.isCorrect,
    });

    // 平均答题时间
    const avgTimeSpent = result.timeSpent
      ? record.avgTimeSpent
        ? (record.avgTimeSpent * record.totalAttempts + result.timeSpent) / newTotalAttempts
        : result.timeSpent
      : record.avgTimeSpent;

    await db
      .update(knowledgeMastery)
      .set({
        memoryScore,
        understandingScore,
        applicationScore,
        speedScore,
        stabilityScore,
        masteryLevel,
        learningState,
        totalAttempts: newTotalAttempts,
        correctCount: newCorrectCount,
        consecutiveCorrect: newConsecutive,
        avgTimeSpent: avgTimeSpent ?? null,
        forgettingRate,
        lastAttemptAt: now,
        nextReviewAt,
        updatedAt: now,
      })
      .where(eq(knowledgeMastery.id, record.id));
  }
}

/**
 * 计算单个维度的分数变化
 */
function calculateDimensionScore(
  current: number,
  isCorrect: boolean,
  dimension: 'memory' | 'understanding' | 'application',
  question: { difficulty: number; cognitiveLevel: string },
): number {
  // 认知层级与维度的匹配度
  const levelDimensionMap: Record<string, string[]> = {
    remember: ['memory'],
    understand: ['memory', 'understanding'],
    apply: ['understanding', 'application'],
    analyze: ['understanding', 'application'],
    evaluate: ['application'],
    create: ['application'],
  };

  const relevantDimensions = levelDimensionMap[question.cognitiveLevel] ?? ['memory'];
  const isRelevant = relevantDimensions.includes(dimension);

  if (isCorrect) {
    // 答对：相关维度上升多，不相关维度上升少
    const gain = isRelevant ? 8 + question.difficulty * 2 : 3;
    return Math.min(100, current + gain);
  } else {
    // 答错：相关维度下降多
    const penalty = isRelevant ? 8 + question.difficulty : 3;
    return Math.max(0, current - penalty);
  }
}
