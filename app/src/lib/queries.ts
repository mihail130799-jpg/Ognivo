// Хуки данных поверх API (react-query): загрузка, кэш и обновление после изменений.

import { useMutation, useQuery, useQueryClient, QueryClient } from '@tanstack/react-query';
import type {
  DeepPartial,
  ExerciseInfo,
  HabitDto,
  MeResponse,
  MoneySummary,
  SavingsGoalDto,
  SavingsMoveDto,
  TaskDto,
  TransactionDto,
  UserSettings,
  WorkoutDto,
} from '@ognivo/shared';
import { api } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

const json = (body: unknown) => ({ body: JSON.stringify(body) });

export interface Range {
  from?: string;
  to?: string;
}

const qs = (r: Range) => {
  const p = new URLSearchParams();
  if (r.from) p.set('from', r.from);
  if (r.to) p.set('to', r.to);
  const s = p.toString();
  return s ? `?${s}` : '';
};

// ── Профиль ──

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<MeResponse>('/me') });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; timezone?: string; settings?: DeepPartial<UserSettings> }) =>
      api<MeResponse>('/me', { method: 'PATCH', ...json(body) }),
    onSuccess: (me) => qc.setQueryData(['me'], me),
  });
}

// ── План ──

export function useTasks() {
  return useQuery({ queryKey: ['tasks'], queryFn: () => api<TaskDto[]>('/tasks') });
}

export type TaskInput = Partial<Omit<TaskDto, 'id' | 'doneDates' | 'createdAt'>> & { title: string };

export function useSaveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: TaskInput & { id?: string }) =>
      id
        ? api<TaskDto>(`/tasks/${id}`, { method: 'PATCH', ...json(body) })
        : api<TaskDto>('/tasks', { method: 'POST', ...json(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

/** Отметка выполнения с мгновенным обновлением интерфейса. */
export function useToggleTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, date }: { id: string; date?: string }) =>
      api<TaskDto>(`/tasks/${id}/toggle`, { method: 'POST', ...json(date ? { date } : {}) }),
    onMutate: async ({ id, date }) => {
      await qc.cancelQueries({ queryKey: ['tasks'] });
      const prev = qc.getQueryData<TaskDto[]>(['tasks']);
      qc.setQueryData<TaskDto[]>(['tasks'], (list) =>
        list?.map((t) => {
          if (t.id !== id) return t;
          if (t.repeat === 'none') return { ...t, status: t.status === 'done' ? 'planned' : 'done' };
          if (!date) return t;
          const has = t.doneDates.includes(date);
          return { ...t, doneDates: has ? t.doneDates.filter((d) => d !== date) : [...t.doneDates, date] };
        }),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(['tasks'], ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

/** Смена статуса задачи (для доски). */
export function useSetTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskDto['status'] }) =>
      api<TaskDto>(`/tasks/${id}`, { method: 'PATCH', ...json({ status }) }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['tasks'] });
      const prev = qc.getQueryData<TaskDto[]>(['tasks']);
      qc.setQueryData<TaskDto[]>(['tasks'], (list) => list?.map((t) => (t.id === id ? { ...t, status } : t)));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(['tasks'], ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useHabits(range: Range) {
  return useQuery({ queryKey: ['habits', range], queryFn: () => api<HabitDto[]>(`/habits${qs(range)}`) });
}

export function useSaveHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id?: string; title: string; emoji: string }) =>
      id
        ? api(`/habits/${id}`, { method: 'PATCH', ...json(body) })
        : api('/habits', { method: 'POST', ...json(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['habits'] }),
  });
}

export function useDeleteHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/habits/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['habits'] }),
  });
}

/** Отметка привычки на дату — интерфейс обновляется сразу. */
export function useToggleHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, date }: { id: string; date: string }) =>
      api<{ checked: boolean }>(`/habits/${id}/check`, { method: 'POST', ...json({ date }) }),
    onMutate: async ({ id, date }) => {
      await qc.cancelQueries({ queryKey: ['habits'] });
      const snapshots = qc.getQueriesData<HabitDto[]>({ queryKey: ['habits'] });
      qc.setQueriesData<HabitDto[]>({ queryKey: ['habits'] }, (list) =>
        list?.map((h) =>
          h.id !== id
            ? h
            : { ...h, checks: h.checks.includes(date) ? h.checks.filter((d) => d !== date) : [...h.checks, date] },
        ),
      );
      return { snapshots };
    },
    onError: (_e, _v, ctx) => ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['habits'] }),
  });
}

// ── Деньги ──

export function useTransactions(range: Range) {
  return useQuery({
    queryKey: ['transactions', range],
    queryFn: () => api<TransactionDto[]>(`/transactions${qs(range)}`),
  });
}

export function useMoneySummary(range: Range) {
  return useQuery({
    queryKey: ['summary', range],
    queryFn: () => api<MoneySummary>(`/transactions/summary${qs(range)}`),
  });
}

export type TransactionInput = Omit<TransactionDto, 'id'>;

export function useSaveTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: TransactionInput & { id?: string }) =>
      id
        ? api<TransactionDto>(`/transactions/${id}`, { method: 'PATCH', ...json(body) })
        : api<TransactionDto>('/transactions', { method: 'POST', ...json(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['summary'] });
    },
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/transactions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['summary'] });
    },
  });
}

export function useSavings() {
  return useQuery({ queryKey: ['savings'], queryFn: () => api<SavingsGoalDto[]>('/savings') });
}

export interface GoalInput {
  id?: string;
  title: string;
  emoji: string;
  target: number;
  deadline: string | null;
}

export function useSaveGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: GoalInput) =>
      id
        ? api<SavingsGoalDto>(`/savings/${id}`, { method: 'PATCH', ...json(body) })
        : api<SavingsGoalDto>('/savings', { method: 'POST', ...json(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['savings'] }),
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/savings/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['savings'] }),
  });
}

export function useGoalMoves(id: string | undefined) {
  return useQuery({
    queryKey: ['savings', id, 'moves'],
    queryFn: () => api<SavingsMoveDto[]>(`/savings/${id}/moves`),
    enabled: !!id,
  });
}

export function useAddMove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ goalId, ...body }: { goalId: string; amount: number; date: string; comment?: string }) =>
      api<SavingsGoalDto>(`/savings/${goalId}/moves`, { method: 'POST', ...json(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['savings'] }),
  });
}

export function useDeleteMove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ goalId, moveId }: { goalId: string; moveId: string }) =>
      api(`/savings/${goalId}/moves/${moveId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['savings'] }),
  });
}

// ── Спорт ──

export function useWorkouts(range: Range) {
  return useQuery({ queryKey: ['workouts', range], queryFn: () => api<WorkoutDto[]>(`/workouts${qs(range)}`) });
}

export function useExercises() {
  return useQuery({ queryKey: ['exercises'], queryFn: () => api<ExerciseInfo[]>('/exercises'), staleTime: Infinity });
}
