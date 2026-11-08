import { useMemo, useState } from 'react';
import { addDays, CATEGORY_BY_ID, endOfMonth, startOfMonth, weekday, type WorkoutDto } from '@ognivo/shared';
import { PageHeader } from '../components/PageHeader';
import { Check, Chips, Progress, Skeleton } from '../components/ui';
import { Lantern } from '../components/Lantern';
import { useApp } from '../lib/appContext';
import { useMoneySummary, useSavings, useTasks, useToggleTask, useWorkouts } from '../lib/queries';
import { isDoneOn, isOverdue, occurrences, tasksForDay } from '../lib/tasks';
import { capitalize, dayMonth, dayNum, money, monthName, monthShort, plural, relativeDay, weekdayLong } from '../lib/format';
import { categoryColor } from '../lib/colors';
import './Home.css';

type Filter = 'all' | 'tasks' | 'money' | 'sport';

export function Home() {
  const app = useApp();
  const { settings } = app;
  const [filter, setFilter] = useState<Filter>('all');

  const filters = [
    { value: 'all' as const, label: 'Все' },
    ...(settings.sections.plan ? [{ value: 'tasks' as const, label: 'Дела' }] : []),
    ...(settings.sections.money ? [{ value: 'money' as const, label: 'Деньги' }] : []),
    ...(settings.sections.sport ? [{ value: 'sport' as const, label: 'Спорт' }] : []),
  ];

  const show = (group: Exclude<Filter, 'all'>, block: keyof typeof settings.homeBlocks) => {
    const section = group === 'tasks' ? 'plan' : group;
    return settings.sections[section] && settings.homeBlocks[block] && (filter === 'all' || filter === group);
  };

  const showTasks = show('tasks', 'tasks');
  const showWorkout = show('sport', 'workout');

  return (
    <>
      <PageHeader
        eyebrow={`${weekdayLong(app.today)}, ${dayMonth(app.today)}`}
        title={
          <>
            Привет,
            <br />
            <span className="home-name">{app.name}</span> 🔥
          </>
        }
        onSettings={app.openSettings}
      />

      {filters.length > 2 && <Chips options={filters} value={filter} onChange={setFilter} />}

      {(showTasks || showWorkout) && (
        <div className={`grid2${showTasks && showWorkout ? '' : ' single'}`}>
          {showTasks && <DayPlanCard />}
          {showWorkout && <WorkoutCard />}
        </div>
      )}
      {show('money', 'finance') && <FinanceCard />}
      {show('money', 'savings') && <SavingsCard />}
      {show('tasks', 'events') && <EventsCard />}

      {filter === 'all' && !Object.values(settings.homeBlocks).some(Boolean) && (
        <div className="card empty">Все блоки на главной скрыты. Включите нужные в настройках.</div>
      )}
    </>
  );
}

// ── План на день ──

