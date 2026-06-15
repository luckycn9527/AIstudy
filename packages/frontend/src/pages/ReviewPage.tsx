import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, AlarmClock, TrendingDown, Sparkles, CheckCircle2 } from 'lucide-react';
import { useSubject } from '../contexts/SubjectContext';
import { Card, Button, EmptyState, SkeletonList } from '../components/ui';
import { api } from '../services/api';

interface ReviewQuestion {
  id: string;
  type: string;
  stem: string;
  difficulty: number;
  wrongCount?: number;
  masteryLevel?: number;
  cognitiveLevel?: string;
}

interface WeakKnowledge {
  id: string;
  title: string;
  masteryLevel: number;
  learningState: string;
}

interface ReviewData {
  urgentReviews: ReviewQuestion[];
  weakKnowledge: WeakKnowledge[];
  recommendedQuestions: ReviewQuestion[];
  summary: {
    urgentCount: number;
    weakKnowledgeCount: number;
    recommendedCount: number;
    estimatedMinutes: number;
  };
}

const STATE_LABELS: Record<string, { label: string; color: string }> = {
  unknown: { label: '未接触', color: '#9CA3AF' },
  seen: { label: '已见过', color: '#F59E0B' },
  understanding: { label: '理解中', color: '#3B82F6' },
  practicing: { label: '练习中', color: '#8B5CF6' },
  mastered: { label: '已掌握', color: '#10B981' },
  stable: { label: '稳固', color: '#059669' },
  forgetting: { label: '遗忘中', color: '#EF4444' },
  review_required: { label: '需复习', color: '#DC2626' },
};

