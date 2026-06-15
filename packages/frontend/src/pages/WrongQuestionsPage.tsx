import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookX, FolderOpen, Dumbbell } from 'lucide-react';
import { useSubject } from '../contexts/SubjectContext';
import { Card, Badge, Button, EmptyState, SkeletonList } from '../components/ui';
import { api } from '../services/api';

interface WrongQuestion {
  id: string;
  questionId: string;
  wrongCount: number;
  masteryLevel: number;
  consecutiveCorrect: number;
  nextReviewAt: string;
  firstWrongAt: string;
  lastWrongAt: string;
  status: 'new' | 'reviewing' | 'mastered';
  question: {
    id: string;
    type: string;
    stem: string;
    options: string[] | null;
    correctAnswer: string;
    explanation: string;
    difficulty: number;
  } | null;
}

interface WrongStats {
  total: number;
  new: number;
  reviewing: number;
  mastered: number;
  avgMastery: number;
  needReviewNow: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; variant: 'danger' | 'warning' | 'success' }> = {
  new: { label: '新错题', color: '#EF4444', bg: '#FEE2E2', variant: 'danger' },
  reviewing: { label: '复习中', color: '#F59E0B', bg: '#FEF3C7', variant: 'warning' },
  mastered: { label: '已掌握', color: '#10B981', bg: '#D1FAE5', variant: 'success' },
};

const TYPE_LABELS: Record<string, string> = {
  single_choice: '单选',
  multiple_choice: '多选',
  true_false: '判断',
  fill_blank: '填空',
  short_answer: '简答',
};

