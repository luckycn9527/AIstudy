import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { api } from '../services/api';

export interface Subject {
  id: string;
  name: string;
  createdAt: string;
}

interface SubjectContextValue {
  subjects: Subject[];
  currentSubject: Subject | null;
  setCurrentSubject: (subject: Subject | null) => void;
  refreshSubjects: () => Promise<void>;
  loading: boolean;
}

const SubjectContext = createContext<SubjectContextValue | undefined>(undefined);

const STORAGE_KEY = 'aistudy_current_subject_id';

export function SubjectProvider({ children }: { children: ReactNode }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [currentSubject, setCurrentSubjectState] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(true);

  // Persist current subject selection to localStorage
  const setCurrentSubject = useCallback((subject: Subject | null) => {
    setCurrentSubjectState(subject);
    if (subject) {
      localStorage.setItem(STORAGE_KEY, subject.id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const refreshSubjects = useCallback(async () => {
    try {
      const res = await api.get<{ success: true; data: Subject[] }>('/subjects');
      const data = res.data.data;
      setSubjects(data);

      // Restore persisted selection, or auto-select first
      setCurrentSubjectState((prev) => {
        if (prev && data.some((s) => s.id === prev.id)) {
          // Keep current if still valid
          return data.find((s) => s.id === prev.id) ?? prev;
        }
        const savedId = localStorage.getItem(STORAGE_KEY);
        const saved = savedId ? data.find((s) => s.id === savedId) : null;
        if (saved) return saved;
        return data.length > 0 ? data[0] : null;
      });
    } catch {
      setSubjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSubjects();
  }, [refreshSubjects]);

  const value = useMemo<SubjectContextValue>(
    () => ({ subjects, currentSubject, setCurrentSubject, refreshSubjects, loading }),
    [subjects, currentSubject, setCurrentSubject, refreshSubjects, loading],
  );

  return <SubjectContext.Provider value={value}>{children}</SubjectContext.Provider>;
}

export function useSubject(): SubjectContextValue {
  const context = useContext(SubjectContext);
  if (!context) {
    throw new Error('useSubject must be used within a SubjectProvider');
  }
  return context;
}
