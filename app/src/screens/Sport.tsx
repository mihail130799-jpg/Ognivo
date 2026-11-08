import { useMemo, useState } from 'react';
import { addDays, MUSCLE_GROUPS, startOfWeek, weekday, type DateStr, type ExerciseInfo, type MuscleGroup, type WorkoutDto } from '@ognivo/shared';
import { PageHeader } from '../components/PageHeader';
import { Field, Segmented, Sheet, Skeleton, toast } from '../components/ui';
import { useApp } from '../lib/appContext';
import { useAddExercise, useDeleteExercise, useExercises, useUpdateMe, useWorkouts } from '../lib/queries';
import { capitalize, dayMonth, dayNum, MONTHS_NOM, plural, relativeDay, WEEKDAYS_SHORT } from '../lib/format';
import { doneSets, volume } from '../lib/workoutPlan';
import { confirmAction, haptic } from '../lib/telegram';
import './Sport.css';

type View = 'week' | 'history' | 'exercises';

export function Sport() {
  const { openSettings } = useApp();
  const [view, setView] = useState<View>('week');
  return (
    <>
      <PageHeader title="Спорт" onSettings={openSettings} />
      <Segmented
        options={[
          { value: 'week', label: 'Неделя' },
          { value: 'history', label: 'История' },
          { value: 'exercises', label: 'Упражнения' },
        ]}
        value={view}
        onChange={setView}
      />
      {view === 'week' ? <Week /> : view === 'history' ? <History /> : <Exercises />}
    </>
  );
}

// ── Неделя ──

function Week() {
  const { today, settings, openWorkout } = useApp();
  const updateMe = useUpdateMe();
  const [anchor, setAnchor] = useState(today);
  const week = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const { data: workouts, isLoading } = useWorkouts({ from: week, to: addDays(week, 6) });
  const byDate = useMemo(() => {
    const m = new Map<DateStr, WorkoutDto>();
    for (const w of workouts ?? []) if (!m.has(w.date)) m.set(w.date, w);
    return m;
  }, [workouts]);

  const sets = days.map((d) => (byDate.get(d) ? doneSets(byDate.get(d)!) : 0));
  const maxSets = Math.max(...sets, 1);
  const totalSets = sets.reduce((a, b) => a + b, 0);
  const todayW = byDate.get(today);
  const trainingToday = settings.trainingDays.includes(weekday(today));

  function toggleDay(i: number) {
    haptic();
    const cur = settings.trainingDays;
    const next = cur.includes(i) ? cur.filter((d) => d !== i) : [...cur, i];
    updateMe.mutate({ settings: { trainingDays: next } });
  }

  return (
    <>
      <div className="card sport-chart">
        <div className="card-head">
          <span className="card-title">Подходы по дням</span>
          <span className="muted">{totalSets} подх.</span>
        </div>
        <div className="bars">
          {days.map((d, i) => (
            <div key={d} className={`bar-col${d === today ? ' today' : ''}`}>
              <div className="bar-track">
                <div className={`bar${sets[i] ? ' on' : ''}`} style={{ height: `${Math.max(8, (sets[i] / maxSets) * 100)}%` }} />
              </div>
              <span>{WEEKDAYS_SHORT[i]}</span>
            </div>
          ))}
        </div>
        <div className="period-nav" style={{ margin: '12px -6px -6px' }}>
          <button className="week-nav" aria-label="Предыдущая неделя" onClick={() => setAnchor(addDays(anchor, -7))}>
            ‹
          </button>
          <span className="muted">
            {dayMonth(week)} — {dayMonth(addDays(week, 6))}
          </span>
          <button className="week-nav" aria-label="Следующая неделя" onClick={() => setAnchor(addDays(anchor, 7))}>
            ›
          </button>
        </div>
      </div>

      <div className="card home-row">
        <div style={{ flex: 1, minWidth: 0 }}>
          {todayW ? (
            <>
              <div className="card-title ellipsis">{todayW.title}</div>
              <div className="muted">
                {todayW.status === 'done' ? 'Сегодня · выполнена ✓' : `Сегодня · ${doneSets(todayW)} подх. выполнено`}
              </div>
            </>
          ) : (
            <div className="card-title" style={{ fontWeight: 600 }}>
              {trainingToday ? 'Сегодня тренировочный день' : 'Сегодня день отдыха'}
            </div>
          )}
        </div>
        <button className={`btn ${todayW?.status === 'done' ? 'ghost' : 'primary'}`} onClick={() => openWorkout(today, todayW)}>
          {todayW ? (todayW.status === 'done' ? 'Открыть' : 'Продолжить') : 'Составить план'}
        </button>
      </div>

      <div className="card">
        <div className="card-title sport-h" style={{ marginBottom: 12 }}>
          Тренировочные дни
        </div>
        <div className="train-days">
          {WEEKDAYS_SHORT.map((w, i) => (
            <button key={w} className={settings.trainingDays.includes(i) ? 'on' : undefined} aria-pressed={settings.trainingDays.includes(i)} onClick={() => toggleDay(i)}>
              {w}
            </button>
          ))}
        </div>
        <p className="hint" style={{ margin: '10px 0 0' }}>
          {settings.trainingDays.length
            ? `${settings.trainingDays.length} ${plural(settings.trainingDays.length, ['день', 'дня', 'дней'])} в неделю — по ним подбирается план и приходят напоминания.`
            : 'Отметьте дни, когда тренируетесь, — по ним подбирается план.'}
        </p>
      </div>

      {isLoading ? (
        <Skeleton h={60} />
      ) : (
        days.map((d) => {
          const w = byDate.get(d);
          const training = settings.trainingDays.includes(weekday(d));
          return (
            <button key={d} className={`card day-row${d === today ? ' today' : ''}`} onClick={() => openWorkout(d, w)}>
              <div className="day-date">
                <span>{WEEKDAYS_SHORT[weekday(d)]}</span>
                <b>{dayNum(d)}</b>
              </div>
              <div className="day-body">
                {w ? (
                  <>
                    <b>
                      {w.title} {w.status === 'done' && <span className="inc">✓</span>}
                    </b>
                    <span>
                      {w.exercises.length} {plural(w.exercises.length, ['упражнение', 'упражнения', 'упражнений'])}
                      {doneSets(w) > 0 && ` · ${doneSets(w)} подх.`}
                    </span>
                  </>
                ) : (
                  <>
                    <b className={training ? undefined : 'rest'}>{training ? 'Тренировка' : 'Отдых'}</b>
                    {training && <span>{d < today ? 'не было' : 'план не составлен'}</span>}
                  </>
                )}
              </div>
              <span className="chev">›</span>
            </button>
          );
        })
      )}
    </>
  );
}

