import { useMemo, useState } from 'react';
import {
  addDays,
  endOfMonth,
  startOfMonth,
  startOfWeek,
  type DateStr,
  type HabitDto,
  type TaskDto,
  type TaskStatus,
} from '@ognivo/shared';
import { PageHeader } from '../components/PageHeader';
import { Check, Segmented, Skeleton } from '../components/ui';
import { Ring } from '../components/Ring';
import { HabitSheet } from '../components/HabitSheet';
import { Icon } from '../components/Icon';
import { useApp } from '../lib/appContext';
import { useHabits, useSetTaskStatus, useTasks, useToggleHabit, useToggleTask } from '../lib/queries';
import { isDoneOn, isOverdue, occurrences, tasksForDay, type Occurrence } from '../lib/tasks';
import { capitalize, dayMonth, dayNum, MONTHS_NOM, relativeDay, WEEKDAYS_SHORT } from '../lib/format';
import { haptic } from '../lib/telegram';
import './Plan.css';

type View = 'list' | 'calendar' | 'board';

export function Plan() {
  const { today, openSettings, openTask } = useApp();
  const [day, setDay] = useState<DateStr>(today);
  const [view, setView] = useState<View>('list');
  const { data: tasks = [], isLoading } = useTasks();

  return (
    <>
      <PageHeader title="План" onSettings={openSettings} />
      <DaySummary day={day} setDay={setDay} tasks={tasks} loading={isLoading} />
      <Habits day={day} />

      <div className="plan-views">
        <Segmented
          options={[
            { value: 'list', label: 'Список' },
            { value: 'calendar', label: 'Календарь' },
            { value: 'board', label: 'Доска' },
          ]}
          value={view}
          onChange={setView}
        />
        <button className="plan-add" aria-label="Добавить задачу" onClick={() => openTask({ kind: 'task', date: day })}>
          <Icon name="plus" />
        </button>
      </div>

      {isLoading ? (
        <div className="card">
          <Skeleton />
          <Skeleton w="60%" />
        </div>
      ) : view === 'list' ? (
        <DayList day={day} tasks={tasks} />
      ) : view === 'calendar' ? (
        <Calendar day={day} setDay={setDay} tasks={tasks} />
      ) : (
        <Board tasks={tasks} />
      )}
    </>
  );
}

// ── Сводка дня и лента недели ──

function DaySummary(props: { day: DateStr; setDay: (d: DateStr) => void; tasks: TaskDto[]; loading: boolean }) {
  const { today } = useApp();
  const { day, setDay, tasks } = props;
  const week = startOfWeek(day);
  const list = useMemo(() => tasksForDay(tasks, day, today), [tasks, day, today]);
  const done = list.filter((o) => isDoneOn(o.task, o.date)).length;
  const overdue = list.filter((o) => isOverdue(o.task, today)).length;
  const busy = useMemo(() => {
    const set = new Set(occurrences(tasks, week, addDays(week, 6)).map((o) => o.date));
    return set;
  }, [tasks, week]);

  return (
    <div className="card plan-summary">
      <div className="card-head">
        <span className="card-title">{day === today ? 'Сегодня в плане' : capitalize(relativeDay(day, today))}</span>
        {day !== today && (
          <button className="link-btn" onClick={() => setDay(today)}>
            К сегодня
          </button>
        )}
      </div>
      <div className="plan-stats">
        <Ring value={list.length ? done / list.length : 0}>
          <div>
            <b className="ring-num">{list.length ? Math.round((done / list.length) * 100) : 0}%</b>
          </div>
        </Ring>
        <div className="stat">
          <b>{list.length}</b>
          <span>всего</span>
        </div>
        <div className="stat">
          <b className="inc">{done}</b>
          <span>готово</span>
        </div>
        <div className="stat">
          <b className="exp">{overdue}</b>
          <span>просрочено</span>
        </div>
      </div>

      <div className="week-strip">
        <button className="week-nav" aria-label="Предыдущая неделя" onClick={() => setDay(addDays(day, -7))}>
          ‹
        </button>
        {Array.from({ length: 7 }, (_, i) => addDays(week, i)).map((d, i) => (
          <button
            key={d}
            className={`week-day${d === day ? ' on' : ''}${d === today ? ' today' : ''}`}
            onClick={() => {
              haptic();
              setDay(d);
            }}
          >
            <span>{WEEKDAYS_SHORT[i]}</span>
            <b>{dayNum(d)}</b>
            <i className={busy.has(d) ? 'dot' : 'dot empty'} />
          </button>
        ))}
        <button className="week-nav" aria-label="Следующая неделя" onClick={() => setDay(addDays(day, 7))}>
          ›
        </button>
      </div>
    </div>
  );
}

// ── Привычки ──

