import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Legend,
} from 'recharts';
import {
  Upload,
  Brain,
  CheckCircle,
  Bell,
  Settings,
  BookOpen,
  Calculator,
  Code,
  Microscope,
  Globe,
  PenTool,
  ArrowRight,
  MoreHorizontal,
  Plus,
  ChevronDown,
} from 'lucide-react';
import { useDashboard, DashboardData } from '../contexts/DashboardContext';
import './HomePage.css';

// ─── Visual style helpers ───────────────────────────────────────────────────

const SUBJECT_COLORS = ['#6248F1', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6'];
const SUBJECT_ICON_COMPONENTS = [BookOpen, Calculator, Code, Microscope, Globe, PenTool];

function getSubjectStyle(index: number) {
  const color = SUBJECT_COLORS[index % SUBJECT_COLORS.length];
  return {
    color,
    bgColor: `${color}1A`,
    IconComponent: SUBJECT_ICON_COMPONENTS[index % SUBJECT_ICON_COMPONENTS.length],
  };
}

const EMPTY_TEXT_COLOR = '#9CA3AF';

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${mi}`;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function TopBar() {
  return (
    <div className="home-topbar">
      <div>
        <h1 className="greeting">你好，学习者</h1>
        <p className="greeting-sub">今天也要加油学习哦！AI 将助你一臂之力</p>
      </div>
      <div className="topbar-actions">
        <button className="icon-btn" aria-label="通知">
          <Bell size={18} strokeWidth={1.8} />
          <span className="notification-dot" />
        </button>
        <button className="icon-btn" aria-label="设置">
          <Settings size={18} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}

function StepsSection({ recentMaterials }: { recentMaterials: DashboardData['recentMaterials'] }) {
  return (
    <div className="card steps-card">
      <div className="steps-card-inner">
        <div className="steps-left">
          <h2 className="card-heading">从资料到考题，只需三步</h2>
          <p className="card-subheading">AI 智能分析，高效生成个性化考题</p>

          <div className="steps-flow">
            <div className="step">
              <div className="step-icon-wrap">
                <Upload size={24} strokeWidth={1.8} color="#6248F1" />
              </div>
              <div className="step-title">上传资料</div>
              <div className="step-desc">支持 PDF、Word 文档</div>
              <button className="btn-step btn-outline-purple">上传资料</button>
            </div>

            <div className="step-arrow">
              <div className="dotted-line" />
              <span className="arrow-symbol"><ArrowRight size={16} /></span>
            </div>

            <div className="step">
              <div className="step-icon-wrap">
                <Brain size={24} strokeWidth={1.8} color="#6248F1" />
              </div>
              <div className="step-title">AI 分析生成</div>
              <div className="step-desc">DeepSeek 分析资料内容</div>
              <div className="step-progress">
                <div className="step-progress-bar" />
              </div>
            </div>

            <div className="step-arrow">
              <div className="dotted-line" />
              <span className="arrow-symbol"><ArrowRight size={16} /></span>
            </div>

            <div className="step">
              <div className="step-icon-wrap">
                <CheckCircle size={24} strokeWidth={1.8} color="#6248F1" />
              </div>
              <div className="step-title">生成考题</div>
              <div className="step-desc">智能生成考题，开始练习</div>
              <button className="btn-step btn-solid-purple">查看题库</button>
            </div>
          </div>
        </div>

        <div className="steps-divider" />

        <div className="recent-materials">
          <div className="recent-header">
            <span className="recent-title">最近上传的资料</span>
            <a className="link-more" href="#">更多 ›</a>
          </div>
          {recentMaterials.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                color: EMPTY_TEXT_COLOR,
                fontSize: 13,
                padding: '32px 0',
              }}
            >
              暂无资料
            </div>
          ) : (
            <ul className="recent-list">
              {recentMaterials.map((m) => (
                <li key={m.id} className="recent-item">
                  <span
                    className={`file-icon file-icon-${m.fileType}`}
                    aria-hidden
                  >
                    {m.fileType === 'pdf' ? 'PDF' : 'DOC'}
                  </span>
                  <div className="recent-item-text">
                    <div className="recent-item-name">{m.fileName}</div>
                    <div className="recent-item-date">{formatDateTime(m.uploadedAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function SubjectsSection({ subjects }: { subjects: DashboardData['subjects'] }) {
  return (
    <div className="card subjects-card">
      <div className="card-row">
        <h2 className="card-heading">我的学科</h2>
        <a className="link-more" href="#">全部学科 ›</a>
      </div>
      <div className="subjects-grid">
        {subjects.map((s, i) => {
          const style = getSubjectStyle(i);
          const accuracyPercent = Math.round(s.accuracy * 100);
          return (
            <div key={s.id} className="subject-card">
              <button className="subject-menu" aria-label="更多操作"><MoreHorizontal size={16} /></button>
              <div className="subject-icon-wrap" style={{ backgroundColor: style.bgColor }}>
                <style.IconComponent size={22} strokeWidth={1.8} color={style.color} />
              </div>
              <div className="subject-name">{s.name}</div>
              <div className="subject-meta">共 {s.totalQuestions} 题</div>
              <div className="subject-accuracy-row">
                <span>正确率</span>
                <span style={{ color: style.color, fontWeight: 600 }}>{accuracyPercent}%</span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${accuracyPercent}%`, backgroundColor: style.color }}
                />
              </div>
            </div>
          );
        })}
        <div className="subject-card subject-add-card">
          <div className="add-icon"><Plus size={20} /></div>
          <div className="add-text">新建学科</div>
        </div>
      </div>
    </div>
  );
}

