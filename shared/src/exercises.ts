// Встроенный справочник упражнений. id начинаются с 'b:' и не должны меняться —
// на них ссылаются сохранённые тренировки.

export type MuscleGroup = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core' | 'cardio' | 'other';
export type ExerciseUnit = 'reps' | 'time';

export interface ExerciseInfo {
  id: string;
  title: string;
  group: MuscleGroup;
  unit: ExerciseUnit;
  builtin: boolean;
}

export const MUSCLE_GROUPS: Record<MuscleGroup, string> = {
  chest: 'Грудь',
  back: 'Спина',
  legs: 'Ноги',
  shoulders: 'Плечи',
  arms: 'Руки',
  core: 'Пресс и кор',
  cardio: 'Кардио',
  other: 'Другое',
};

const b = (id: string, title: string, group: MuscleGroup, unit: ExerciseUnit = 'reps'): ExerciseInfo => ({
  id: `b:${id}`,
  title,
  group,
  unit,
  builtin: true,
});

export const BUILTIN_EXERCISES: readonly ExerciseInfo[] = [
  b('bench_press', 'Жим штанги лёжа', 'chest'),
  b('db_press', 'Жим гантелей лёжа', 'chest'),
  b('incline_press', 'Жим на наклонной скамье', 'chest'),
  b('pushups', 'Отжимания', 'chest'),
  b('dips', 'Отжимания на брусьях', 'chest'),
  b('flyes', 'Разведение гантелей', 'chest'),

  b('pullups', 'Подтягивания', 'back'),
  b('lat_pulldown', 'Тяга верхнего блока', 'back'),
  b('barbell_row', 'Тяга штанги в наклоне', 'back'),
  b('db_row', 'Тяга гантели одной рукой', 'back'),
  b('seated_row', 'Горизонтальная тяга', 'back'),
  b('deadlift', 'Становая тяга', 'back'),

  b('squat', 'Приседания со штангой', 'legs'),
  b('bw_squat', 'Приседания', 'legs'),
  b('leg_press', 'Жим ногами', 'legs'),
  b('lunges', 'Выпады', 'legs'),
  b('rdl', 'Румынская тяга', 'legs'),
  b('leg_curl', 'Сгибание ног', 'legs'),
  b('leg_ext', 'Разгибание ног', 'legs'),
  b('calf_raise', 'Подъём на носки', 'legs'),

  b('ohp', 'Жим штанги стоя', 'shoulders'),
  b('db_shoulder', 'Жим гантелей сидя', 'shoulders'),
  b('lateral_raise', 'Махи в стороны', 'shoulders'),
  b('face_pull', 'Тяга к лицу', 'shoulders'),

  b('biceps_curl', 'Подъём на бицепс', 'arms'),
  b('hammer_curl', 'Молотки', 'arms'),
  b('triceps_ext', 'Разгибание на трицепс', 'arms'),
  b('french_press', 'Французский жим', 'arms'),

  b('plank', 'Планка', 'core', 'time'),
  b('crunches', 'Скручивания', 'core'),
  b('leg_raise', 'Подъём ног в висе', 'core'),

  b('run', 'Бег', 'cardio', 'time'),
  b('bike', 'Велотренажёр', 'cardio', 'time'),
  b('rope', 'Скакалка', 'cardio', 'time'),
  b('walk', 'Ходьба', 'cardio', 'time'),
];

export const BUILTIN_EXERCISE_BY_ID: Readonly<Record<string, ExerciseInfo>> = Object.fromEntries(
  BUILTIN_EXERCISES.map((e) => [e.id, e]),
);