function Habits({ day }: { day: DateStr }) {
  const week = startOfWeek(day);
  const range = { from: week, to: addDays(week, 6) };
  const { data: habits, isLoading } = useHabits(range);
  const toggle = useToggleHabit();
  const [sheet, setSheet] = useState<{ habit?: HabitDto } | null>(null);

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title plan-h">Привычки</span>
        <button className="mini-add" aria-label="Добавить привычку" onClick={() => setSheet({})}>
          +
        </button>
      </div>
      {isLoading ? (
        <Skeleton />
      ) : !habits?.length ? (
        <p className="empty">Вода, сон, витамины — добавьте то, что хотите делать каждый день.</p>
      ) : (
        habits.map((h) => (
          <div key={h.id} className="habit">
            <button className="habit-title" onClick={() => setSheet({ habit: h })}>
              <span className="habit-emoji">{h.emoji}</span>
              <span className="ellipsis">{h.title}</span>
            </button>
            <div className="habit-week" aria-label="Отметки за неделю">
              {Array.from({ length: 7 }, (_, i) => addDays(week, i)).map((d) => (
                <i key={d} className={`${h.checks.includes(d) ? 'on' : ''}${d === day ? ' cur' : ''}`} />
              ))}
            </div>
            <Check on={h.checks.includes(day)} onToggle={() => toggle.mutate({ id: h.id, date: day })} label={`Отметить «${h.title}»`} />
          </div>
        ))
      )}
      {sheet && <HabitSheet habit={sheet.habit} onClose={() => setSheet(null)} />}
    </div>
  );
}

// ── Строка задачи ──

const REPEAT_LABEL = { none: '', day: 'каждый день', week: 'каждую неделю', month: 'каждый месяц' } as const;

function TaskRow({ o, showDate = false }: { o: Occurrence; showDate?: boolean }) {
  const { today, openTask } = useApp();
  const toggle = useToggleTask();
  const { task, date } = o;
  const done = isDoneOn(task, date);
  const over = isOverdue(task, today);
  const meta = [
    over ? `просрочено · ${dayMonth(task.date!)}` : showDate && task.date ? capitalize(relativeDay(date, today)) : '',
    task.time ?? '',
    REPEAT_LABEL[task.repeat],
    task.repeat === 'none' && task.status === 'in_progress' ? 'в процессе' : '',
  ].filter(Boolean);

  return (
    <div className={`task-row${done ? ' done' : ''}`} onClick={() => openTask({ task })}>
      {task.kind === 'event' ? (
        <span className="event-mark" aria-label="Событие">
          ●
        </span>
      ) : (
        <Check on={done} onToggle={() => toggle.mutate({ id: task.id, date: task.repeat === 'none' ? undefined : date })} />
      )}
      <div className="task-body">
        <div className="task-title">{task.title}</div>
        {meta.length > 0 && <div className={`task-meta${over ? ' over' : ''}`}>{meta.join(' · ')}</div>}
        {task.comment && <div className="task-comment">{task.comment}</div>}
      </div>
    </div>
  );
}

// ── Список ──

function DayList({ day, tasks }: { day: DateStr; tasks: TaskDto[] }) {
  const { today, openTask } = useApp();
  const dayTasks = useMemo(() => tasksForDay(tasks, day, today), [tasks, day, today]);
  const events = useMemo(() => occurrences(tasks.filter((t) => t.kind === 'event'), day, day), [tasks, day]);
  const undated = tasks.filter((t) => !t.date && t.status !== 'done');
  const undatedDone = tasks.filter((t) => !t.date && t.status === 'done');

  if (!dayTasks.length && !events.length && !undated.length) {
    return (
      <button className="card plan-empty" onClick={() => openTask({ kind: 'task', date: day })}>
        <span className="plan-empty-ic">🗓</span>
        Здесь появятся ваши задачи и события.
        <br />
        Нажмите, чтобы добавить первую.
      </button>
    );
  }

  return (
    <>
      {events.length > 0 && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 6 }}>События</div>
          {events.map((o) => (
            <TaskRow key={o.task.id} o={o} />
          ))}
        </div>
      )}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 6 }}>Задачи</div>
        {dayTasks.length ? dayTasks.map((o) => <TaskRow key={o.task.id + o.date} o={o} />) : <p className="empty">На этот день задач нет.</p>}
      </div>
      {(undated.length > 0 || undatedDone.length > 0) && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 6 }}>Без даты</div>
          {[...undated, ...undatedDone].map((t) => (
            <TaskRow key={t.id} o={{ task: t, date: today }} />
          ))}
        </div>
      )}
    </>
  );
}

// ── Календарь ──