function ProgressOverviewCard({
  overview,
  progressTrend,
}: {
  overview: DashboardData['overview'];
  progressTrend: DashboardData['progressTrend'];
}) {
  // Build chart data: each row is a date with one numeric column per subject.
  const chartData = useMemo(() => {
    return progressTrend.dates.map((date, idx) => {
      const row: Record<string, string | number> = { date };
      progressTrend.bySubject.forEach((sub) => {
        row[sub.subjectName] = Math.round(sub.scores[idx] ?? 0);
      });
      return row;
    });
  }, [progressTrend]);

  const hasAnyTrendData = progressTrend.bySubject.some((sub) =>
    sub.scores.some((v) => v > 0),
  );

  const studyHours = (overview.totalStudyMinutes / 60).toFixed(1);
  const accuracyPercent = Math.round(overview.averageAccuracy * 100);

  return (
    <div className="card chart-card">
      <div className="card-row">
        <h2 className="card-heading">学习进度总览</h2>
        <button className="dropdown-btn">
          <span></span>
          <span>本周</span>
          <span className="dropdown-caret"><ChevronDown size={14} /></span>
        </button>
      </div>

      <div className="stat-row">
        <div className="stat-cell">
          <div className="stat-label">学习时长</div>
          <div className="stat-value">{studyHours}<span className="stat-unit">小时</span></div>
        </div>
        <div className="stat-cell">
          <div className="stat-label">完成题数</div>
          <div className="stat-value">{overview.totalCompletedQuestions}<span className="stat-unit">题</span></div>
        </div>
        <div className="stat-cell">
          <div className="stat-label">正确率</div>
          <div className="stat-value">{accuracyPercent}<span className="stat-unit">%</span></div>
        </div>
        <div className="stat-cell">
          <div className="stat-label">学科数</div>
          <div className="stat-value">{overview.totalSubjects}<span className="stat-unit">个</span></div>
        </div>
      </div>

      <div style={{ width: '100%', height: 220, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 12, fill: '#9CA3AF' }}
              axisLine={false}
              tickLine={false}
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: '1px solid #E5E7EB',
                fontSize: 12,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              }}
            />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              wrapperStyle={{ fontSize: 12, paddingTop: 10 }}
            />
            {progressTrend.bySubject.map((sub, i) => (
              <Line
                key={sub.subjectId}
                type="monotone"
                dataKey={sub.subjectName}
                stroke={SUBJECT_COLORS[i % SUBJECT_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        {!hasAnyTrendData && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              color: EMPTY_TEXT_COLOR,
              fontSize: 13,
            }}
          >
            暂无数据
          </div>
        )}
      </div>
    </div>
  );
}

