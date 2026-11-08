import { useMemo, useState } from 'react';
import { MUSCLE_GROUPS, type DateStr, type ExerciseInfo, type MuscleGroup, type WorkoutDto } from '@ognivo/shared';
import { Check, Field, Sheet, toast } from './ui';
import { useDeleteWorkout, useExercises, useReopenWorkout, useSaveWorkout, useWorkouts } from '../lib/queries';
import { useApp } from '../lib/appContext';
import { capitalize, relativeDay } from '../lib/format';
import { confirmAction, haptic } from '../lib/telegram';
import { defaultSets, lastSets, suggestWorkout, type DraftExercise } from '../lib/workoutPlan';
import './WorkoutSheet.css';

interface Props {
  date: DateStr;
  workout?: WorkoutDto;
  onClose: () => void;
}

/** Ячейки подхода храним строками, чтобы поле можно было очистить при вводе. */
interface SetRow {
  reps: string;
  weight: string;
  dur: string;
  done: boolean;
}
interface ExRow {
  exerciseId: string;
  title: string;
  unit: 'reps' | 'time';
  sets: SetRow[];
}

const str = (n: number | null) => (n == null ? '' : String(n).replace('.', ','));
const num = (s: string) => {
  const v = Number(s.replace(',', '.'));
  return s.trim() === '' || !Number.isFinite(v) ? null : v;
};

function toRows(list: DraftExercise[] | WorkoutDto['exercises']): ExRow[] {
  return list.map((e) => ({
    exerciseId: e.exerciseId,
    title: e.title,
    unit: e.unit,
    sets: e.sets.map((s) => ({ reps: str(s.reps), weight: str(s.weight), dur: str(s.durationSec), done: s.done })),
  }));
}

