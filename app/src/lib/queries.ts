// Хуки данных поверх API (react-query): загрузка, кэш и обновление после изменений.

import { useMutation, useQuery, useQueryClient, QueryClient } from '@tanstack/react-query';
import type {
  DeepPartial,
  ExerciseInfo,
  HabitDto,
  MeResponse,
  MoneySummary,
  SavingsGoalDto,
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

export function useHabits(range: Range) {
  return useQuery({ queryKey: ['habits', range], queryFn: () => api<HabitDto[]>(`/habits${qs(range)}`) });
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

// ── Спорт ──

export function useWorkouts(range: Range) {
  return useQuery({ queryKey: ['workouts', range], queryFn: () => api<WorkoutDto[]>(`/workouts${qs(range)}`) });
}

export function useExercises() {
  return useQuery({ queryKey: ['exercises'], queryFn: () => api<ExerciseInfo[]>('/exercises'), staleTime: Infinity });
}