export function WrongQuestionsPage() {
  const { currentSubject } = useSubject();
  const navigate = useNavigate();
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([]);
  const [stats, setStats] = useState<WrongStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!currentSubject) return;
    setLoading(true);
    try {
      const params = filter ? `?status=${filter}` : '';
      const [questionsRes, statsRes] = await Promise.all([
        api.get<{ success: true; data: WrongQuestion[] }>(`/subjects/${currentSubject.id}/wrong-questions${params}`),
        api.get<{ success: true; data: WrongStats }>(`/subjects/${currentSubject.id}/wrong-questions/stats`),
      ]);
      setWrongQuestions(questionsRes.data.data);
      setStats(statsRes.data.data);
    } catch {
      setWrongQuestions([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [currentSubject, filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Start practice with wrong questions that need review
  const handlePractice = async () => {
    if (!currentSubject) return;
    const reviewable = wrongQuestions.filter((wq) => wq.status !== 'mastered' && wq.question);
    if (reviewable.length === 0) return;

    const questionIds = reviewable.map((wq) => wq.questionId);
    try {
      const res = await api.post<{ success: true; data: { session: { id: string }; questions: any[] } }>(
        `/subjects/${currentSubject.id}/exams`,
        { questionIds }
      );
      navigate('/exam', { state: { sessionId: res.data.data.session.id, questions: res.data.data.questions } });
    } catch { /* ignore */ }
  };

  if (!currentSubject) {
    return (
      <EmptyState
        icon={<BookX size={48} />}
        title="请先选择一个学科"
        description="选择学科后即可查看该学科的错题本"
        minHeight={400}
      />
    );
  }

  return (
    <div style={{ maxWidth: '900px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>错题本</h2>
      <p style={{ fontSize: '14px', color: '#9CA3AF', marginBottom: '24px' }}>
        答错的题目自动收集，间隔重复帮你巩固薄弱点
      </p>

      {/* Stats Cards */}
      {stats && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '120px', padding: '16px', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #E5E7EB', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#1F2937' }}>{stats.total}</div>
            <div style={{ fontSize: '12px', color: '#9CA3AF' }}>总错题</div>
          </div>
          <div style={{ flex: 1, minWidth: '120px', padding: '16px', backgroundColor: '#FEE2E2', borderRadius: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#EF4444' }}>{stats.needReviewNow}</div>
            <div style={{ fontSize: '12px', color: '#991B1B' }}>待复习</div>
          </div>
          <div style={{ flex: 1, minWidth: '120px', padding: '16px', backgroundColor: '#FEF3C7', borderRadius: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#F59E0B' }}>{stats.reviewing}</div>
            <div style={{ fontSize: '12px', color: '#92400E' }}>复习中</div>
          </div>
          <div style={{ flex: 1, minWidth: '120px', padding: '16px', backgroundColor: '#D1FAE5', borderRadius: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#10B981' }}>{stats.mastered}</div>
            <div style={{ fontSize: '12px', color: '#065F46' }}>已掌握</div>
          </div>
          <div style={{ flex: 1, minWidth: '120px', padding: '16px', backgroundColor: '#EDE9FE', borderRadius: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#6248F1' }}>{stats.avgMastery}%</div>
            <div style={{ fontSize: '12px', color: '#6248F1' }}>平均掌握</div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {[
            { value: '', label: '全部' },
            { value: 'new', label: '新错题' },
            { value: 'reviewing', label: '复习中' },
            { value: 'mastered', label: '已掌握' },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              style={{
                padding: '6px 14px',
                fontSize: '13px',
                border: 'none',
                borderRadius: '20px',
                backgroundColor: filter === opt.value ? '#6248F1' : '#F3F4F6',
                color: filter === opt.value ? '#fff' : '#6B7280',
                cursor: 'pointer',
                fontWeight: filter === opt.value ? 600 : 400,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {wrongQuestions.filter((wq) => wq.status !== 'mastered').length > 0 && (
          <Button variant="warning" onClick={handlePractice}>
            <Dumbbell size={15} />
            练习错题 ({wrongQuestions.filter((wq) => wq.status !== 'mastered').length} 题)
          </Button>
        )}
      </div>

      {/* Wrong Questions List */}
      {loading ? (
        <SkeletonList rows={4} />
      ) : wrongQuestions.length === 0 ? (
        <Card style={{ padding: 0 }}>
          <EmptyState
            icon={<FolderOpen size={48} />}
            title={filter ? '该分类下暂无错题' : '还没有错题'}
            description="完成考试后，答错的题目会自动出现在这里"
            minHeight={240}
          />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {wrongQuestions.map((wq) => {
            const statusCfg = STATUS_CONFIG[wq.status] ?? STATUS_CONFIG.new;
            const isExpanded = expandedId === wq.id;

            return (
              <div
                key={wq.id}
                style={{
                  padding: '16px 20px',
                  backgroundColor: '#fff',
                  borderRadius: '12px',
                  border: '1px solid #E5E7EB',
                  borderLeft: `4px solid ${statusCfg.color}`,
                  cursor: 'pointer',
                }}
                onClick={() => setExpandedId(isExpanded ? null : wq.id)}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                    {wq.question && (
                      <Badge variant="primary">{TYPE_LABELS[wq.question.type] || wq.question.type}</Badge>
                    )}
                    <span style={{ fontSize: '11px', color: '#9CA3AF' }}>错 {wq.wrongCount} 次</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* Mastery bar */}
                    <div style={{ width: '60px', height: '6px', backgroundColor: '#F3F4F6', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${wq.masteryLevel}%`, backgroundColor: statusCfg.color, borderRadius: '3px' }} />
                    </div>
                    <span style={{ fontSize: '11px', color: '#9CA3AF' }}>{wq.masteryLevel}%</span>
                  </div>
                </div>

                {/* Question stem */}
                {wq.question && (
                  <p style={{ margin: 0, fontSize: '14px', color: '#1F2937', lineHeight: 1.5 }}>
                    {isExpanded ? wq.question.stem : (wq.question.stem.length > 100 ? wq.question.stem.slice(0, 100) + '...' : wq.question.stem)}
                  </p>
                )}

                {/* Expanded details */}
                {isExpanded && wq.question && (
                  <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#F9FAFB', borderRadius: '8px' }}>
                    {wq.question.options && (
                      <div style={{ marginBottom: '10px' }}>
                        {wq.question.options.map((opt, i) => (
                          <div key={i} style={{ fontSize: '13px', color: '#6B7280', padding: '2px 0' }}>
                            {String.fromCharCode(65 + i)}. {opt}
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: '13px', marginBottom: '6px' }}>
                      <span style={{ color: '#10B981', fontWeight: 500 }}>正确答案: </span>
                      <span style={{ color: '#1F2937' }}>{wq.question.correctAnswer}</span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#6B7280', padding: '8px 10px', backgroundColor: '#F0FDF4', borderRadius: '6px', border: '1px solid #BBF7D0' }}>
                      <span style={{ fontWeight: 500, color: '#166534' }}>解析: </span>
                      {wq.question.explanation}
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '11px', color: '#9CA3AF' }}>
                      首次错误: {new Date(wq.firstWrongAt).toLocaleDateString('zh-CN')} · 
                      连续正确: {wq.consecutiveCorrect} 次 · 
                      下次复习: {new Date(wq.nextReviewAt).toLocaleDateString('zh-CN')}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