export function WorkoutSheet({ date: initialDate, workout, onClose }: Props) {
  const { today, settings } = useApp();
  const history = useWorkouts({});
  const save = useSaveWorkout();
  const reopen = useReopenWorkout();
  const del = useDeleteWorkout();

  const [plan] = useState(() => (workout ? null : suggestWorkout(initialDate, settings.trainingDays, history.data ?? [])));
  const [title, setTitle] = useState(workout?.title ?? plan?.title ?? 'Тренировка');
  const [date, setDate] = useState(workout?.date ?? initialDate);
  const [rows, setRows] = useState<ExRow[]>(() => toRows(workout?.exercises ?? plan?.exercises ?? []));
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const done = workout?.status === 'done';

  const totalSets = rows.reduce((a, r) => a + r.sets.length, 0);
  const doneCount = rows.reduce((a, r) => a + r.sets.filter((s) => s.done).length, 0);

  const update = (i: number, fn: (r: ExRow) => ExRow) => setRows((rs) => rs.map((r, j) => (j === i ? fn(r) : r)));
  const updateSet = (i: number, k: number, patch: Partial<SetRow>) =>
    update(i, (r) => ({ ...r, sets: r.sets.map((s, j) => (j === k ? { ...s, ...patch } : s)) }));

  function addExercise(e: ExerciseInfo) {
    const prev = lastSets(history.data ?? [], e.id) ?? defaultSets(e.unit);
    setRows((rs) => [...rs, { exerciseId: e.id, title: e.title, unit: e.unit, sets: toRows([{ ...e, exerciseId: e.id, sets: prev }])[0].sets }]);
    setPicking(false);
  }

  function regenerate() {
    const p = suggestWorkout(date, settings.trainingDays, history.data ?? []);
    setTitle(p.title);
    setRows(toRows(p.exercises));
  }

  async function onSave(finish: boolean) {
    if (!title.trim()) return setError('Введите название');
    if (finish && rows.length === 0) return setError('Добавьте хотя бы одно упражнение');
    setError('');
    try {
      await save.mutateAsync({
        id: workout?.id,
        title: title.trim(),
        date,
        note: workout?.note ?? '',
        finish,
        exercises: rows.map((r) => ({
          exerciseId: r.exerciseId,
          sets: r.sets.map((s) => ({
            reps: r.unit === 'reps' ? num(s.reps) : null,
            weight: r.unit === 'reps' ? num(s.weight) : null,
            durationSec: r.unit === 'time' ? num(s.dur) : null,
            // При завершении считаем выполненными все подходы, если ни один не отмечен
            done: finish && doneCount === 0 ? true : s.done,
          })),
        })),
      });
      if (finish) haptic('success');
      toast(finish ? 'Тренировка завершена 🔥' : 'Сохранено');
      onClose();
    } catch {
      setError('Не удалось сохранить. Проверьте соединение.');
    }
  }

  async function onDelete() {
    if (!workout || !(await confirmAction('Удалить тренировку?'))) return;
    await del.mutateAsync(workout.id);
    toast('Тренировка удалена');
    onClose();
  }

  if (picking) return <ExercisePicker onPick={addExercise} onBack={() => setPicking(false)} onClose={onClose} />;

  return (
    <Sheet title={capitalize(relativeDay(date, today))} onClose={onClose}>
      <div className="field-row wide-first">
        <Field label="Название">
          <input className="input" aria-label="Название" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Дата">
          <input className="input" type="date" aria-label="Дата" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </Field>
      </div>

      {done && <div className="wk-done">✓ Тренировка завершена</div>}
      {totalSets > 0 && !done && (
        <div className="muted" style={{ marginBottom: 10 }}>
          Выполнено подходов: {doneCount} из {totalSets}
        </div>
      )}

      {rows.map((r, i) => (
        <div key={i} className="wk-ex">
          <div className="wk-ex-head">
            <b>{r.title}</b>
            <button className="wk-x" aria-label={`Убрать «${r.title}»`} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
          <div className="wk-set wk-set-head">
            <span>#</span>
            {r.unit === 'reps' ? (
              <>
                <span>Повторы</span>
                <span>Вес, кг</span>
              </>
            ) : (
              <span className="span2">Время, сек</span>
            )}
            <span />
            <span />
          </div>
          {r.sets.map((s, k) => (
            <div key={k} className={`wk-set${s.done ? ' done' : ''}`}>
              <span className="wk-n">{k + 1}</span>
              {r.unit === 'reps' ? (
                <>
                  <input className="input wk-in" inputMode="numeric" aria-label={`Повторы, подход ${k + 1}`} value={s.reps} placeholder="—" onChange={(e) => updateSet(i, k, { reps: e.target.value.replace(/\D/g, '') })} />
                  <input className="input wk-in" inputMode="decimal" aria-label={`Вес, подход ${k + 1}`} value={s.weight} placeholder="—" onChange={(e) => updateSet(i, k, { weight: e.target.value.replace(/[^\d.,]/g, '') })} />
                </>
              ) : (
                <input className="input wk-in span2" inputMode="numeric" aria-label={`Время, подход ${k + 1}`} value={s.dur} placeholder="—" onChange={(e) => updateSet(i, k, { dur: e.target.value.replace(/\D/g, '') })} />
              )}
              <Check on={s.done} onToggle={() => updateSet(i, k, { done: !s.done })} label={`Подход ${k + 1} выполнен`} />
              <button className="wk-x small" aria-label={`Удалить подход ${k + 1}`} onClick={() => update(i, (x) => ({ ...x, sets: x.sets.filter((_, j) => j !== k) }))}>
                ×
              </button>
            </div>
          ))}
          <button
            className="link-btn"
            onClick={() =>
              update(i, (x) => ({
                ...x,
                sets: [...x.sets, { ...(x.sets[x.sets.length - 1] ?? { reps: '10', weight: '', dur: '60' }), done: false }],
              }))
            }
          >
            + Подход
          </button>
        </div>
      ))}

      <button className="dashed" style={{ marginBottom: 10 }} onClick={() => setPicking(true)}>
        + Добавить упражнение
      </button>
      {!workout && (
        <button className="link-btn" style={{ marginBottom: 6 }} onClick={regenerate}>
          ↻ Подобрать план заново
        </button>
      )}
      <p className="hint" style={{ marginTop: 6 }}>
        План составляется по простым правилам и не является медицинской рекомендацией. Ориентируйтесь на самочувствие.
      </p>

      {error && <p className="error-text">{error}</p>}
      {done ? (
        <div className="btn-row">
          <button className="btn ghost" onClick={() => onSave(false)} disabled={save.isPending}>
            Сохранить
          </button>
          <button
            className="btn ghost"
            onClick={async () => {
              await reopen.mutateAsync(workout!.id);
              onClose();
            }}
          >
            Вернуть в план
          </button>
        </div>
      ) : (
        <div className="btn-row">
          <button className="btn ghost" onClick={() => onSave(false)} disabled={save.isPending}>
            Сохранить
          </button>
          <button className="btn primary" onClick={() => onSave(true)} disabled={save.isPending}>
            Завершить
          </button>
        </div>
      )}
      {workout && (
        <button className="btn danger block" style={{ marginTop: 10 }} onClick={onDelete}>
          Удалить тренировку
        </button>
      )}
    </Sheet>
  );
}

// ── Выбор упражнения ──

function ExercisePicker({ onPick, onBack, onClose }: { onPick: (e: ExerciseInfo) => void; onBack: () => void; onClose: () => void }) {
  const { data: all = [] } = useExercises();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<MuscleGroup | 'all'>('all');
  const list = useMemo(
    () => all.filter((e) => (group === 'all' || e.group === group) && e.title.toLowerCase().includes(q.trim().toLowerCase())),
    [all, q, group],
  );

  return (
    <Sheet
      title={
        <button className="wk-back" onClick={onBack}>
          ‹ Упражнение
        </button>
      }
      onClose={onClose}
    >
      <input className="input" aria-label="Поиск упражнения" placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />
      <div className="chips">
        <button className={`chip${group === 'all' ? ' on' : ''}`} onClick={() => setGroup('all')}>
          Все
        </button>
        {(Object.keys(MUSCLE_GROUPS) as MuscleGroup[]).map((g) => (
          <button key={g} className={`chip${group === g ? ' on' : ''}`} onClick={() => setGroup(g)}>
            {MUSCLE_GROUPS[g]}
          </button>
        ))}
      </div>
      {list.length === 0 && <p className="empty">Ничего не нашлось. Своё упражнение можно добавить во вкладке «Упражнения».</p>}
      {list.map((e) => (
        <button key={e.id} className="menu-item" onClick={() => onPick(e)}>
          <span>
            {e.title}
            <small>
              {MUSCLE_GROUPS[e.group]}
              {e.unit === 'time' ? ' · на время' : ''}
              {!e.builtin ? ' · своё' : ''}
            </small>
          </span>
        </button>
      ))}
    </Sheet>
  );
}