function DayPlanCard() {
  const { today, openTask, go } = useApp();
  const { data: tasks, isLoading } = useTasks();
  const toggle = useToggleTask();
  const list = useMemo(() => (tasks ? tasksForDay(tasks, today, today) : []), [tasks, today]);
  const shown = list.slice(0, 5);
  const rest = list.length - shown.length;

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">План на день</span>
        <button className="mini-add" aria-label="Добавить задачу" onClick={() => openTask({ kind: 'task', date: today })}>
          +
        </button>
      </div>
      {isLoading ? (
        <>
          <Skeleton />
          <Skeleton w="70%" />
        </>
      ) : list.length === 0 ? (
        <p className="empty">На сегодня задач нет. Добавьте первую — или просто отдохните.</p>
      ) : (
        <>
          {shown.map(({ task, date }) => {
            const done = isDoneOn(task, date);
            const over = isOverdue(task, today);
            return (
              <div key={task.id + date} className={`home-task${done ? ' done' : ''}`} onClick={() => openTask({ task })}>
                <Check on={done} onToggle={() => toggle.mutate({ id: task.id, date: task.repeat === 'none' ? undefined : date })} />
                <span className="t">
                  {task.title}
                  {(over || task.time) && (
                    <span className={`time${over ? ' over' : ''}`}>{over ? `просрочено · ${dayMonth(task.date!)}` : task.time}</span>
                  )}
                </span>
              </div>
            );
          })}
          {rest > 0 && (
            <button className="link-btn" onClick={() => go('plan')}>
              Ещё {rest} {plural(rest, ['задача', 'задачи', 'задач'])} →
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Тренировка ──

function workoutProgress(w: WorkoutDto) {
  const sets = w.exercises.flatMap((e) => e.sets);
  return { done: sets.filter((s) => s.done).length, total: sets.length };
}

function WorkoutCard() {
  const { today, settings, go } = useApp();
  const { data, isLoading } = useWorkouts({ from: today, to: today });
  const w = data?.[0];
  const trainingDay = settings.trainingDays.includes(weekday(today));

  return (
    <div className="card home-workout clickable" onClick={() => go('sport')}>
      <div className="muted">Тренировка</div>
      {isLoading ? (
        <Skeleton h={22} />
      ) : w ? (
        <>
          <div className="home-workout-title">{w.title}</div>
          <div className="muted">
            {w.exercises.length} {plural(w.exercises.length, ['упражнение', 'упражнения', 'упражнений'])}
          </div>
          <div className="ex-dots">
            {w.exercises.map((e, i) => (
              <i key={i} className={e.sets.length > 0 && e.sets.every((s) => s.done) ? 'on' : undefined} />
            ))}
          </div>
          {w.status === 'done' ? (
            <span className="btn ghost">Выполнена ✓</span>
          ) : (
            <span className="btn primary">{workoutProgress(w).done > 0 ? 'Продолжить' : 'Начать'}</span>
          )}
        </>
      ) : (
        <>
          <div className="home-workout-title">{trainingDay ? 'Тренировочный день' : 'День отдыха'}</div>
          <div className="muted" style={{ marginBottom: 14 }}>
            {trainingDay ? 'План на сегодня ещё не составлен' : 'Восстанавливайтесь — это тоже часть прогресса'}
          </div>
          <span className="btn primary">Составить план</span>
        </>
      )}
    </div>
  );
}

// ── Деньги за месяц ──

function FinanceCard() {
  const { today, currency, go, openTransaction } = useApp();
  const range = { from: startOfMonth(today), to: endOfMonth(today) };
  const { data: s, isLoading } = useMoneySummary(range);
  const expenses = s?.byCategory.filter((c) => c.kind === 'expense') ?? [];

  return (
    <div className="card clickable" onClick={() => go('money')}>
      <div className="card-head">
        <span className="card-title">Деньги за месяц</span>
        <span className="muted">{monthName(today)}</span>
      </div>
      {isLoading || !s ? (
        <Skeleton h={34} w="60%" />
      ) : (
        <>
          <div className="money-big">{money(s.balance, currency, { sign: true })}</div>
          <div className="muted">
            <span className="inc">Доходы {money(s.income, currency)}</span> ·{' '}
            <span className="exp">Расходы {money(s.expense, currency)}</span>
          </div>
          {expenses.length > 0 ? (
            <div className="catbar" title="Расходы по категориям">
              {expenses.map((c) => (
                <i key={c.categoryId} style={{ flex: c.total, background: categoryColor(c.categoryId) }} title={CATEGORY_BY_ID[c.categoryId]?.title} />
              ))}
            </div>
          ) : (
            <div className="btn-row" style={{ marginTop: 14 }}>
              <button
                className="btn primary"
                onClick={(e) => {
                  e.stopPropagation();
                  openTransaction('expense');
                }}
              >
                − Расход
              </button>
              <button
                className="btn ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  openTransaction('income');
                }}
              >
                + Доход
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Копилка ──

function SavingsCard() {
  const { currency, go } = useApp();
  const { data, isLoading } = useSavings();
  if (isLoading) return <div className="card"><Skeleton h={40} /></div>;
  // Показываем копилку, ближайшую к цели
  const goal = data?.slice().sort((a, b) => b.saved / b.target - a.saved / a.target)[0];

  if (!goal) {
    return (
      <div className="card home-row clickable" onClick={() => go('money', 'goals')}>
        <div style={{ flex: 1 }}>
          <div className="card-title" style={{ marginBottom: 4 }}>Копилка</div>
          <p className="muted">Заведите копилку для цели — отпуска, техники или подушки безопасности.</p>
        </div>
        <span className="round-add" aria-hidden="true">+</span>
      </div>
    );
  }

  const pct = goal.target > 0 ? goal.saved / goal.target : 0;
  return (
    <div className="card home-row clickable" onClick={() => go('money', 'goals')}>
      <Lantern fill={pct} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="card-head" style={{ marginBottom: 2 }}>
          <span className="card-title ellipsis">
            {goal.emoji} {goal.title}
          </span>
          <span className="muted">{Math.floor(pct * 100)}%</span>
        </div>
        <div className="muted" style={{ marginBottom: 8 }}>
          {money(goal.saved, currency)} из {money(goal.target, currency)}
        </div>
        <Progress value={pct} />
      </div>
    </div>
  );
}

// ── События ──

function EventsCard() {
  const { today, openTask } = useApp();
  const { data: tasks } = useTasks();
  const upcoming = useMemo(() => {
    const events = (tasks ?? []).filter((t) => t.kind === 'event');
    const seen = new Set<string>();
    // Ближайшее вхождение каждого события на 30 дней вперёд
    return occurrences(events, today, addDays(today, 30))
      .filter((o) => (seen.has(o.task.id) ? false : (seen.add(o.task.id), true)))
      .slice(0, 3);
  }, [tasks, today]);

  if (upcoming.length === 0) {
    return (
      <div className="card home-row">
        <span className="empty" style={{ flex: 1 }}>Событий пока нет.</span>
        <button className="btn primary" onClick={() => openTask({ kind: 'event', date: today })}>
          + Событие
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">Ближайшие события</span>
        <button className="mini-add" aria-label="Добавить событие" onClick={() => openTask({ kind: 'event', date: today })}>
          +
        </button>
      </div>
      {upcoming.map(({ task, date }) => (
        <div key={task.id} className="home-event" onClick={() => openTask({ task })}>
          <div className={`date-badge${date === today ? ' today' : ''}`}>
            {dayNum(date)}
            <small>{monthShort(date)}</small>
          </div>
          <div style={{ minWidth: 0 }}>
            <b className="ellipsis">{task.title}</b>
            <div className="muted">
              {capitalize(relativeDay(date, today))}
              {task.time ? ` · ${task.time}` : ''}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