function AccuracyRadarCard({
  accuracyByCurrent,
}: {
  accuracyByCurrent: DashboardData['accuracyByCurrent'];
}) {
  const radarData = accuracyByCurrent.map((item) => ({
    subject: item.subjectName,
    value: Math.round(item.accuracy),
  }));

  const isEmpty = radarData.length === 0 || radarData.every((d) => d.value === 0);

  return (
    <div className="card chart-card">
      <div className="card-row">
        <h2 className="card-heading">正确率趋势</h2>
        <button className="dropdown-btn">
          <span>本月</span>
          <span className="dropdown-caret"><ChevronDown size={14} /></span>
        </button>
      </div>
      <div style={{ width: '100%', height: 320, position: 'relative' }}>
        {radarData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} margin={{ top: 20, right: 30, left: 30, bottom: 20 }}>
              <PolarGrid stroke="#E5E7EB" />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fontSize: 13, fill: '#374151' }}
              />
              <PolarRadiusAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: '#9CA3AF' }}
                axisLine={false}
              />
              <Radar
                name="正确率"
                dataKey="value"
                stroke="#6248F1"
                fill="#6248F1"
                fillOpacity={0.35}
                strokeWidth={2}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #E5E7EB',
                  fontSize: 12,
                }}
                formatter={(value: number) => [`${value}%`, '正确率']}
              />
            </RadarChart>
          </ResponsiveContainer>
        ) : null}
        {isEmpty && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              color: EMPTY_TEXT_COLOR,
              fontSize: 13,
            }}
          >
            暂无数据
          </div>
        )}
      </div>
    </div>
  );
}

function CircularProgress({ value }: { value: number }) {
  const size = 130;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference - (clamped / 100) * circumference;
  return (
    <div className="circular-progress">
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#EDE9FE"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#6248F1"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="circular-progress-text">
        <div className="circular-progress-score">{Math.round(clamped)}<span className="circular-progress-unit">分</span></div>
        <div className="circular-progress-label">综合评价</div>
      </div>
    </div>
  );
}

function RecentExamCard({ recentExam }: { recentExam: DashboardData['recentExam'] }) {
  const navigate = useNavigate();
  return (
    <div className="card">
      <div className="card-row">
        <h2 className="card-heading">最近一次考试</h2>
        <a className="link-more" href="#">查看全部 ›</a>
      </div>
      {recentExam ? (
        <div className="exam-info-card">
          <div className="exam-info-header">
            <div className="exam-info-icon"><CheckCircle size={20} strokeWidth={2} color="#6248F1" /></div>
            <div className="exam-info-title-wrap">
              <div className="exam-info-title">{recentExam.subjectName}</div>
              <span className="badge-completed">已完成</span>
            </div>
          </div>
          <div className="exam-info-time">考试时间：{formatDateTime(recentExam.submittedAt)}</div>
          <div className="exam-stats-row">
            <div className="exam-stat">
              <div className="exam-stat-value" style={{ color: '#6248F1' }}>
                {Math.round(recentExam.totalScore)}<span className="exam-stat-unit">分</span>
              </div>
              <div className="exam-stat-label">得分</div>
            </div>
            <div className="exam-stat-divider" />
            <div className="exam-stat">
              <div className="exam-stat-value" style={{ color: '#10B981' }}>
                {Math.round(recentExam.accuracy)}<span className="exam-stat-unit">%</span>
              </div>
              <div className="exam-stat-label">正确率</div>
            </div>
            <div className="exam-stat-divider" />
            <div className="exam-stat">
              <div className="exam-stat-value" style={{ color: '#F59E0B' }}>
                {recentExam.durationMinutes}<span className="exam-stat-unit">分钟</span>
              </div>
              <div className="exam-stat-label">用时</div>
            </div>
          </div>
          <div className="exam-actions">
            <button className="btn-solid-purple btn-step" onClick={() => navigate(`/exam/${recentExam.id}/result`)}>查看试卷</button>
            <button className="btn-outline-purple btn-step" onClick={() => navigate(`/exam/${recentExam.id}/result`)}>AI 分析报告</button>
          </div>
        </div>
      ) : (
        <div
          className="exam-info-card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 220,
            color: EMPTY_TEXT_COLOR,
          }}
        >
          <div style={{ opacity: 0.4, marginBottom: 8 }} aria-hidden>
            <PenTool size={36} strokeWidth={1.5} />
          </div>
          <div style={{ fontSize: 14 }}>暂无考试记录</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>完成一次考试后会显示在这里</div>
        </div>
      )}
    </div>
  );
}

