import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Sparkles, ChevronUp, ChevronDown, AlertTriangle, Target, Lightbulb } from 'lucide-react';
import { useToast } from '../components/ui/ToastProvider';
import { Card, Badge, Button, SkeletonList } from '../components/ui';
import { api } from '../services/api';

// Types

interface Question {
  id: string;
  type: string;
  stem: string;
  options?: string;
  correctAnswer: string;
  explanation: string;
}

interface ExamAnswer {
  id: string;
  questionId: string;
  userAnswer: string | null;
  score: number | null;
  maxScore: number;
  scoringReason: string | null;
  status: 'answered' | 'scored' | 'pending_score';
}

interface ExamSession {
  id: string;
  totalScore: number | null;
  maxScore: number | null;
  status: string;
  submittedAt: string | null;
}

interface ExamResult {
  session: ExamSession;
  questions: Question[];
  answers: ExamAnswer[];
}

interface ErrorAnalysisItem {
  questionId: string;
  reason: string;
}

interface AnalysisReport {
  id: string;
  weakPoints: string[];
  errorAnalysis: ErrorAnalysisItem[];
  suggestions: string[];
  createdAt: string;
}

// Helpers

function getQuestionTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    single_choice: '单选题',
    multiple_choice: '多选题',
    true_false: '判断题',
    fill_blank: '填空题',
    short_answer: '简答题',
  };
  return labels[type] || type;
}

function getScoreColor(answer: ExamAnswer): string {
  if (answer.status === 'pending_score') return '#F59E0B';
  if (answer.score === null) return '#9CA3AF';
  if (answer.score >= answer.maxScore) return '#3A9B53';
  if (answer.score > 0) return '#F59E0B';
  return '#EF4444';
}

function getScoreBadge(answer: ExamAnswer) {
  if (answer.status === 'pending_score') {
    return <Badge variant="warning">待评分</Badge>;
  }

  if (answer.score === null) return null;

  const isCorrect = answer.score >= answer.maxScore;
  return <Badge variant={isCorrect ? 'success' : 'danger'}>{isCorrect ? '正确' : '错误'}</Badge>;
}

function parseOptions(optionsJson: string | undefined): string[] {
  if (!optionsJson) return [];
  try {
    return JSON.parse(optionsJson);
  } catch {
    return [];
  }
}

