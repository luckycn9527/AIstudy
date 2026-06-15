import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PenLine } from 'lucide-react';
import { useSubject } from '../contexts/SubjectContext';
import { Card, Badge, Button, EmptyState, SkeletonList } from '../components/ui';
import { api } from '../services/api';

type QuestionType = 'single_choice' | 'multiple_choice' | 'true_false' | 'fill_blank' | 'short_answer';

interface Question {
  id: string;
  subjectId: string;
  type: QuestionType;
  stem: string;
  options: string[] | null;
  correctAnswer: string;
  explanation: string;
  createdAt: string;
}

const TYPE_LABELS: Record<QuestionType, string> = {
  single_choice: '单选题',
  multiple_choice: '多选题',
  true_false: '判断题',
  fill_blank: '填空题',
  short_answer: '简答题',
};

// ─── Question Components ────────────────────────────────────────────────────

/** Strip leading letter prefix like "A." or "A. " from option text */
function stripOptionPrefix(option: string): string {
  return option.replace(/^[A-Za-z][.．、]\s*/, '');
}

interface QuestionComponentProps {
  question: Question;
  answer: string;
  onAnswerChange: (answer: string) => void;
}

function SingleChoiceQuestion({ question, answer, onAnswerChange }: QuestionComponentProps) {
  const options = question.options || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {options.map((option, index) => {
        const optionLabel = String.fromCharCode(65 + index);
        return (
          <label
            key={index}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              border: answer === optionLabel ? '2px solid #6248F1' : '1px solid #E5E7EB',
              borderRadius: '10px',
              cursor: 'pointer',
              backgroundColor: answer === optionLabel ? '#EDE9FE' : '#fff',
              transition: 'all 0.15s',
            }}
          >
            <input
              type="radio"
              name={`question-${question.id}`}
              value={optionLabel}
              checked={answer === optionLabel}
              onChange={() => onAnswerChange(optionLabel)}
              style={{ accentColor: '#6248F1' }}
            />
            <span style={{ fontSize: '14px', color: '#1F2937' }}>{optionLabel}. {stripOptionPrefix(option)}</span>
          </label>
        );
      })}
    </div>
  );
}

function MultipleChoiceQuestion({ question, answer, onAnswerChange }: QuestionComponentProps) {
  const options = question.options || [];
  const selectedSet = new Set(answer ? answer.split(',') : []);

  const handleToggle = (optionLabel: string) => {
    const newSet = new Set(selectedSet);
    if (newSet.has(optionLabel)) {
      newSet.delete(optionLabel);
    } else {
      newSet.add(optionLabel);
    }
    const sorted = Array.from(newSet).sort();
    onAnswerChange(sorted.join(','));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <p style={{ fontSize: '13px', color: '#9CA3AF', marginBottom: '4px' }}>（可多选）</p>
      {options.map((option, index) => {
        const optionLabel = String.fromCharCode(65 + index);
        const isSelected = selectedSet.has(optionLabel);
        return (
          <label
            key={index}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              border: isSelected ? '2px solid #6248F1' : '1px solid #E5E7EB',
              borderRadius: '10px',
              cursor: 'pointer',
              backgroundColor: isSelected ? '#EDE9FE' : '#fff',
              transition: 'all 0.15s',
            }}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => handleToggle(optionLabel)}
              style={{ accentColor: '#6248F1' }}
            />
            <span style={{ fontSize: '14px', color: '#1F2937' }}>{optionLabel}. {stripOptionPrefix(option)}</span>
          </label>
        );
      })}
    </div>
  );
}