function AiAnalysisCard({ recentReport }: { recentReport: DashboardData['recentReport'] }) {
  return (
    <div className="card">
      <div className="card-row">
        <h2 className="card-heading">AI 考后分析</h2>
        <a className="link-more" href="#">查看详情 ›</a>
      </div>
      {recentReport ? (
        <div className="ai-analysis-body">
          <CircularProgress value={recentReport.score} />
          <div className="ai-analysis-text">
            <div className="ai-analysis-heading">
              {recentReport.score >= 80 ? '表现良好！' : recentReport.score >= 60 ? '继续努力！' : '加油哦！'}
            </div>
            <p className="ai-analysis-desc">
              你在本次考试中的综合表现已生成详细分析，可查看下方知识点掌握情况。
            </p>
            <ul className="ai-analysis-list">
              <li>
                <span className="bullet-good">●</span>
                <span>
                  <strong>优势知识点：</strong>
                  {recentReport.strongPoints.length > 0 ? recentReport.strongPoints.join('、') : '暂无'}
                </span>
              </li>
              <li>
                <span className="bullet-warn">●</span>
                <span>
                  <strong>待提升知识点：</strong>
                  {recentReport.weakPoints.length > 0 ? recentReport.weakPoints.join('、') : '暂无'}
                </span>
              </li>
            </ul>
            <button className="btn-solid-purple btn-step">查看提升建议</button>
          </div>
        </div>
      ) : (
        <div
          className="ai-analysis-body"
          style={{
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 200,
            color: EMPTY_TEXT_COLOR,
            textAlign: 'center',
            gap: 8,
          }}
        >
          <div style={{ opacity: 0.4 }} aria-hidden><Brain size={36} strokeWidth={1.5} /></div>
          <div style={{ fontSize: 14 }}>完成考试后查看 AI 分析</div>
          <div style={{ fontSize: 12 }}>提交并评分后，这里会展示薄弱点和建议</div>
        </div>
      )}
    </div>
  );
}

// ─── Empty fallbacks ────────────────────────────────────────────────────────

const EMPTY_DATA: DashboardData = {
  overview: {
    totalStudyMinutes: 0,
    totalCompletedQuestions: 0,
    averageAccuracy: 0,
    totalSubjects: 0,
  },
  subjects: [],
  recentMaterials: [],
  progressTrend: { dates: [], bySubject: [] },
  accuracyByCurrent: [],
  recentExam: null,
  recentReport: null,
  today: {
    todayMinutes: 0,
    yesterdayMinutes: 0,
    trendPercent: 0,
    last7DaysMinutes: [0, 0, 0, 0, 0, 0, 0],
  },
};

// ─── Main page ──────────────────────────────────────────────────────────────

export function HomePage() {
  const { data } = useDashboard();
  const d = data ?? EMPTY_DATA;

  return (
    <div className="home-page">
      <TopBar />

      <StepsSection recentMaterials={d.recentMaterials} />

      <SubjectsSection subjects={d.subjects} />

      <div className="two-col-row">
        <ProgressOverviewCard overview={d.overview} progressTrend={d.progressTrend} />
        <AccuracyRadarCard accuracyByCurrent={d.accuracyByCurrent} />
      </div>

      <div className="two-col-row">
        <RecentExamCard recentExam={d.recentExam} />
        <AiAnalysisCard recentReport={d.recentReport} />
      </div>

      <footer className="home-footer">
        © 2024 AI 考学平台 | Powered by DeepSeek | 让学习更智能，让考试更高效
      </footer>
    </div>
  );
}
