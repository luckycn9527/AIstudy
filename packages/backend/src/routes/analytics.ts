import { Router } from 'express';
import { db } from '../db/index.js';
import { AnalyticsEngine } from '../services/analytics.engine.js';

const router = Router();

// GET /api/subjects/:subjectId/analytics - 获取学科进度统计
router.get('/:subjectId/analytics', async (req, res) => {
  try {
    const { subjectId } = req.params;
    const analyticsEngine = new AnalyticsEngine(db);
    const data = await analyticsEngine.getSubjectAnalytics(subjectId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '获取学习进度统计失败' },
    });
  }
});

// GET /api/subjects/:subjectId/analytics/trend - 获取得分趋势
router.get('/:subjectId/analytics/trend', async (req, res) => {
  try {
    const { subjectId } = req.params;
    const range = req.query.range as '7d' | '30d' | 'all' | undefined;

    // 验证 range 参数
    if (range && !['7d', '30d', 'all'].includes(range)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_RANGE', message: '无效的时间范围参数，支持 7d、30d、all' },
      });
      return;
    }

    const analyticsEngine = new AnalyticsEngine(db);
    const data = await analyticsEngine.getSubjectAnalytics(subjectId, range);
    res.json({ success: true, data: data.scoreTrend });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '获取得分趋势失败' },
    });
  }
});

export default router;
