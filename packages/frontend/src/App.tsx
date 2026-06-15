import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { SubjectProvider } from './contexts/SubjectContext';
import { DashboardProvider } from './contexts/DashboardContext';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/ui/ToastProvider';
import { ApiErrorBridge } from './components/ApiErrorBridge';
import './App.css';

// Route-level code splitting
const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const SubjectsPage = lazy(() => import('./pages/SubjectsPage').then((m) => ({ default: m.SubjectsPage })));
const SubjectDetailPage = lazy(() => import('./pages/SubjectDetailPage').then((m) => ({ default: m.SubjectDetailPage })));
const MaterialsPage = lazy(() => import('./pages/MaterialsPage').then((m) => ({ default: m.MaterialsPage })));
const QuestionsPage = lazy(() => import('./pages/QuestionsPage').then((m) => ({ default: m.QuestionsPage })));
const ExamPage = lazy(() => import('./pages/ExamPage').then((m) => ({ default: m.ExamPage })));
const ResultPage = lazy(() => import('./pages/ResultPage').then((m) => ({ default: m.ResultPage })));
const ReviewPage = lazy(() => import('./pages/ReviewPage').then((m) => ({ default: m.ReviewPage })));
const WrongQuestionsPage = lazy(() => import('./pages/WrongQuestionsPage').then((m) => ({ default: m.WrongQuestionsPage })));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));

function PageFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: '#9CA3AF' }}>
      <span className="spinner-dot" style={{ width: 10, height: 10, marginRight: 10 }} />
      加载中...
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <ApiErrorBridge />
        <BrowserRouter>
          <SubjectProvider>
            <DashboardProvider>
              <Routes>
                <Route element={<Layout />}>
                  <Route path="/" element={<Navigate to="/home" replace />} />
                  <Route path="/home" element={<Suspense fallback={<PageFallback />}><HomePage /></Suspense>} />
                  <Route path="/subjects" element={<Suspense fallback={<PageFallback />}><SubjectsPage /></Suspense>} />
                  <Route path="/subjects/:subjectId" element={<Suspense fallback={<PageFallback />}><SubjectDetailPage /></Suspense>} />
                  <Route path="/materials" element={<Suspense fallback={<PageFallback />}><MaterialsPage /></Suspense>} />
                  <Route path="/questions" element={<Suspense fallback={<PageFallback />}><QuestionsPage /></Suspense>} />
                  <Route path="/exam" element={<Suspense fallback={<PageFallback />}><ExamPage /></Suspense>} />
                  <Route path="/exam/:sessionId/result" element={<Suspense fallback={<PageFallback />}><ResultPage /></Suspense>} />
                  <Route path="/review" element={<Suspense fallback={<PageFallback />}><ReviewPage /></Suspense>} />
                  <Route path="/wrong-questions" element={<Suspense fallback={<PageFallback />}><WrongQuestionsPage /></Suspense>} />
                  <Route path="/analytics" element={<Suspense fallback={<PageFallback />}><AnalyticsPage /></Suspense>} />
                  <Route path="/settings" element={<Suspense fallback={<PageFallback />}><SettingsPage /></Suspense>} />
                </Route>
              </Routes>
            </DashboardProvider>
          </SubjectProvider>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
