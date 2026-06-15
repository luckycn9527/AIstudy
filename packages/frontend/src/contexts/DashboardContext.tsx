import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { api } from '../services/api';

export interface DashboardOverview {
  totalStudyMinutes: number;
  totalCompletedQuestions: number;
  averageAccuracy: number;
  totalSubjects: number;
}

export interface DashboardSubject {
  id: string;
  name: string;
  totalQuestions: number;
  accuracy: number; // 0-1
}

export interface DashboardMaterial {
  id: string;
  fileName: string;
  fileType: 'pdf' | 'docx';
  uploadedAt: string;
}

export interface DashboardProgressTrend {
  dates: string[];
  bySubject: Array<{
    subjectId: string;
    subjectName: string;
    scores: number[]; // 0-100 per date
  }>;
}

export interface DashboardRadarPoint {
  subjectId: string;
  subjectName: string;
  accuracy: number; // 0-100
}

export interface DashboardRecentExam {
  id: string;
  subjectName: string;
  totalScore: number;
  maxScore: number;
  accuracy: number; // 0-100
  durationMinutes: number;
  submittedAt: string;
}

export interface DashboardRecentReport {
  id: string;
  sessionId: string;
  score: number; // 0-100
  weakPoints: string[];
  strongPoints: string[];
}

export interface DashboardToday {
  todayMinutes: number;
  yesterdayMinutes: number;
  trendPercent: number;
  last7DaysMinutes: number[];
}

export interface DashboardData {
  overview: DashboardOverview;
  subjects: DashboardSubject[];
  recentMaterials: DashboardMaterial[];
  progressTrend: DashboardProgressTrend;
  accuracyByCurrent: DashboardRadarPoint[];
  recentExam: DashboardRecentExam | null;
  recentReport: DashboardRecentReport | null;
  today: DashboardToday;
}

interface DashboardContextValue {
  data: DashboardData | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextValue | undefined>(undefined);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<{ success: true; data: DashboardData }>('/dashboard');
      setData(res.data.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <DashboardContext.Provider value={{ data, loading, refresh }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return ctx;
}
