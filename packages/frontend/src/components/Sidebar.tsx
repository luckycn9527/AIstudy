import { NavLink } from 'react-router-dom';
import { useSubject } from '../contexts/SubjectContext';
import { useDashboard } from '../contexts/DashboardContext';
import {
  Home,
  Target,
  BookOpen,
  FolderOpen,
  LayoutList,
  FileX2,
  PenLine,
  TrendingUp,
  Settings,
  LogOut,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/home', icon: Home, label: '首页' },
  { to: '/review', icon: Target, label: '今日学习' },
  { to: '/subjects', icon: BookOpen, label: '我的学科' },
  { to: '/materials', icon: FolderOpen, label: '资料管理' },
  { to: '/questions', icon: LayoutList, label: '题库中心' },
  { to: '/wrong-questions', icon: FileX2, label: '错题本' },
  { to: '/exam', icon: PenLine, label: '考试中心' },
  { to: '/analytics', icon: TrendingUp, label: '学习进度' },
  { to: '/settings', icon: Settings, label: '设置' },
];

function Sparkline({ data }: { data: number[] }) {
  const width = 56;
  const height = 22;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : width;
  const allZero = max === 0;

  const points = data
    .map((v, i) => {
      const x = i * stepX;
      const y = allZero ? height - 1 : height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polygon points={areaPoints} fill="rgba(98, 72, 241, 0.15)" />
      <polyline
        points={points}
        fill="none"
        stroke="#6248F1"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Sidebar() {
  const { currentSubject } = useSubject();
  const { data: dashboard } = useDashboard();

  const today = dashboard?.today;
  const todayMinutes = today?.todayMinutes ?? 0;
  const sparklineData =
    today?.last7DaysMinutes && today.last7DaysMinutes.length > 0
      ? today.last7DaysMinutes
      : [0, 0, 0, 0, 0, 0, 0];
  const trendPercent = today?.trendPercent ?? 0;
  const hasYesterday = (today?.yesterdayMinutes ?? 0) > 0;

  return (
    <aside className="sidebar">
      {/* Logo block */}
      <div className="sidebar-brand">
        <div className="brand-logo">AI</div>
        <div className="brand-text">
          <div className="brand-title">AI 考学平台</div>
          <div className="brand-subtitle">Powered by DeepSeek</div>
        </div>
      </div>

      {/* Current subject indicator */}
      {currentSubject && (
        <div className="current-subject-badge">
          <BookOpen size={14} strokeWidth={2.5} />
          <span className="current-subject-name">{currentSubject.name}</span>
        </div>
      )}

      {/* Navigation */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/home'}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <item.icon size={18} strokeWidth={1.8} className="nav-icon-svg" />
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom area */}
      <div className="sidebar-bottom">
        <div className="study-stat-card">
          <div className="study-stat-row">
            <div className="study-stat-info">
              <div className="study-stat-label">今日学习时长</div>
              <div className="study-stat-value">
                {todayMinutes}<span className="study-stat-unit">分钟</span>
              </div>
            </div>
            <Sparkline data={sparklineData} />
          </div>
          {hasYesterday && (
            <div className="study-stat-trend">
              <span className="trend-up">
                较昨日 {trendPercent >= 0 ? '↑' : '↓'}{Math.abs(trendPercent)}%
              </span>
            </div>
          )}
        </div>

        <div className="profile-card">
          <div className="profile-avatar">学</div>
          <div className="profile-info">
            <div className="profile-name">学习者</div>
            <div className="profile-email">user@example.com</div>
          </div>
        </div>

        <button className="btn-logout">
          <LogOut size={14} />
          <span>退出登录</span>
        </button>
      </div>
    </aside>
  );
}
