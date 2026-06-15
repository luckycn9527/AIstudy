// packages/backend/src/services/analytics.engine.ts

import { eq, and, gte, sql, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';
import { examSessions, examAnswers, questions, knowledgePoints } from '../db/schema.js';
import type { AnalyticsData } from '../types.js';

type Database = BetterSQLite3Database<typeof schema>;

/**
 * 学习进度统计引擎
 *
 * 负责计算学科维度的考试统计数据，包括：
 * - 已完成考试次数
 * - 平均得分率
 * - 各知识点掌握率
 * - 得分趋势
 */
export class AnalyticsEngine {
  constructor(private db: Database) {}

  /**
   * 获取指定学科的学习进度统计数据
   * @param subjectId 学科 ID
   * @param range 时间范围筛选：7d（最近7天）、30d（最近30天）、all（全部）
   */
  async getSubjectAnalytics(subjectId: string, range?: '7d' | '30d' | 'all'): Promise<AnalyticsData> {
    const dateFilter = this.getDateFilter(range);

    // 查询已完成判分的考试会话（scored 和 analyzed 都是有效的完成状态）
    const conditions = [
      eq(examSessions.subjectId, subjectId),
      sql`${examSessions.status} IN ('scored', 'analyzed')`,
    ];

    if (dateFilter) {
      conditions.push(dateFilter);
    }

    const sessions = await this.db
      .select()
      .from(examSessions)
      .where(and(...conditions));

    // 边界情况：无考试记录
    if (sessions.length === 0) {
      return {
        subjectId,
        totalExams: 0,
        averageScoreRate: 0,
        knowledgeMastery: [],
        scoreTrend: [],
      };
    }

    const totalExams = sessions.length;

    // 计算平均得分率
    const averageScoreRate = sessions.reduce((sum, s) => {
      const maxScore = s.maxScore ?? 0;
      if (maxScore === 0) return sum;
      return sum + (s.totalScore ?? 0) / maxScore;
    }, 0) / totalExams;

    // 计算得分趋势（按提交时间排序）
    const scoreTrend = sessions
      .filter(s => s.submittedAt != null && s.maxScore != null && s.maxScore > 0)
      .sort((a, b) => (a.submittedAt! < b.submittedAt! ? -1 : 1))
      .map(s => ({
        date: s.submittedAt!,
        scoreRate: (s.totalScore ?? 0) / s.maxScore!,
      }));

    // 计算各知识点掌握率
    const knowledgeMastery = await this.calculateKnowledgeMastery(subjectId, sessions.map(s => s.id));

    return { subjectId, totalExams, averageScoreRate, knowledgeMastery, scoreTrend };
  }

  /**
   * 根据时间范围生成日期过滤条件
   */
  private getDateFilter(range?: '7d' | '30d' | 'all') {
    if (!range || range === 'all') return undefined;
    const days = range === '7d' ? 7 : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    return gte(examSessions.submittedAt, since);
  }

  /**
   * 计算各知识点的掌握率
   * 通过 examAnswers 关联 questions 获取知识点，按知识点聚合计算正确率
   */
  private async calculateKnowledgeMastery(
    subjectId: string,
    sessionIds: string[],
  ): Promise<AnalyticsData['knowledgeMastery']> {
    if (sessionIds.length === 0) return [];

    // 查询这些会话中所有已评分的答题记录，关联题目获取知识点信息
    const answersWithKnowledge = await this.db
      .select({
        score: examAnswers.score,
        maxScore: examAnswers.maxScore,
        knowledgePointId: questions.knowledgePointId,
      })
      .from(examAnswers)
      .innerJoin(questions, eq(examAnswers.questionId, questions.id))
      .where(
        and(
          inArray(examAnswers.sessionId, sessionIds),
          eq(examAnswers.status, 'scored'),
          sql`${questions.knowledgePointId} IS NOT NULL`,
        ),
      );

    // 按知识点聚合
    const masteryMap = new Map<string, { totalScore: number; totalMaxScore: number }>();

    for (const answer of answersWithKnowledge) {
      const kpId = answer.knowledgePointId!;
      const existing = masteryMap.get(kpId) ?? { totalScore: 0, totalMaxScore: 0 };
      existing.totalScore += answer.score ?? 0;
      existing.totalMaxScore += answer.maxScore;
      masteryMap.set(kpId, existing);
    }

    if (masteryMap.size === 0) return [];

    // 获取知识点标题
    const kpIds = [...masteryMap.keys()];
    const kpRecords = await this.db
      .select({ id: knowledgePoints.id, title: knowledgePoints.title })
      .from(knowledgePoints)
      .where(
        and(
          inArray(knowledgePoints.id, kpIds),
          eq(knowledgePoints.subjectId, subjectId),
        ),
      );

    const kpTitleMap = new Map(kpRecords.map(kp => [kp.id, kp.title]));

    // 计算每个知识点的掌握率
    const result: AnalyticsData['knowledgeMastery'] = [];
    for (const [kpId, data] of masteryMap) {
      const title = kpTitleMap.get(kpId);
      if (!title) continue; // 跳过不属于该学科的知识点
      const masteryRate = data.totalMaxScore > 0 ? data.totalScore / data.totalMaxScore : 0;
      result.push({
        knowledgePointId: kpId,
        title,
        masteryRate,
      });
    }

    return result;
  }
}
