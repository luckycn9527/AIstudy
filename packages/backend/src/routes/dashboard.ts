import { Router } from 'express';
import { eq, desc, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  subjects,
  materials,
  questions,
  examSessions,
  examAnswers,
  knowledgePoints,
  analysisReports,
} from '../db/schema.js';

const router = Router();

/** ms diff -> minutes (clamped at 0) */
function durationMinutes(startedAt: string, submittedAt: string): number {
  const ms = new Date(submittedAt).getTime() - new Date(startedAt).getTime();
  return ms > 0 ? ms / 60000 : 0;
}

/** Format YYYY-MM-DD in local time (used as a stable date key) */
function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Format MM-DD for chart labels */
function formatMonthDay(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${m}-${day}`;
}

/**
 * GET /api/dashboard
 * Aggregated dashboard data across ALL subjects.
 */
router.get('/', async (_req, res) => {
  try {
    // ─── Base data ────────────────────────────────────────────────────
    const allSubjects = await db.select().from(subjects);
    const allSessions = await db.select().from(examSessions);
    const subjectNameMap = new Map(allSubjects.map((s) => [s.id, s.name]));

    // ─── Overview ─────────────────────────────────────────────────────
    let totalStudyMinutes = 0;
    let scoredCount = 0;
    let accuracySum = 0;
    const subjectAccuracy = new Map<string, { sum: number; count: number }>();

    for (const s of allSessions) {
      if (s.submittedAt) {
        totalStudyMinutes += durationMinutes(s.startedAt, s.submittedAt);
      }
      if (
        (s.status === 'scored' || s.status === 'analyzed') &&
        s.maxScore &&
        s.maxScore > 0 &&
        s.totalScore != null
      ) {
        const acc = s.totalScore / s.maxScore;
        accuracySum += acc;
        scoredCount += 1;
        const cell = subjectAccuracy.get(s.subjectId) ?? { sum: 0, count: 0 };
        cell.sum += acc;
        cell.count += 1;
        subjectAccuracy.set(s.subjectId, cell);
      }
    }

    const totalCompletedAnswersResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(examAnswers);
    const totalCompletedQuestions = Number(totalCompletedAnswersResult[0]?.count ?? 0);

    const overview = {
      totalStudyMinutes: Math.round(totalStudyMinutes),
      totalCompletedQuestions,
      averageAccuracy: scoredCount > 0 ? accuracySum / scoredCount : 0,
      totalSubjects: allSubjects.length,
    };

    // ─── Per-subject question counts ──────────────────────────────────
    const questionCounts = await db
      .select({
        subjectId: questions.subjectId,
        count: sql<number>`COUNT(*)`,
      })
      .from(questions)
      .groupBy(questions.subjectId);

    const questionCountMap = new Map<string, number>();
    for (const row of questionCounts) {
      questionCountMap.set(row.subjectId, Number(row.count));
    }

    const subjectsData = allSubjects.map((s) => {
      const a = subjectAccuracy.get(s.id);
      return {
        id: s.id,
        name: s.name,
        totalQuestions: questionCountMap.get(s.id) ?? 0,
        accuracy: a && a.count > 0 ? a.sum / a.count : 0,
      };
    });

    // ─── Recent materials (5 most recent across all subjects) ─────────
    const recentMaterialsRows = await db
      .select({
        id: materials.id,
        fileName: materials.fileName,
        fileType: materials.fileType,
        uploadedAt: materials.uploadedAt,
      })
      .from(materials)
      .orderBy(desc(materials.uploadedAt))
      .limit(5);

    const recentMaterials = recentMaterialsRows.map((m) => ({
      id: m.id,
      fileName: m.fileName,
      fileType: m.fileType as 'pdf' | 'docx',
      uploadedAt: m.uploadedAt,
    }));

    // ─── Last 7 days (oldest -> newest) ───────────────────────────────
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const last7Dates: Date[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      last7Dates.push(d);
    }
    const last7Keys = last7Dates.map(formatDateKey);
    const last7Labels = last7Dates.map(formatMonthDay);

    // ─── Progress trend ───────────────────────────────────────────────
    // subjectId -> dateKey -> {sum, count}
    const trendMap = new Map<string, Map<string, { sum: number; count: number }>>();
    for (const s of allSessions) {
      if (
        !s.submittedAt ||
        !s.maxScore ||
        s.maxScore <= 0 ||
        s.totalScore == null ||
        (s.status !== 'scored' && s.status !== 'analyzed')
      ) {
        continue;
      }
      const dk = formatDateKey(new Date(s.submittedAt));
      if (!last7Keys.includes(dk)) continue;
      let subMap = trendMap.get(s.subjectId);
      if (!subMap) {
        subMap = new Map();
        trendMap.set(s.subjectId, subMap);
      }
      const cell = subMap.get(dk) ?? { sum: 0, count: 0 };
      cell.sum += (s.totalScore / s.maxScore) * 100;
      cell.count += 1;
      subMap.set(dk, cell);
    }

    const progressTrend = {
      dates: last7Labels,
      bySubject: allSubjects.map((sub) => {
        const subMap = trendMap.get(sub.id);
        const scores = last7Keys.map((dk) => {
          const cell = subMap?.get(dk);
          return cell && cell.count > 0 ? cell.sum / cell.count : 0;
        });
        return {
          subjectId: sub.id,
          subjectName: sub.name,
          scores,
        };
      }),
    };

    // ─── Accuracy by current (radar) ──────────────────────────────────
    const accuracyByCurrent = allSubjects.map((sub) => {
      const a = subjectAccuracy.get(sub.id);
      return {
        subjectId: sub.id,
        subjectName: sub.name,
        accuracy: a && a.count > 0 ? (a.sum / a.count) * 100 : 0,
      };
    });

    // ─── Recent exam (most recent scored/analyzed session) ────────────
    const scoredSessions = allSessions
      .filter(
        (s) =>
          (s.status === 'scored' || s.status === 'analyzed') &&
          s.submittedAt &&
          s.maxScore != null,
      )
      .sort((a, b) => (a.submittedAt! < b.submittedAt! ? 1 : -1));

    let recentExam: {
      id: string;
      subjectName: string;
      totalScore: number;
      maxScore: number;
      accuracy: number;
      durationMinutes: number;
      submittedAt: string;
    } | null = null;

    if (scoredSessions.length > 0) {
      const latest = scoredSessions[0];
      const max = latest.maxScore ?? 0;
      const total = latest.totalScore ?? 0;
      recentExam = {
        id: latest.id,
        subjectName: subjectNameMap.get(latest.subjectId) ?? '',
        totalScore: total,
        maxScore: max,
        accuracy: max > 0 ? (total / max) * 100 : 0,
        durationMinutes: Math.round(durationMinutes(latest.startedAt, latest.submittedAt!)),
        submittedAt: latest.submittedAt!,
      };
    }

    // ─── Recent report (most recent analysis report) ──────────────────
    const recentReportRows = await db
      .select()
      .from(analysisReports)
      .orderBy(desc(analysisReports.createdAt))
      .limit(1);

    let recentReport: {
      id: string;
      sessionId: string;
      score: number;
      weakPoints: string[];
      strongPoints: string[];
    } | null = null;

    if (recentReportRows.length > 0) {
      const r = recentReportRows[0];

      // Score derived from the associated session's accuracy
      const sessionRows = await db
        .select()
        .from(examSessions)
        .where(eq(examSessions.id, r.sessionId));
      const sess = sessionRows[0];
      const score =
        sess && sess.maxScore && sess.maxScore > 0 && sess.totalScore != null
          ? (sess.totalScore / sess.maxScore) * 100
          : 0;

      // Parse weak points (first 2)
      let weakPoints: string[] = [];
      try {
        const parsed = JSON.parse(r.weakPoints);
        if (Array.isArray(parsed)) {
          weakPoints = parsed.filter((x): x is string => typeof x === 'string').slice(0, 2);
        }
      } catch {
        weakPoints = [];
      }

      // Strong points: knowledge points in this session with accuracy >= 80%
      const sessionAnswers = await db
        .select({
          score: examAnswers.score,
          maxScore: examAnswers.maxScore,
          knowledgePointId: questions.knowledgePointId,
        })
        .from(examAnswers)
        .innerJoin(questions, eq(examAnswers.questionId, questions.id))
        .where(eq(examAnswers.sessionId, r.sessionId));

      const kpAgg = new Map<string, { sum: number; max: number }>();
      for (const a of sessionAnswers) {
        if (!a.knowledgePointId) continue;
        const cell = kpAgg.get(a.knowledgePointId) ?? { sum: 0, max: 0 };
        cell.sum += a.score ?? 0;
        cell.max += a.maxScore ?? 0;
        kpAgg.set(a.knowledgePointId, cell);
      }
      const strongKpIds: string[] = [];
      for (const [kpId, v] of kpAgg) {
        if (v.max > 0 && v.sum / v.max >= 0.8) strongKpIds.push(kpId);
      }
      let strongPoints: string[] = [];
      if (strongKpIds.length > 0) {
        const kpRows = await db
          .select({ id: knowledgePoints.id, title: knowledgePoints.title })
          .from(knowledgePoints)
          .where(inArray(knowledgePoints.id, strongKpIds));
        strongPoints = kpRows.map((k) => k.title).slice(0, 2);
      }

      recentReport = {
        id: r.id,
        sessionId: r.sessionId,
        score,
        weakPoints,
        strongPoints,
      };
    }

    // ─── Today's study time + 7-day sparkline ─────────────────────────
    const last7DaysMinutes = last7Keys.map(() => 0);
    for (const s of allSessions) {
      if (!s.submittedAt) continue;
      const dk = formatDateKey(new Date(s.submittedAt));
      const idx = last7Keys.indexOf(dk);
      if (idx >= 0) {
        last7DaysMinutes[idx] += durationMinutes(s.startedAt, s.submittedAt);
      }
    }
    const todayMinutesRaw = last7DaysMinutes[6];
    const yesterdayMinutesRaw = last7DaysMinutes[5];
    const todayMinutes = Math.round(todayMinutesRaw);
    const yesterdayMinutes = Math.round(yesterdayMinutesRaw);
    const trendPercent =
      yesterdayMinutesRaw > 0
        ? Math.round(((todayMinutesRaw - yesterdayMinutesRaw) / yesterdayMinutesRaw) * 100)
        : 0;

    const todaySection = {
      todayMinutes,
      yesterdayMinutes,
      trendPercent,
      last7DaysMinutes: last7DaysMinutes.map((m) => Math.round(m)),
    };

    res.json({
      success: true,
      data: {
        overview,
        subjects: subjectsData,
        recentMaterials,
        progressTrend,
        accuracyByCurrent,
        recentExam,
        recentReport,
        today: todaySection,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '获取仪表盘数据失败' },
    });
  }
});

export default router;
