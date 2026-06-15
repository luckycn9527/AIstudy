/**
 * 间隔重复算法 (基于 SM-2 改良版)
 * 
 * 核心思想：
 * - 答对 → 间隔加长（记忆巩固）
 * - 答错 → 间隔缩短（需要复习）
 * - 连续正确 → 指数增长间隔
 * - 遗忘后重来 → 间隔重置
 */

/** 计算下次复习时间 */
export function calculateNextReview(params: {
  /** 连续正确次数 (本次答对后的值) */
  consecutiveCorrect: number;
  /** 当前掌握度 0-100 */
  masteryLevel: number;
  /** 是否本次答对 */
  isCorrect: boolean;
  /** 上次复习时间 (ISO string) */
  lastAttemptAt?: string;
}): { nextReviewAt: string; newInterval: number } {
  const { consecutiveCorrect, masteryLevel, isCorrect } = params;
  const now = new Date();

  let intervalDays: number;

  if (!isCorrect) {
    // 答错：短间隔复习
    if (masteryLevel < 30) {
      intervalDays = 0.007; // ~10 分钟
    } else if (masteryLevel < 60) {
      intervalDays = 0.042; // ~1 小时
    } else {
      intervalDays = 0.5; // 12 小时
    }
  } else {
    // 答对：根据连续正确次数计算间隔
    // SM-2 风格的间隔序列: 1天, 3天, 7天, 14天, 30天, 60天...
    const baseIntervals = [1, 3, 7, 14, 30, 60, 120, 240];
    const index = Math.min(consecutiveCorrect - 1, baseIntervals.length - 1);
    intervalDays = baseIntervals[Math.max(0, index)];

    // 掌握度修正：掌握度高 → 间隔更长
    const masteryFactor = 0.5 + (masteryLevel / 100) * 1.0; // 0.5 ~ 1.5
    intervalDays *= masteryFactor;
  }

  const nextDate = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  return {
    nextReviewAt: nextDate.toISOString(),
    newInterval: intervalDays,
  };
}

/** 计算掌握度变化 */
export function calculateMasteryChange(params: {
  currentMastery: number;
  isCorrect: boolean;
  consecutiveCorrect: number;
  difficulty: number; // 1-5
}): number {
  const { currentMastery, isCorrect, consecutiveCorrect, difficulty } = params;

  if (isCorrect) {
    // 答对：掌握度上升
    // 难度越高，上升越多；连续正确越多，上升越少（边际递减）
    const difficultyBonus = difficulty * 2;
    const diminishing = Math.max(1, 10 - consecutiveCorrect * 1.5);
    const gain = Math.round(diminishing + difficultyBonus);
    return Math.min(100, currentMastery + gain);
  } else {
    // 答错：掌握度下降
    // 掌握度越高时答错，下降越多（不应该错的题错了）
    const penalty = Math.round(10 + (currentMastery / 100) * 15);
    return Math.max(0, currentMastery - penalty);
  }
}

/** 计算学习状态转换 */
export function calculateLearningState(params: {
  currentState: string;
  masteryLevel: number;
  consecutiveCorrect: number;
  totalAttempts: number;
  daysSinceLastAttempt?: number;
}): string {
  const { currentState, masteryLevel, consecutiveCorrect, totalAttempts, daysSinceLastAttempt } = params;

  // 遗忘检测：超过预期间隔未复习
  if (daysSinceLastAttempt && daysSinceLastAttempt > 30 && masteryLevel < 80) {
    return 'forgetting';
  }
  if (daysSinceLastAttempt && daysSinceLastAttempt > 60) {
    return 'review_required';
  }

  // 状态机转换
  if (totalAttempts === 0) return 'unknown';
  if (totalAttempts === 1 && masteryLevel < 30) return 'seen';
  if (masteryLevel < 40) return 'understanding';
  if (masteryLevel < 70) return 'practicing';
  if (masteryLevel < 85) return 'mastered';
  if (consecutiveCorrect >= 5 && masteryLevel >= 90) return 'stable';
  if (masteryLevel >= 85) return 'mastered';

  return currentState;
}

/** 计算遗忘率 (基于艾宾浩斯遗忘曲线简化模型) */
export function calculateForgettingRate(params: {
  daysSinceLastAttempt: number;
  consecutiveCorrect: number;
  currentMastery: number;
}): number {
  const { daysSinceLastAttempt, consecutiveCorrect, currentMastery } = params;

  // 基础遗忘率 (每天)
  const baseForgetting = 0.3;

  // 连续正确越多，遗忘越慢
  const stabilityFactor = Math.max(0.1, 1 - consecutiveCorrect * 0.1);

  // 掌握度越高，遗忘越慢
  const masteryFactor = Math.max(0.2, 1 - (currentMastery / 100) * 0.7);

  // 时间衰减
  const timeFactor = 1 - Math.exp(-baseForgetting * stabilityFactor * masteryFactor * daysSinceLastAttempt);

  return Math.min(1, Math.max(0, timeFactor));
}