// ── История ──

function History() {
  const { today, openWorkout } = useApp();
  const { data, isLoading } = useWorkouts({ to: today });
  const done = (data ?? []).filter((w) => w.status === 'done');

  const groups = useMemo(() => {
    const m = new Map<string, WorkoutDto[]>();
    for (const w of done) m.set(w.date.slice(0, 7), [...(m.get(w.date.slice(0, 7)) ?? []), w]);
    return [...m.entries()];
  }, [done]);

  const last30 = done.filter((w) => w.date > addDays(today, -30));

  if (isLoading) return <Skeleton h={80} />;
  if (!done.length) {
    return (
      <div className="card goals-empty">
        <span style={{ fontSize: 36 }}>🏋️</span>
        <div className="card-title">История пока пуста</div>
        <p className="muted">Завершённые тренировки появятся здесь — с подходами и тоннажем.</p>
      </div>
    );
  }

  return (
    <>
      <div className="card sport-stats">
        <div>
          <b>{last30.length}</b>
          <span>{plural(last30.length, ['тренировка', 'тренировки', 'тренировок'])} за 30 дней</span>
        </div>
        <div>
          <b>{last30.reduce((a, w) => a + doneSets(w), 0)}</b>
          <span>подходов</span>
        </div>
        <div>
          <b>{(last30.reduce((a, w) => a + volume(w), 0) / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} т</b>
          <span>тоннаж</span>
        </div>
      </div>
      {groups.map(([ym, list]) => (
        <div key={ym} className="card">
          <div className="card-title" style={{ marginBottom: 6 }}>
            {MONTHS_NOM[Number(ym.slice(5, 7)) - 1]} {ym.slice(0, 4)}
          </div>
          {list.map((w) => (
            <button key={w.id} className="op" onClick={() => openWorkout(w.date, w)}>
              <div className="op-ic">💪</div>
              <div className="op-t">
                <b>{w.title}</b>
                <span>
                  {capitalize(relativeDay(w.date, today))} · {doneSets(w)} подх.
                  {volume(w) > 0 ? ` · ${Math.round(volume(w)).toLocaleString('ru-RU')} кг` : ''}
                </span>
              </div>
              <span className="chev">›</span>
            </button>
          ))}
        </div>
      ))}
    </>
  );
}

// ── Упражнения ──

function Exercises() {
  const { data: all = [], isLoading } = useExercises();
  const { data: workouts = [] } = useWorkouts({});
  const del = useDeleteExercise();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);

  // Лучший вес по каждому упражнению — из выполненных подходов
  const best = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of workouts)
      for (const e of w.exercises)
        for (const s of e.sets) if (s.done && s.weight) m.set(e.exerciseId, Math.max(m.get(e.exerciseId) ?? 0, s.weight));
    return m;
  }, [workouts]);

  const filtered = all.filter((e) => e.title.toLowerCase().includes(q.trim().toLowerCase()));
  const groups = (Object.keys(MUSCLE_GROUPS) as MuscleGroup[])
    .map((g) => [g, filtered.filter((e) => e.group === g)] as const)
    .filter(([, list]) => list.length);

  async function onDelete(e: ExerciseInfo) {
    if (!(await confirmAction(`Удалить упражнение «${e.title}»? В прошлых тренировках оно останется.`))) return;
    await del.mutateAsync(e.id);
    toast('Упражнение удалено');
  }

  return (
    <>
      <div className="plan-views">
        <input className="input" aria-label="Поиск упражнения" placeholder="Поиск упражнения" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 14 }} />
        <button className="plan-add" aria-label="Своё упражнение" onClick={() => setAdding(true)}>
          +
        </button>
      </div>
      {isLoading && <Skeleton h={80} />}
      {groups.map(([g, list]) => (
        <div key={g} className="card">
          <div className="card-title" style={{ marginBottom: 6 }}>
            {MUSCLE_GROUPS[g]}
          </div>
          {list.map((e) => (
            <div key={e.id} className="ex-row">
              <span className="ex-name">
                {e.title}
                {!e.builtin && <span className="ex-tag">своё</span>}
              </span>
              {best.get(e.id) ? <span className="ex-best">🏆 {String(best.get(e.id)).replace('.', ',')} кг</span> : e.unit === 'time' ? <span className="ex-best muted">на время</span> : null}
              {!e.builtin && (
                <button className="wk-x small" aria-label={`Удалить «${e.title}»`} onClick={() => onDelete(e)}>
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
      {!isLoading && groups.length === 0 && <p className="empty">Ничего не нашлось.</p>}
      {adding && <NewExerciseSheet onClose={() => setAdding(false)} initialTitle={q} />}
    </>
  );
}

function NewExerciseSheet({ onClose, initialTitle }: { onClose: () => void; initialTitle: string }) {
  const add = useAddExercise();
  const [title, setTitle] = useState(initialTitle);
  const [group, setGroup] = useState<MuscleGroup>('other');
  const [unit, setUnit] = useState<'reps' | 'time'>('reps');
  const [error, setError] = useState('');

  async function onSave() {
    if (!title.trim()) return setError('Введите название');
    try {
      await add.mutateAsync({ title: title.trim(), group, unit });
      toast('Упражнение добавлено');
      onClose();
    } catch {
      setError('Не удалось сохранить. Проверьте соединение.');
    }
  }

  return (
    <Sheet title="Своё упражнение" onClose={onClose}>
      <Field label="Название">
        <input className="input" aria-label="Название" value={title} maxLength={200} autoFocus onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Группа мышц">
        <div className="chips" style={{ flexWrap: 'wrap' }}>
          {(Object.keys(MUSCLE_GROUPS) as MuscleGroup[]).map((g) => (
            <button key={g} className={`chip${g === group ? ' on' : ''}`} onClick={() => setGroup(g)}>
              {MUSCLE_GROUPS[g]}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Как считать">
        <Segmented
          options={[
            { value: 'reps', label: 'Повторы и вес' },
            { value: 'time', label: 'Время' },
          ]}
          value={unit}
          onChange={setUnit}
        />
      </Field>
      {error && <p className="error-text">{error}</p>}
      <button className="btn primary block" onClick={onSave} disabled={add.isPending}>
        Сохранить
      </button>
    </Sheet>
  );
}
