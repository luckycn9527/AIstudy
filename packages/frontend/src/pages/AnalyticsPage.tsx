import { useState, useEffect, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts';
import { useSubject } from '../contexts/SubjectContext';
import { Card, SkeletonCard } from '../components/ui';
import { api } from '../services/api';

type TimeRange = '7d' | '30d' | 'all';

interface AnalyticsData {
  subjectId: string;
  totalExams: number;
  averageScoreRate: number;
  knowledgeMastery: Array<{
    knowledgePointId: string;
    title: string;
    masteryRate: number;
  }>;
  scoreTrend: Array<{
    date: string;
    scoreRate: number;
  }>;
}

interface TrendDataPoint {
  date: string;
  scoreRate: number;
}

// --- StatsCards ---
function StatsCards({ totalExams, averageScoreRate }: { totalExams: number; averageScoreRate: number }) {
  return (
    <div style={{ display: 'flex', gap: '20px', marginBottom: '28px' }}>
      <div
        style={{
          flex: 1,
          padding: '24px',
          background: 'linear-gradient(135deg, #6248F1, #8B6CF6)',
          borderRadius: '14px',
          color: '#fff',
          boxShadow: '0 4px 14px rgba(98, 72, 241, 0.25)',
        }}
      >
        <div style={{ fontSize: '36px', fontWeight: 700, marginBottom: '6px' }}>{totalExams}</div>
        <div style={{ fontSize: '14px', opacity: 0.85 }}>已完成考试（次）</div>
      </div>
      <div
        style={{
          flex: 1,
          padding: '24px',
          background: 'linear-gradient(135deg, #3B82F6, #60A5FA)',
          borderRadius: '14px',
          color: '#fff',
          boxShadow: '0 4px 14px rgba(59, 130, 246, 0.25)',
        }}
      >
        <div style={{ fontSize: '36px', fontWeight: 700, marginBottom: '6px' }}>
          {(averageScoreRate * 100).toFixed(1)}%
        </div>
        <div style={{ fontSize: '14px', opacity: 0.85 }}>平均得分率</div>
      </div>
    </div>
  );
}

// --- TimeRangeFilter ---
function TimeRangeFilter({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}) {
  const options: { label: string; range: TimeRange }[] = [
    { label: '7天', range: '7d' },
    { label: '30天', range: '30d' },
    { label: '全部', range: 'all' },
  ];

  return (
    <div style={{ display: 'flex', gap: '6px' }}>
      {options.map((opt) => (
        <button
          key={opt.range}
          onClick={() => onChange(opt.range)}
          style={{
            padding: '6px 16px',
            fontSize: '13px',
            border: 'none',
            borderRadius: '20px',
            backgroundColor: value === opt.range ? '#6248F1' : '#F3F4F6',
            color: value === opt.range ? '#fff' : '#6B7280',
            cursor: 'pointer',
            fontWeight: value === opt.range ? 600 : 400,
            transition: 'all 0.15s',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// --- ScoreTrendChart ---
function ScoreTrendChart({ data }: { data: TrendDataPoint[] }) {
  if (data.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#9CA3AF' }}>暂无数据</div>
    );
  }

  const chartData = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }),
    scoreRate: Math.round(d.scoreRate * 100),
  }));

  return (
    <div role="img" aria-label={`得分趋势折线图，共 ${data.length} 个数据点`}>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis dataKey="date" fontSize={12} stroke="#9CA3AF" />
          <YAxis domain={[0, 100]} unit="%" fontSize={12} stroke="#9CA3AF" />
          <Tooltip formatter={(value: number) => [`${value}%`, '得分率']} />
          <Line
            type="monotone"
            dataKey="scoreRate"
            stroke="#6248F1"
            strokeWidth={2.5}
            dot={{ r: 4, fill: '#6248F1' }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- KnowledgeMasteryChart ---
function KnowledgeMasteryChart({
  data,
}: {
  data: Array<{ knowledgePointId: string; title: string; masteryRate: number }>;
}) {
  if (data.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#9CA3AF' }}>暂无数据</div>
    );
  }

  const chartData = data.map((d) => ({
    subject: d.title.length > 6 ? d.title.slice(0, 6) + '...' : d.title,
    mastery: Math.round(d.masteryRate * 100),
    fullMark: 100,
  }));

  return (
    <div role="img" aria-label={`知识点掌握分布雷达图，共 ${data.length} 个知识点`}>
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={chartData}>
          <PolarGrid stroke="#E5E7EB" />
          <PolarAngleAxis dataKey="subject" fontSize={12} stroke="#6B7280" />
          <PolarRadiusAxis angle={90} domain={[0, 100]} fontSize={11} stroke="#9CA3AF" />
          <Radar
            name="掌握率"
            dataKey="mastery"
            stroke="#3A9B53"
            fill="#3A9B53"
            fillOpacity={0.2}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- AnalyticsPage ---
export function AnalyticsPage() {
  const { currentSubject } = useSubject();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [loading, setLoading] = useState(false);

  const fetchAnalytics = useCallback(async () => {
    if (!currentSubject) return;
    setLoading(true);
    try {
      const res = await api.get<{ success: true; data: AnalyticsData }>(
        `/subjects/${currentSubject.id}/analytics`
      );
      setAnalytics(res.data.data);
      setTrendData(res.data.data.scoreTrend);
    } catch {
      setAnalytics(null);
      setTrendData([]);
    } finally {
      setLoading(false);
    }
  }, [currentSubject]);

  const fetchTrend = useCallback(async (range: TimeRange) => {
    if (!currentSubject) return;
    try {
      const res = await api.get<{ success: true; data: TrendDataPoint[] }>(
        `/subjects/${currentSubject.id}/analytics/trend`,
        { params: { range } }
      );
      setTrendData(res.data.data);
    } catch {
      setTrendData([]);
    }
  }, [currentSubject]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleRangeChange = (range: TimeRange) => {
    setTimeRange(range);
    fetchTrend(range);
  };

  if (!currentSubject) {
    // Show full layout structure with empty state
    return (
      <div style={{ padding: '0' }}>
        <h2 style={{ marginBottom: '28px', fontSize: '24px', fontWeight: 700 }}>学习进度</h2>

        {/* Stats Cards - empty */}
        <StatsCards totalExams={0} averageScoreRate={0} />

        {/* Score Trend Section - empty */}
        <Card style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>得分趋势</h3>
            <TimeRangeFilter value={timeRange} onChange={handleRangeChange} />
          </div>
          <div style={{ padding: '60px', textAlign: 'center', color: '#9CA3AF' }}>
            <p>请先选择一个学科查看数据</p>
          </div>
        </Card>

        {/* Knowledge Mastery Section - empty */}
        <Card>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>知识点掌握分布</h3>
          <div style={{ padding: '60px', textAlign: 'center', color: '#9CA3AF' }}>
            <p>暂无数据</p>
          </div>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: '0' }}>
        <h2 style={{ marginBottom: '28px', fontSize: '24px', fontWeight: 700 }}>学习进度</h2>
        <div role="status" aria-label="加载中" aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <SkeletonCard height={80} />
          <SkeletonCard height={220} />
          <SkeletonCard height={220} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '0' }}>
      <h2 style={{ marginBottom: '28px', fontSize: '24px', fontWeight: 700 }}>学习进度</h2>

      {/* Stats Cards */}
      <StatsCards
        totalExams={analytics?.totalExams ?? 0}
        averageScoreRate={analytics?.averageScoreRate ?? 0}
      />

      {/* Score Trend Section */}
      <Card style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>得分趋势</h3>
          <TimeRangeFilter value={timeRange} onChange={handleRangeChange} />
        </div>
        <ScoreTrendChart data={trendData} />
      </Card>

      {/* Knowledge Mastery Section */}
      <Card>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>知识点掌握分布</h3>
        <KnowledgeMasteryChart data={analytics?.knowledgeMastery ?? []} />
      </Card>
    </div>
  );
}
