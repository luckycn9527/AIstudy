import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubject } from '../contexts/SubjectContext';
import { useDashboard } from '../contexts/DashboardContext';
import { useToast } from '../components/ui/ToastProvider';
import { Button, EmptyState } from '../components/ui';
import { api } from '../services/api';
import { BookOpen, Calculator, Code, Microscope, Globe, PenTool, Beaker, Languages, Plus, X, GraduationCap } from 'lucide-react';
import { getSubjectBackground } from '../utils/subject-images';

const SUBJECT_COLORS = ['#6248F1', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#14B8A6', '#F97316'];
const SUBJECT_ICON_COMPONENTS = [BookOpen, Calculator, Code, Microscope, Globe, PenTool, Beaker, Languages];

function getSubjectStyle(index: number) {
  return {
    color: SUBJECT_COLORS[index % SUBJECT_COLORS.length],
    bgColor: `${SUBJECT_COLORS[index % SUBJECT_COLORS.length]}1A`,
    IconComponent: SUBJECT_ICON_COMPONENTS[index % SUBJECT_ICON_COMPONENTS.length],
  };
}

export function SubjectsPage() {
  const navigate = useNavigate();
  const { subjects, currentSubject, setCurrentSubject, refreshSubjects } = useSubject();
  const { data: dashboard, refresh: refreshDashboard } = useDashboard();
  const toast = useToast();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const createInputRef = useRef<HTMLInputElement>(null);

  // Get per-subject stats from dashboard
  const subjectStats = dashboard?.subjects ?? [];
  const statsMap = new Map(subjectStats.map((s) => [s.id, s]));

  const handleOpenCreate = () => {
    setNewSubjectName('');
    setError('');
    setShowCreateDialog(true);
    setTimeout(() => createInputRef.current?.focus(), 50);
  };

  const handleCloseCreate = () => {
    setShowCreateDialog(false);
    setNewSubjectName('');
    setError('');
  };

  const handleCreate = async () => {
    const name = newSubjectName.trim();
    if (!name) {
      setError('学科名称不能为空');
      return;
    }
    setCreating(true);
    setError('');
    try {
      await api.post('/subjects', { name });
      await refreshSubjects();
      await refreshDashboard();
      toast.success(`学科「${name}」创建成功`);
      handleCloseCreate();
    } catch {
      setError('创建学科失败，请重试');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (subjectId: string, subjectName: string) => {
    if (!confirm(`确定要删除「${subjectName}」吗？\n所有相关资料、题目和考试记录都将被永久删除。`)) return;
    setDeleting(subjectId);
    try {
      await api.delete(`/subjects/${subjectId}`);
      if (currentSubject?.id === subjectId) {
        setCurrentSubject(null);
      }
      await refreshSubjects();
      await refreshDashboard();
      toast.success(`学科「${subjectName}」已删除`);
    } catch {
      toast.error('删除失败，请重试');
    } finally {
      setDeleting(null);
    }
  };

  const handleSelect = (subject: { id: string; name: string; createdAt: string }) => {
    setCurrentSubject(subject);
    navigate(`/subjects/${subject.id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCreate();
    else if (e.key === 'Escape') handleCloseCreate();
  };

  return (
    <div style={{ padding: '0', maxWidth: '1100px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>我的学科</h2>
          <p style={{ fontSize: '14px', color: '#9CA3AF', margin: '6px 0 0 0' }}>
            管理你的学科，选择当前学科后可进行资料上传、出题和考试
          </p>
        </div>
        <Button onClick={handleOpenCreate} style={{ borderRadius: '10px', boxShadow: '0 4px 12px rgba(98, 72, 241, 0.3)' }}>
          <Plus size={16} />
          新建学科
        </Button>
      </div>

      {/* Subject Cards Grid */}
      {subjects.length === 0 ? (
        <div style={{
          padding: '60px 40px',
          backgroundColor: '#fff',
          borderRadius: '16px',
          border: '2px dashed #E5E7EB',
        }}>
          <EmptyState
            icon={<GraduationCap size={56} />}
            title="还没有学科"
            description="创建你的第一个学科，开始 AI 辅助学习之旅"
            minHeight={120}
            action={<Button onClick={handleOpenCreate}>创建学科</Button>}
          />
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '20px',
        }}>
          {subjects.map((subject, index) => {
            const style = getSubjectStyle(index);
            const stats = statsMap.get(subject.id);
            const isSelected = currentSubject?.id === subject.id;
            const accuracyPercent = stats ? Math.round(stats.accuracy * 100) : 0;

            return (
              <div
                key={subject.id}
                onClick={() => handleSelect(subject)}
                className="card-hoverable"
                style={{
                  position: 'relative',
                  borderRadius: '16px',
                  border: isSelected ? `2px solid ${style.color}` : '1px solid rgba(255,255,255,0.1)',
                  boxShadow: isSelected
                    ? `0 4px 16px ${style.color}40`
                    : '0 2px 8px rgba(0,0,0,0.1)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  overflow: 'hidden',
                  background: `linear-gradient(160deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.3) 100%), url(${getSubjectBackground(subject.name, index)})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  minHeight: '200px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  padding: '20px',
                  color: '#fff',
                }}
              >
                {/* Selected badge */}
                {isSelected && (
                  <div style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    padding: '3px 10px',
                    backgroundColor: 'rgba(255,255,255,0.9)',
                    color: style.color,
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}>
                    当前
                  </div>
                )}

                {/* Delete button */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(subject.id, subject.name); }}
                  disabled={deleting === subject.id}
                  style={{
                    position: 'absolute',
                    top: '12px',
                    right: isSelected ? '60px' : '12px',
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(0,0,0,0.3)',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '18px',
                    cursor: deleting === subject.id ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s',
                    opacity: deleting === subject.id ? 0.4 : 0.7,
                  }}
                  aria-label={`删除学科: ${subject.name}`}
                  title="删除学科"
                >
                  <X size={16} />
                </button>

                {/* Icon */}
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  backdropFilter: 'blur(4px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '12px',
                }}>
                  <style.IconComponent size={22} strokeWidth={1.8} color="#fff" />
                </div>

                {/* Name */}
                <h3 style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  color: '#fff',
                  margin: '0 0 4px 0',
                  textShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}>
                  {subject.name}
                </h3>

                {/* Stats */}
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', marginBottom: '12px' }}>
                  共 {stats?.totalQuestions ?? 0} 题
                </div>

                {/* Accuracy bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                    <span style={{ color: 'rgba(255,255,255,0.7)' }}>正确率</span>
                    <span style={{ color: '#fff', fontWeight: 600 }}>{accuracyPercent}%</span>
                  </div>
                  <div style={{
                    height: '5px',
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    borderRadius: '3px',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${accuracyPercent}%`,
                      backgroundColor: '#fff',
                      borderRadius: '3px',
                      transition: 'width 0.3s',
                    }} />
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add card */}
          <div
            onClick={handleOpenCreate}
            className="card-hoverable"
            style={{
              padding: '24px',
              backgroundColor: '#FAFBFC',
              borderRadius: '16px',
              border: '2px dashed #E5E7EB',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '200px',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: '#EDE9FE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6248F1',
              marginBottom: '12px',
            }}>
              <Plus size={24} />
            </div>
            <div style={{ fontSize: '14px', fontWeight: 500, color: '#6B7280' }}>新建学科</div>
          </div>
        </div>
      )}

      {/* Create Dialog */}
      {showCreateDialog && (
        <div
          className="dialog-overlay"
          onClick={handleCloseCreate}
        >
          <div
            className="dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="create-subject-title"
          >
            <h3 id="create-subject-title" className="dialog-title">新建学科</h3>
            <div className="dialog-body">
              <input
                ref={createInputRef}
                type="text"
                className="dialog-input"
                placeholder="请输入学科名称，如：高等数学"
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={creating}
                aria-label="学科名称"
              />
              {error && <p className="dialog-error">{error}</p>}
            </div>
            <div className="dialog-actions">
              <button className="btn-dialog btn-cancel" onClick={handleCloseCreate} disabled={creating}>
                取消
              </button>
              <button className="btn-dialog btn-confirm" onClick={handleCreate} disabled={creating}>
                {creating ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