export function ReviewPage() {
  const { currentSubject } = useSubject();
  const navigate = useNavigate();
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);

  const fetchReview = useCallback(async () => {
    if (!currentSubject) return;
    setLoading(true);
    try {
      const res = await api.get<{ success: true; data: ReviewData }>(
        `/subjects/${currentSubject.id}/review/today`
      );
      setData(res.data.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [currentSubject]);

  useEffect(() => {
    fetchReview();
  }, [fetchReview]);

  // Start review session with urgent + recommended questions
  const handleStartReview = async () => {
    if (!currentSubject || !data) return;
    const questionIds = [
      ...data.urgentReviews.map((q) => q.id),
      ...data.recommendedQuestions.map((q) => q.id),
    ];
    // Deduplicate
    const uniqueIds = [...new Set(questionIds)];
    if (uniqueIds.length === 0) return;

    setStarting(true);
    try {
      const res = await api.post<{ success: true; data: { session: { id: string }; questions: any[] } }>(
        `/subjects/${currentSubject.id}/exams`,
        { questionIds: uniqueIds }
      );
      navigate('/exam', { state: { sessionId: res.data.data.session.id, questions: res.data.data.questions } });
    } catch {
      // ignore
    } finally {
      setStarting(false);
    }
  };

  if (!currentSubject) {
    return (
      <EmptyState
        icon={<CalendarCheck size={48} />}
        title="请先选择一个学科"
        description="选择学科后，AI 会为你安排今日复习计划"
        minHeight={400}
      />
    );
  }

  if (loading) {
    return (
      <div style={{ maxWidth: '900px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>今日学习</h2>
        <p style={{ fontSize: '14px', color: '#9CA3AF', marginBottom: '28px' }}>正在分析你的学习状态...</p>
        <SkeletonList rows={3} rowHeight={80} />
      </div>
    );
  }

  const summary = data?.summary;
  const hasContent = summary && (summary.urgentCount > 0 || summary.recommendedCount > 0);

  return (
    <div style={{ maxWidth: '900px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>今日学习</h2>
      <p style={{ fontSize: '14px', color: '#9CA3AF', marginBottom: '28px' }}>
        AI 根据你的学习状态，为你安排今日最优学习计划
      </p>

      {/* Summary Card */}
      {summary && (
        <div style={{
          marginBottom: '24px',
          padding: '28px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, #6248F1, #8B6CF6)',
          color: '#fff',
          boxShadow: '0 4px 20px rgba(98, 72, 241, 0.3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '14px', opacity: 0.85, marginBottom: '4px' }}>预计学习时间</div>
              <div style={{ fontSize: '36px', fontWeight: 700 }}>{summary.estimatedMinutes} <span style={{ fontSize: '16px', fontWeight: 400 }}>分钟</span></div>
            </div>
            {hasContent && (
              <Button
                onClick={handleStartReview}
                disabled={starting}
                loading={starting}
                style={{
                  backgroundColor: '#fff',
                  color: '#6248F1',
                  padding: '14px 32px',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: 700,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}
              >
                <Sparkles size={16} />
                {starting ? '准备中...' : '开始今日学习'}
              </Button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '32px' }}>
            <div>
              <div style={{ fontSize: '24px', fontWeight: 700 }}>{summary.urgentCount}</div>
              <div style={{ fontSize: '12px', opacity: 0.8 }}>紧急复习</div>
            </div>
            <div>
              <div style={{ fontSize: '24px', fontWeight: 700 }}>{summary.weakKnowledgeCount}</div>
              <div style={{ fontSize: '12px', opacity: 0.8 }}>薄弱知识点</div>
            </div>
            <div>
              <div style={{ fontSize: '24px', fontWeight: 700 }}>{summary.recommendedCount}</div>
              <div style={{ fontSize: '12px', opacity: 0.8 }}>推荐练习</div>
            </div>
          </div>
        </div>
      )}

      {!hasContent && !loading && (
        <Card style={{ padding: 0 }}>
          <EmptyState
            icon={<CheckCircle2 size={48} />}
            title="今日无待复习内容"
            description="完成更多考试后，AI 会自动安排复习计划"
            minHeight={240}
          />
        </Card>
      )}

      {/* Urgent Reviews */}
      {data && data.urgentReviews.length > 0 && (
        <Card style={{ marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600, color: '#EF4444', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlarmClock size={16} />
            紧急复习 ({data.urgentReviews.length} 题)
          </h3>
          <p style={{ fontSize: '12px', color: '#9CA3AF', margin: '0 0 12px 0' }}>
            这些题目即将遗忘，需要立即复习巩固
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {data.urgentReviews.map((q) => (
              <div key={q.id} style={{ padding: '12px 16px', backgroundColor: '#FEF2F2', borderRadius: '10px', border: '1px solid #FECACA' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', color: '#EF4444', fontWeight: 500 }}>错 {q.wrongCount} 次</span>
                  <span style={{ fontSize: '11px', color: '#9CA3AF' }}>掌握度 {q.masteryLevel}%</span>
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: '#1F2937' }}>
                  {q.stem.length > 80 ? q.stem.slice(0, 80) + '...' : q.stem}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Weak Knowledge Points */}
      {data && data.weakKnowledge.length > 0 && (
        <Card style={{ marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600, color: '#F59E0B', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <TrendingDown size={16} />
            薄弱知识点 ({data.weakKnowledge.length})
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {data.weakKnowledge.map((kp) => {
              const stateInfo = STATE_LABELS[kp.learningState] ?? STATE_LABELS.unknown;
              return (
                <div key={kp.id} style={{
                  padding: '10px 16px',
                  backgroundColor: '#FFFBEB',
                  borderRadius: '10px',
                  border: '1px solid #FDE68A',
                }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: '#1F2937', marginBottom: '4px' }}>{kp.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ flex: 1, height: '4px', backgroundColor: '#F3F4F6', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${kp.masteryLevel}%`, backgroundColor: stateInfo.color, borderRadius: '2px' }} />
                    </div>
                    <span style={{ fontSize: '11px', color: stateInfo.color, fontWeight: 500 }}>{stateInfo.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Recommended Questions */}
      {data && data.recommendedQuestions.length > 0 && (
        <Card>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600, color: '#6248F1', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={16} />
            推荐练习 ({data.recommendedQuestions.length} 题)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '300px', overflowY: 'auto' }}>
            {data.recommendedQuestions.map((q) => (
              <div key={q.id} style={{ padding: '10px 14px', backgroundColor: '#FAFBFC', borderRadius: '8px', border: '1px solid #F3F4F6' }}>
                <p style={{ margin: 0, fontSize: '13px', color: '#1F2937' }}>
                  {q.stem.length > 100 ? q.stem.slice(0, 100) + '...' : q.stem}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