export function ResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const toast = useToast();
  const [result, setResult] = useState<ExamResult | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [questionsExpanded, setQuestionsExpanded] = useState(true);

  const fetchResult = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get<{ success: true; data: ExamResult }>(
        `/exams/${sessionId}/result`
      );
      setResult(res.data.data);
    } catch (err: any) {
      const message = err?.response?.data?.error?.message || '加载判分结果失败';
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const fetchReport = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await api.get<{ success: true; data: AnalysisReport }>(
        `/exams/${sessionId}/report`
      );
      setReport(res.data.data);
    } catch {
      // Report may not exist yet - that's fine
      setReport(null);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchResult();
    fetchReport();
  }, [fetchResult, fetchReport]);

  const handleAnalyze = async () => {
    if (!sessionId) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      await api.post(`/exams/${sessionId}/analyze`);
      await fetchReport();
      toast.success('AI 分析报告已生成');
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message || '分析报告生成失败';
      setAnalyzeError(message);
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '0', maxWidth: '900px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '28px' }}>判分结果</h2>
        <SkeletonList rows={4} rowHeight={80} />
      </div>
    );
  }

  if (loadError || !result) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#991B1B' }}>
        <p>{loadError || '无法加载判分结果'}</p>
      </div>
    );
  }

  const { session, questions, answers } = result;
  const totalScore = session.totalScore ?? 0;
  const maxScore = session.maxScore ?? 0;
  const scorePercentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const hasPendingScores = answers.some((a) => a.status === 'pending_score');

  return (
    <div style={{ padding: '0', maxWidth: '900px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>判分结果</h2>
        <Button onClick={handleAnalyze} disabled={analyzing} loading={analyzing}>
          <Sparkles size={15} />
          {analyzing ? '分析中...' : report ? '重新分析' : 'AI 分析报告'}
        </Button>
      </div>

      {/* Score Summary - Gradient Card */}
      <div
        style={{
          marginBottom: '24px',
          padding: '32px',
          borderRadius: '14px',
          background: 'linear-gradient(135deg, #6248F1, #8B6CF6)',
          textAlign: 'center',
          color: '#fff',
          boxShadow: '0 4px 14px rgba(98, 72, 241, 0.25)',
        }}
      >
        <div style={{ fontSize: '48px', fontWeight: 700, marginBottom: '8px' }}>
          {totalScore} / {maxScore}
        </div>
        <div style={{ fontSize: '16px', opacity: 0.85 }}>
          得分率: {scorePercentage}%
        </div>
        {hasPendingScores && (
          <div
            style={{
              marginTop: '14px',
              fontSize: '13px',
              backgroundColor: 'rgba(255,255,255,0.2)',
              display: 'inline-block',
              padding: '6px 16px',
              borderRadius: '20px',
            }}
          >
            部分主观题尚未评分，总分可能会更新
          </div>
        )}
      </div>

      {/* Per-Question Results */}
      <Card style={{ marginBottom: '24px' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: questionsExpanded ? '16px' : '0', cursor: 'pointer' }}
          onClick={() => setQuestionsExpanded(!questionsExpanded)}
        >
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>各题详情 ({questions.length} 题)</h3>
          <span style={{ fontSize: '13px', color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {questionsExpanded ? <>收起 <ChevronUp size={15} /></> : <>展开 <ChevronDown size={15} /></>}
          </span>
        </div>
        {questionsExpanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {questions.map((question, index) => {
            const answer = answers.find((a) => a.questionId === question.id);
            if (!answer) return null;

            const options = parseOptions(question.options);
            const scoreColor = getScoreColor(answer);

            return (
              <div
                key={question.id}
                style={{
                  border: '1px solid #E5E7EB',
                  borderRadius: '12px',
                  padding: '18px 20px',
                  backgroundColor: '#FAFBFC',
                  borderLeft: `4px solid ${scoreColor}`,
                }}
              >
                {/* Question Header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 600, fontSize: '14px', color: '#1F2937' }}>
                      第 {index + 1} 题
                    </span>
                    <Badge variant="primary">{getQuestionTypeLabel(question.type)}</Badge>
                    {getScoreBadge(answer)}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: scoreColor }}>
                    {answer.status === 'pending_score'
                      ? '待评分'
                      : `${answer.score ?? 0} / ${answer.maxScore}`}
                  </div>
                </div>

                {/* Question Stem */}
                <div style={{ fontSize: '14px', marginBottom: '12px', lineHeight: 1.7, color: '#1F2937' }}>
                  {question.stem}
                </div>

                {/* Options (for choice questions) */}
                {options.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    {options.map((opt, i) => {
                      const optionLabel = String.fromCharCode(65 + i);
                      const optText = opt.replace(/^[A-Za-z][.．、]\s*/, '');
                      return (
                        <div
                          key={i}
                          style={{
                            fontSize: '13px',
                            padding: '4px 0',
                            color: '#6B7280',
                          }}
                        >
                          {optionLabel}. {optText}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* User Answer & Correct Answer */}
                <div
                  style={{
                    fontSize: '13px',
                    padding: '12px 14px',
                    backgroundColor: '#fff',
                    borderRadius: '8px',
                    border: '1px solid #E5E7EB',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div>
                    <span style={{ color: '#9CA3AF' }}>你的答案: </span>
                    <span style={{ color: '#1F2937', fontWeight: 500 }}>
                      {answer.userAnswer || '（未作答）'}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#9CA3AF' }}>正确答案: </span>
                    <span style={{ color: '#3A9B53', fontWeight: 500 }}>
                      {question.correctAnswer}
                    </span>
                  </div>
                  {answer.scoringReason && (
                    <div>
                      <span style={{ color: '#9CA3AF' }}>评分理由: </span>
                      <span style={{ color: '#6B7280' }}>{answer.scoringReason}</span>
                    </div>
                  )}
                </div>

                {/* Explanation */}
                {question.explanation && (
                  <div
                    style={{
                      marginTop: '12px',
                      fontSize: '13px',
                      color: '#6B7280',
                      padding: '12px 14px',
                      backgroundColor: '#F0FDF4',
                      borderRadius: '8px',
                      border: '1px solid #BBF7D0',
                    }}
                  >
                    <span style={{ fontWeight: 500, color: '#166534' }}>解析: </span>
                    {question.explanation}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}
      </Card>

      {/* Analysis Report Section */}
      <Card>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>考后分析报告</h3>
        </div>

        {/* Analysis Error */}
        {analyzeError && (
          <div
            style={{
              marginBottom: '16px',
              padding: '12px 16px',
              backgroundColor: '#FEE2E2',
              color: '#991B1B',
              borderRadius: '8px',
              fontSize: '13px',
              border: '1px solid #FECACA',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{analyzeError}</span>
            <Button variant="danger" size="sm" onClick={handleAnalyze} disabled={analyzing}>
              重试
            </Button>
          </div>
        )}

        {/* Analysis Loading */}
        {analyzing && (
          <div style={{ textAlign: 'center', padding: '24px', color: '#9CA3AF' }}>
            <span className="spinner-dot" style={{ marginRight: 8 }} />
            正在生成分析报告，请稍候...
          </div>
        )}

        {/* Analysis Report Content */}
        {report && !analyzing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Weak Points */}
            <div
              style={{
                padding: '18px 20px',
                borderRadius: '12px',
                backgroundColor: '#FFFBEB',
                border: '1px solid #FDE68A',
              }}
            >
              <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#92400E', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangle size={15} />
                薄弱知识点
              </h4>
              {report.weakPoints.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  {report.weakPoints.map((point, i) => (
                    <li key={i} style={{ fontSize: '13px', marginBottom: '4px', color: '#6B7280' }}>
                      {point}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ margin: 0, fontSize: '13px', color: '#9CA3AF' }}>暂无薄弱知识点</p>
              )}
            </div>

            {/* Error Analysis */}
            <div
              style={{
                padding: '18px 20px',
                borderRadius: '12px',
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
              }}
            >
              <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#991B1B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Target size={15} />
                错题分析
              </h4>
              {report.errorAnalysis.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {report.errorAnalysis.map((item, i) => {
                    const questionIndex = questions.findIndex(
                      (q) => q.id === item.questionId
                    );
                    return (
                      <div
                        key={i}
                        style={{
                          fontSize: '13px',
                          padding: '10px 14px',
                          backgroundColor: '#fff',
                          borderRadius: '8px',
                          border: '1px solid #FECACA',
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>
                          第 {questionIndex >= 0 ? questionIndex + 1 : '?'} 题:
                        </span>{' '}
                        {item.reason}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '13px', color: '#9CA3AF' }}>暂无错题分析</p>
              )}
            </div>

            {/* Suggestions */}
            <div
              style={{
                padding: '18px 20px',
                borderRadius: '12px',
                backgroundColor: '#F0FDF4',
                border: '1px solid #BBF7D0',
              }}
            >
              <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#166534', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lightbulb size={15} />
                提升建议
              </h4>
              {report.suggestions.length > 0 ? (
                <ol style={{ margin: 0, paddingLeft: '20px' }}>
                  {report.suggestions.map((suggestion, i) => (
                    <li key={i} style={{ fontSize: '13px', marginBottom: '4px', color: '#6B7280' }}>
                      {suggestion}
                    </li>
                  ))}
                </ol>
              ) : (
                <p style={{ margin: 0, fontSize: '13px', color: '#9CA3AF' }}>暂无提升建议</p>
              )}
            </div>
          </div>
        )}

        {/* No Report Yet */}
        {!report && !analyzing && !analyzeError && (
          <div
            style={{
              textAlign: 'center',
              padding: '28px',
              color: '#9CA3AF',
              backgroundColor: '#FAFBFC',
              borderRadius: '12px',
              border: '1px solid #E5E7EB',
            }}
          >
            <p style={{ margin: 0 }}>尚未生成分析报告，点击上方按钮生成</p>
          </div>
        )}
      </Card>
    </div>
  );
}