function TrueFalseQuestion({ question, answer, onAnswerChange }: QuestionComponentProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {['正确', '错误'].map((option) => (
        <label
          key={option}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            border: answer === option ? '2px solid #6248F1' : '1px solid #E5E7EB',
            borderRadius: '10px',
            cursor: 'pointer',
            backgroundColor: answer === option ? '#EDE9FE' : '#fff',
            transition: 'all 0.15s',
          }}
        >
          <input
            type="radio"
            name={`question-${question.id}`}
            value={option}
            checked={answer === option}
            onChange={() => onAnswerChange(option)}
            style={{ accentColor: '#6248F1' }}
          />
          <span style={{ fontSize: '14px', color: '#1F2937' }}>{option}</span>
        </label>
      ))}
    </div>
  );
}

function FillBlankQuestion({ question, answer, onAnswerChange }: QuestionComponentProps) {
  return (
    <div>
      <input
        type="text"
        value={answer}
        onChange={(e) => onAnswerChange(e.target.value)}
        placeholder="请输入答案"
        aria-label={`填空题答案 - ${question.stem}`}
        style={{
          width: '100%',
          maxWidth: '400px',
          padding: '10px 14px',
          border: '1px solid #E5E7EB',
          borderRadius: '8px',
          fontSize: '14px',
          outline: 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
      />
    </div>
  );
}

function ShortAnswerQuestion({ question, answer, onAnswerChange }: QuestionComponentProps) {
  return (
    <div>
      <textarea
        value={answer}
        onChange={(e) => onAnswerChange(e.target.value)}
        placeholder="请输入答案"
        aria-label={`简答题答案 - ${question.stem}`}
        rows={6}
        style={{
          width: '100%',
          maxWidth: '600px',
          padding: '10px 14px',
          border: '1px solid #E5E7EB',
          borderRadius: '8px',
          fontSize: '14px',
          outline: 'none',
          resize: 'vertical',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
      />
    </div>
  );
}

// ─── Navigation Bar ─────────────────────────────────────────────────────────

interface NavigationBarProps {
  total: number;
  currentIndex: number;
  answers: Record<string, string>;
  questions: Question[];
  onNavigate: (index: number) => void;
}

function NavigationBar({ total, currentIndex, answers, questions, onNavigate }: NavigationBarProps) {
  return (
    <Card style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '16px 20px' }}>
      {Array.from({ length: total }, (_, i) => {
        const q = questions[i];
        const isAnswered = q && answers[q.id] && answers[q.id].trim() !== '';
        const isCurrent = i === currentIndex;
        return (
          <button
            key={i}
            onClick={() => onNavigate(i)}
            aria-label={`第 ${i + 1} 题${isAnswered ? '（已答）' : '（未答）'}`}
            style={{
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              borderRadius: '50%',
              backgroundColor: isCurrent ? '#6248F1' : isAnswered ? '#D1FAE5' : '#F3F4F6',
              color: isCurrent ? '#fff' : isAnswered ? '#065F46' : '#6B7280',
              fontSize: '13px',
              fontWeight: isCurrent ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {i + 1}
          </button>
        );
      })}
    </Card>
  );
}

// ─── Main ExamPage ──────────────────────────────────────────────────────────

export function ExamPage() {
  const { currentSubject } = useSubject();
  const navigate = useNavigate();
  const location = useLocation();

  // Check if we were navigated here with an existing session (from SubjectDetailPage)
  const navState = location.state as { sessionId?: string; questions?: Question[] } | null;

  // State: "select" (question selection) or "in_progress" (answering)
  const [examState, setExamState] = useState<'select' | 'in_progress'>(
    navState?.sessionId ? 'in_progress' : 'select'
  );

  // Question selection state
  const [availableQuestions, setAvailableQuestions] = useState<Question[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // Exam in-progress state
  const [sessionId, setSessionId] = useState<string | null>(navState?.sessionId ?? null);
  const [examQuestions, setExamQuestions] = useState<Question[]>(navState?.questions ?? []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timePerQuestion, setTimePerQuestion] = useState<Record<string, number>>({});
  const [questionStartTime, setQuestionStartTime] = useState<number>(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Record time spent on current question before navigating away
  const recordTimeAndNavigate = (newIndex: number) => {
    const currentQ = examQuestions[currentIndex];
    if (currentQ) {
      const elapsed = Math.round((Date.now() - questionStartTime) / 1000);
      setTimePerQuestion((prev) => ({
        ...prev,
        [currentQ.id]: (prev[currentQ.id] ?? 0) + elapsed,
      }));
    }
    setQuestionStartTime(Date.now());
    setCurrentIndex(newIndex);
  };

  // Clear navigation state after consuming it (prevent re-use on refresh)
  useEffect(() => {
    if (navState?.sessionId) {
      window.history.replaceState({}, '');
    }
  }, []);

  // ─── Auto-save answers to localStorage (restore on refresh) ─────────────────
  const draftKey = sessionId ? `aistudy_exam_draft_${sessionId}` : null;

  useEffect(() => {
    if (!draftKey) return;
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved) as { answers?: Record<string, string>; timePerQuestion?: Record<string, number> };
        if (parsed.answers) setAnswers(parsed.answers);
        if (parsed.timePerQuestion) setTimePerQuestion(parsed.timePerQuestion);
      }
    } catch { /* ignore corrupt draft */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey || examState !== 'in_progress') return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ answers, timePerQuestion }));
    } catch { /* quota exceeded, ignore */ }
  }, [answers, timePerQuestion, draftKey, examState]);

  // ─── Keyboard shortcuts (answering mode) ────────────────────────────────────
  useEffect(() => {
    if (examState !== 'in_progress') return;

    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const currentQ = examQuestions[currentIndex];
      if (!currentQ) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        recordTimeAndNavigate(Math.max(0, currentIndex - 1));
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        recordTimeAndNavigate(Math.min(examQuestions.length - 1, currentIndex + 1));
        return;
      }

      const key = e.key.toUpperCase();
      if (currentQ.type === 'single_choice' && currentQ.options) {
        const idx = key.charCodeAt(0) - 65;
        if (idx >= 0 && idx < currentQ.options.length) {
          e.preventDefault();
          setAnswers((prev) => ({ ...prev, [currentQ.id]: String.fromCharCode(65 + idx) }));
        }
      } else if (currentQ.type === 'true_false') {
        if (key === 'T' || key === '1') {
          setAnswers((prev) => ({ ...prev, [currentQ.id]: '正确' }));
        } else if (key === 'F' || key === '0') {
          setAnswers((prev) => ({ ...prev, [currentQ.id]: '错误' }));
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examState, currentIndex, examQuestions, questionStartTime]);

  // Fetch available questions for selection
  const fetchQuestions = useCallback(async () => {
    if (!currentSubject) return;
    setLoadingQuestions(true);
    try {
      const res = await api.get<{ success: true; data: Question[] }>(
        `/subjects/${currentSubject.id}/questions`
      );
      setAvailableQuestions(res.data.data);
    } catch {
      setAvailableQuestions([]);
    } finally {
      setLoadingQuestions(false);
    }
  }, [currentSubject]);

  useEffect(() => {
    if (examState === 'select') {
      fetchQuestions();
    }
  }, [fetchQuestions, examState]);

  // Toggle question selection
  const handleQuestionToggle = (questionId: string) => {
    setSelectedQuestionIds((prev) =>
      prev.includes(questionId)
        ? prev.filter((id) => id !== questionId)
        : [...prev, questionId]
    );
  };

  // Select all / deselect all
  const handleSelectAll = () => {
    if (selectedQuestionIds.length === availableQuestions.length) {
      setSelectedQuestionIds([]);
    } else {
      setSelectedQuestionIds(availableQuestions.map((q) => q.id));
    }
  };

  // Start exam: create session
  const handleStartExam = async () => {
    if (!currentSubject || selectedQuestionIds.length === 0) return;
    setError(null);

    try {
      const res = await api.post<{ success: true; data: { session: { id: string }; questions: Question[] } }>(
        `/subjects/${currentSubject.id}/exams`,
        { questionIds: selectedQuestionIds }
      );
      setSessionId(res.data.data.session.id);
      setExamQuestions(res.data.data.questions);
      setCurrentIndex(0);
      setAnswers({});
      setExamState('in_progress');
    } catch (err: unknown) {
      const errorMessage =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        || '创建考试失败，请稍后重试';
      setError(errorMessage);
    }
  };

  // Update answer for current question
  const handleAnswerChange = (answer: string) => {
    const questionId = examQuestions[currentIndex]?.id;
    if (!questionId) return;
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  // Submit exam
  const handleSubmit = async () => {
    if (!sessionId) return;
    setSubmitting(true);
    setError(null);

    try {
      // Record time for current question before submitting
      const currentQ = examQuestions[currentIndex];
      const finalTimePerQuestion = { ...timePerQuestion };
      if (currentQ) {
        const elapsed = Math.round((Date.now() - questionStartTime) / 1000);
        finalTimePerQuestion[currentQ.id] = (finalTimePerQuestion[currentQ.id] ?? 0) + elapsed;
      }

      const answerPayload = examQuestions.map((q) => ({
        questionId: q.id,
        userAnswer: answers[q.id] || '',
        timeSpent: finalTimePerQuestion[q.id] ?? 0,
      }));

      await api.post(`/exams/${sessionId}/submit`, { answers: answerPayload });
      // Clear saved draft after successful submission
      if (draftKey) localStorage.removeItem(draftKey);
      navigate(`/exam/${sessionId}/result`);
    } catch (err: unknown) {
      const errorMessage =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        || '提交答卷失败，请稍后重试';
      setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  // Render question component based on type
  const renderQuestion = (question: Question) => {
    const currentAnswer = answers[question.id] || '';
    const props: QuestionComponentProps = {
      question,
      answer: currentAnswer,
      onAnswerChange: handleAnswerChange,
    };

    switch (question.type) {
      case 'single_choice':
        return <SingleChoiceQuestion {...props} />;
      case 'multiple_choice':
        return <MultipleChoiceQuestion {...props} />;
      case 'true_false':
        return <TrueFalseQuestion {...props} />;
      case 'fill_blank':
        return <FillBlankQuestion {...props} />;
      case 'short_answer':
        return <ShortAnswerQuestion {...props} />;
      default:
        return <p>不支持的题型</p>;
    }
  };

  // ─── No subject selected ───────────────────────────────────────────────────
  if (!currentSubject) {
    return (
      <EmptyState
        icon={<PenLine size={48} strokeWidth={1.2} />}
        title="请先选择一个学科"
        description="前往「我的学科」选择学科后，可在学科详情页快速开始答题"
        minHeight={400}
      />
    );
  }

  // ─── Question Selection State ──────────────────────────────────────────────
  if (examState === 'select') {
    return (
      <div style={{ padding: '0', maxWidth: '900px' }}>
        <h2 style={{ marginBottom: '28px', fontSize: '24px', fontWeight: 700 }}>开始答题</h2>

        <Card style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: '#1F2937' }}>选择题目</h3>
            <Button variant="ghost" size="sm" onClick={handleSelectAll} style={{ border: '1px solid #E5E7EB' }}>
              {selectedQuestionIds.length === availableQuestions.length && availableQuestions.length > 0
                ? '取消全选'
                : '全选'}
            </Button>
          </div>

          {loadingQuestions ? (
            <SkeletonList rows={3} />
          ) : availableQuestions.length === 0 ? (
            <p style={{ color: '#9CA3AF', fontSize: '14px', textAlign: 'center', padding: '24px' }}>题库为空，请先在题库管理中生成考题</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
              {availableQuestions.map((question) => (
                <label
                  key={question.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '12px 14px',
                    border: selectedQuestionIds.includes(question.id) ? '2px solid #6248F1' : '1px solid #E5E7EB',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    backgroundColor: selectedQuestionIds.includes(question.id) ? '#EDE9FE' : '#fff',
                    transition: 'all 0.15s',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedQuestionIds.includes(question.id)}
                    onChange={() => handleQuestionToggle(question.id)}
                    style={{ marginTop: '3px', accentColor: '#6248F1' }}
                  />
                  <div style={{ flex: 1 }}>
                    <span style={{ marginRight: '8px', display: 'inline-block' }}>
                      <Badge variant="primary">{TYPE_LABELS[question.type]}</Badge>
                    </span>
                    <span style={{ fontSize: '14px', color: '#1F2937' }}>
                      {question.stem.length > 80 ? question.stem.slice(0, 80) + '...' : question.stem}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          )}
        </Card>

        {/* Start Exam Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Button
            size="lg"
            onClick={handleStartExam}
            disabled={selectedQuestionIds.length === 0}
          >
            开始答题（已选 {selectedQuestionIds.length} 题）
          </Button>
        </div>

        {error && (
          <div style={{
            marginTop: '12px',
            padding: '10px 14px',
            backgroundColor: '#FEE2E2',
            color: '#991B1B',
            borderRadius: '8px',
            fontSize: '14px',
            border: '1px solid #FECACA',
          }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  // ─── Exam In Progress State ────────────────────────────────────────────────
  const currentQuestion = examQuestions[currentIndex];
  const answeredCount = examQuestions.filter((q) => answers[q.id] && answers[q.id].trim() !== '').length;

  return (
    <div style={{ padding: '0', maxWidth: '900px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>答题中</h2>
        <Badge variant="primary">已答 {answeredCount}/{examQuestions.length} 题</Badge>
      </div>
      <p style={{ fontSize: '12px', color: '#9CA3AF', margin: '0 0 20px 0' }}>
        快捷键：← → 翻题，A/B/C/D 选择选项，T/F 判断对错，答案自动保存
      </p>

      {/* Navigation Bar */}
      <div style={{ marginBottom: '20px' }}>
        <NavigationBar
          total={examQuestions.length}
          currentIndex={currentIndex}
          answers={answers}
          questions={examQuestions}
          onNavigate={recordTimeAndNavigate}
        />
      </div>

      {/* Current Question */}
      {currentQuestion && (
        <Card style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#6248F1' }}>
              第 {currentIndex + 1} 题
            </span>
            <Badge variant="primary">{TYPE_LABELS[currentQuestion.type]}</Badge>
          </div>

          <p style={{ fontSize: '15px', lineHeight: 1.7, color: '#1F2937', marginBottom: '20px' }}>
            {currentQuestion.stem}
          </p>

          {renderQuestion(currentQuestion)}
        </Card>
      )}

      {/* Prev / Next Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <Button
          variant="ghost"
          onClick={() => recordTimeAndNavigate(Math.max(0, currentIndex - 1))}
          disabled={currentIndex === 0}
          style={{ border: '1px solid #E5E7EB' }}
        >
          上一题
        </Button>
        <Button
          variant="ghost"
          onClick={() => recordTimeAndNavigate(Math.min(examQuestions.length - 1, currentIndex + 1))}
          disabled={currentIndex === examQuestions.length - 1}
          style={{ border: '1px solid #E5E7EB' }}
        >
          下一题
        </Button>
      </div>

      {/* Submit Button */}
      <Card style={{ padding: '20px 24px' }}>
        <Button variant="success" size="lg" onClick={handleSubmit} disabled={submitting} loading={submitting}>
          {submitting ? '提交中...' : '提交答卷'}
        </Button>
        {answeredCount < examQuestions.length && (
          <p style={{ marginTop: '10px', color: '#F59E0B', fontSize: '13px' }}>
            还有 {examQuestions.length - answeredCount} 题未作答
          </p>
        )}
      </Card>

      {error && (
        <div style={{
          marginTop: '12px',
          padding: '10px 14px',
          backgroundColor: '#FEE2E2',
          color: '#991B1B',
          borderRadius: '8px',
          fontSize: '14px',
          border: '1px solid #FECACA',
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