function Calendar({ day, setDay, tasks }: { day: DateStr; setDay: (d: DateStr) => void; tasks: TaskDto[] }) {
  const { today } = useApp();
  const [month, setMonth] = useState(startOfMonth(day));
  const gridStart = startOfWeek(month);
  const gridEnd = addDays(startOfWeek(endOfMonth(month)), 6);
  const days: DateStr[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const byDate = useMemo(() => {
    const m = new Map<DateStr, { tasks: number; events: number; done: number }>();
    for (const o of occurrences(tasks, gridStart, gridEnd)) {
      const v = m.get(o.date) ?? { tasks: 0, events: 0, done: 0 };
      if (o.task.kind === 'event') v.events++;
      else if (isDoneOn(o.task, o.date)) v.done++;
      else v.tasks++;
      m.set(o.date, v);
    }
    return m;
  }, [tasks, gridStart, gridEnd]);

  const shiftMonth = (n: number) => {
    const y = Number(month.slice(0, 4));
    const mo = Number(month.slice(5, 7)) - 1 + n;
    const d = new Date(Date.UTC(y, mo, 1));
    setMonth(d.toISOString().slice(0, 10));
  };

  return (
    <>
      <div className="card calendar">
        <div className="card-head">
          <button className="week-nav" aria-label="Предыдущий месяц" onClick={() => shiftMonth(-1)}>
            ‹
          </button>
          <span className="card-title">
            {MONTHS_NOM[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)}
          </span>
          <button className="week-nav" aria-label="Следующий месяц" onClick={() => shiftMonth(1)}>
            ›
          </button>
        </div>
        <div className="cal-grid">
          {WEEKDAYS_SHORT.map((w) => (
            <span key={w} className="cal-wd">
              {w}
            </span>
          ))}
          {days.map((d) => {
            const info = byDate.get(d);
            const out = d.slice(0, 7) !== month.slice(0, 7);
            return (
              <button
                key={d}
                className={`cal-day${d === day ? ' on' : ''}${d === today ? ' today' : ''}${out ? ' out' : ''}`}
                onClick={() => setDay(d)}
              >
                {dayNum(d)}
                <span className="cal-dots">
                  {info?.events ? <i className="ev" /> : null}
                  {info?.tasks ? <i className="tk" /> : null}
                  {info?.done ? <i className="dn" /> : null}
                </span>
              </button>
            );
          })}
        </div>
        <div className="cal-legend">
          <span><i className="ev" /> события</span>
          <span><i className="tk" /> задачи</span>
          <span><i className="dn" /> выполнено</span>
        </div>
      </div>
      <DayList day={day} tasks={tasks} />
    </>
  );
}

// ── Доска ──

const COLUMNS: { status: TaskStatus; title: string }[] = [
  { status: 'planned', title: 'Запланировано' },
  { status: 'in_progress', title: 'В процессе' },
  { status: 'done', title: 'Готово' },
];

function Board({ tasks }: { tasks: TaskDto[] }) {
  const { today, openTask } = useApp();
  const setStatus = useSetTaskStatus();
  // На доске — обычные (неповторяющиеся) задачи; выполненные — только за последние 2 недели
  const items = tasks.filter(
    (t) => t.kind === 'task' && t.repeat === 'none' && !(t.status === 'done' && t.date && t.date < addDays(today, -14)),
  );

  return (
    <div className="board">
      {COLUMNS.map((col, ci) => {
        const list = items.filter((t) => t.status === col.status);
        return (
          <div key={col.status} className={`board-col col-${col.status}`}>
            <div className="board-head">
              {col.title} <span>{list.length}</span>
            </div>
            {list.length === 0 && <p className="board-empty">Пусто</p>}
            {list.map((t) => (
              <div key={t.id} className="board-card" onClick={() => openTask({ task: t })}>
                <div className="task-title">{t.title}</div>
                {t.date && (
                  <div className={`task-meta${isOverdue(t, today) ? ' over' : ''}`}>
                    {capitalize(relativeDay(t.date, today))}
                    {t.time ? ` · ${t.time}` : ''}
                  </div>
                )}
                <div className="board-move">
                  {ci > 0 && (
                    <button
                      aria-label={`Переместить в «${COLUMNS[ci - 1].title}»`}
                      onClick={(e) => {
                        e.stopPropagation();
                        haptic();
                        setStatus.mutate({ id: t.id, status: COLUMNS[ci - 1].status });
                      }}
                    >
                      ←
                    </button>
                  )}
                  {ci < COLUMNS.length - 1 && (
                    <button
                      aria-label={`Переместить в «${COLUMNS[ci + 1].title}»`}
                      onClick={(e) => {
                        e.stopPropagation();
                        haptic(ci + 1 === 2 ? 'success' : 'tap');
                        setStatus.mutate({ id: t.id, status: COLUMNS[ci + 1].status });
                      }}
                    >
                      →
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
