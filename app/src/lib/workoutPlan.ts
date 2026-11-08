// «Составить план»: простые правила подбора тренировки. Не медицинская рекомендация.
import { BUILTIN_EXERCISE_BY_ID, weekday, type DateStr, type WorkoutDto, type WorkoutSetDto } from '@ognivo/shared';

interface Split {
  title: string;
  exercises: string[];
}

/** Классический сплит из трёх дней, плюс общая тренировка для 1–2 дней в неделю. */
const SPLITS: Split[] = [
  { title: 'Грудь и трицепс', exercises: ['b:bench_press', 'b:incline_press', 'b:flyes', 'b:dips', 'b:triceps_ext'] },
  { title: 'Спина и бицепс', exercises: ['b:pullups', 'b:barbell_row', 'b:lat_pulldown', 'b:biceps_curl', 'b:hammer_curl'] },
  { title: 'Ноги и плечи', exercises: ['b:squat', 'b:rdl', 'b:lunges', 'b:ohp', 'b:lateral_raise', 'b:plank'] },
];
const FULL_BODY: Split = {
  title: 'Всё тело',
  exercises: ['b:squat', 'b:bench_press', 'b:barbell_row', 'b:ohp', 'b:plank'],
};

export type DraftSet = Omit<WorkoutSetDto, 'id'>;
export interface DraftExercise {
  exerciseId: string;
  title: string;
  unit: 'reps' | 'time';
  sets: DraftSet[];
}

/** Последние значения подхода по упражнению — чтобы продолжить с того же веса. */
export function lastSets(history: WorkoutDto[], exerciseId: string): DraftSet[] | null {
  const sorted = [...history].sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const w of sorted) {
    const e = w.exercises.find((x) => x.exerciseId === exerciseId);
    if (e?.sets.length) return e.sets.map((s) => ({ reps: s.reps, weight: s.weight, durationSec: s.durationSec, done: false }));
  }
  return null;
}

export function defaultSets(unit: 'reps' | 'time'): DraftSet[] {
  return unit === 'time'
    ? Array.from({ length: 3 }, () => ({ reps: null, weight: null, durationSec: 60, done: false }))
    : Array.from({ length: 3 }, () => ({ reps: 10, weight: null, durationSec: null, done: false }));
}

/**
 * Подбор тренировки на дату: при 3+ тренировочных днях чередуем сплит по порядковому номеру дня,
 * иначе — тренировка на всё тело. Веса берём из прошлых тренировок.
 */
export function suggestWorkout(date: DateStr, trainingDays: number[], history: WorkoutDto[]): { title: string; exercises: DraftExercise[] } {
  const days = [...trainingDays].sort();
  let split = FULL_BODY;
  if (days.length >= 3) {
    const idx = days.indexOf(weekday(date));
    // Если день не тренировочный — берём следующий по счёту сплит после последней тренировки
    const n = idx >= 0 ? idx : history.length;
    split = SPLITS[n % SPLITS.length];
  }
  return {
    title: split.title,
    exercises: split.exercises
      .map((id) => BUILTIN_EXERCISE_BY_ID[id])
      .filter(Boolean)
      .map((e) => ({
        exerciseId: e.id,
        title: e.title,
        unit: e.unit,
        sets: lastSets(history, e.id) ?? defaultSets(e.unit),
      })),
  };
}

/** Сколько подходов выполнено в тренировке. */
export function doneSets(w: WorkoutDto): number {
  return w.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
}

/** Тоннаж (кг × повторы) по выполненным подходам. */
export function volume(w: WorkoutDto): number {
  return w.exercises.reduce(
    (a, e) => a + e.sets.filter((s) => s.done).reduce((b, s) => b + (s.weight ?? 0) * (s.reps ?? 0), 0),
    0,
  );
}
