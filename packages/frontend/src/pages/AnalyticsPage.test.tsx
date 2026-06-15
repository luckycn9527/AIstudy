import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyticsPage } from './AnalyticsPage';

// Mock recharts to avoid rendering issues in jsdom
vi.mock('recharts', () => ({
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  RadarChart: ({ children }: any) => <div data-testid="radar-chart">{children}</div>,
  Radar: () => <div />,
  PolarGrid: () => <div />,
  PolarAngleAxis: () => <div />,
  PolarRadiusAxis: () => <div />,
}));

// Mock the SubjectContext
const mockUseSubject = vi.fn();
vi.mock('../contexts/SubjectContext', () => ({
  useSubject: () => mockUseSubject(),
}));

// Mock the api module
const mockApi = {
  get: vi.fn(),
};
vi.mock('../services/api', () => ({
  api: {
    get: (...args: any[]) => mockApi.get(...args),
  },
}));

const mockAnalyticsData = {
  subjectId: 'sub1',
  totalExams: 5,
  averageScoreRate: 0.78,
  knowledgeMastery: [
    { knowledgePointId: 'kp1', title: '微积分', masteryRate: 0.85 },
    { knowledgePointId: 'kp2', title: '线性代数', masteryRate: 0.6 },
  ],
  scoreTrend: [
    { date: '2024-06-01T10:00:00Z', scoreRate: 0.7 },
    { date: '2024-06-05T10:00:00Z', scoreRate: 0.85 },
  ],
};

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows message to select subject when no subject is selected', () => {
    mockUseSubject.mockReturnValue({ currentSubject: null });
    render(<AnalyticsPage />);
    expect(screen.getByText('请先选择一个学科查看数据')).toBeInTheDocument();
  });

  it('renders stats cards with analytics data', async () => {
    mockUseSubject.mockReturnValue({
      currentSubject: { id: 'sub1', name: '数学', createdAt: '2024-01-01' },
    });
    mockApi.get.mockResolvedValue({ data: { success: true, data: mockAnalyticsData } });

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
    });
    expect(screen.getByText('78.0%')).toBeInTheDocument();
    expect(screen.getByText('已完成考试（次）')).toBeInTheDocument();
    expect(screen.getByText('平均得分率')).toBeInTheDocument();
  });

  it('renders score trend chart section', async () => {
    mockUseSubject.mockReturnValue({
      currentSubject: { id: 'sub1', name: '数学', createdAt: '2024-01-01' },
    });
    mockApi.get.mockResolvedValue({ data: { success: true, data: mockAnalyticsData } });

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('得分趋势')).toBeInTheDocument();
    });
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  it('renders knowledge mastery chart section', async () => {
    mockUseSubject.mockReturnValue({
      currentSubject: { id: 'sub1', name: '数学', createdAt: '2024-01-01' },
    });
    mockApi.get.mockResolvedValue({ data: { success: true, data: mockAnalyticsData } });

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('知识点掌握分布')).toBeInTheDocument();
    });
    expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
  });

  it('renders time range filter buttons', async () => {
    mockUseSubject.mockReturnValue({
      currentSubject: { id: 'sub1', name: '数学', createdAt: '2024-01-01' },
    });
    mockApi.get.mockResolvedValue({ data: { success: true, data: mockAnalyticsData } });

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('7天')).toBeInTheDocument();
    });
    expect(screen.getByText('30天')).toBeInTheDocument();
    expect(screen.getByText('全部')).toBeInTheDocument();
  });

  it('fetches trend data when time range changes', async () => {
    mockUseSubject.mockReturnValue({
      currentSubject: { id: 'sub1', name: '数学', createdAt: '2024-01-01' },
    });
    mockApi.get.mockResolvedValue({ data: { success: true, data: mockAnalyticsData } });

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('7天')).toBeInTheDocument();
    });

    // Click 7天 button
    mockApi.get.mockResolvedValue({
      data: { success: true, data: [{ date: '2024-06-05T10:00:00Z', scoreRate: 0.85 }] },
    });
    fireEvent.click(screen.getByText('7天'));

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith(
        '/subjects/sub1/analytics/trend',
        { params: { range: '7d' } }
      );
    });
  });

  it('shows "暂无数据" when no trend data', async () => {
    mockUseSubject.mockReturnValue({
      currentSubject: { id: 'sub1', name: '数学', createdAt: '2024-01-01' },
    });
    mockApi.get.mockResolvedValue({
      data: {
        success: true,
        data: { ...mockAnalyticsData, scoreTrend: [], knowledgeMastery: [] },
      },
    });

    render(<AnalyticsPage />);

    await waitFor(() => {
      const noDataElements = screen.getAllByText('暂无数据');
      expect(noDataElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows loading state initially', () => {
    mockUseSubject.mockReturnValue({
      currentSubject: { id: 'sub1', name: '数学', createdAt: '2024-01-01' },
    });
    mockApi.get.mockReturnValue(new Promise(() => {})); // Never resolves

    render(<AnalyticsPage />);
    expect(screen.getByRole('status', { name: '加载中' })).toBeInTheDocument();
  });
});
