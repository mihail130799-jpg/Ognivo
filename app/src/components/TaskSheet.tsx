import { useState } from 'react';
import type { DateStr, Remind, Repeat, TaskDto, TaskKind, TaskStatus } from '@ognivo/shared';
import { Field, Segmented, Sheet, toast } from './ui';
import { useDeleteTask, useSaveTask } from '../lib/queries';
import { useApp } from '../lib/appContext';
import { capitalize, relativeDay } from '../lib/format';
import { confirmAction } from '../lib/telegram';

interface Props {
  task?: TaskDto;
  kind?: TaskKind;
  date?: DateStr | null;
  onClose: () => void;
}

const REPEAT = [
  { value: 'none', label: 'Нет' },
  { value: 'day', label: 'День' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
] as const;

const REMIND = [
  { value: 'none', label: 'Нет' },
  { value: 'ontime', label: 'Вовремя' },
  { value: '15m', label: '15 мин' },
  { value: '1h', label: '1 час' },
  { value: '1d', label: 'За день' },
] as const;

const STATUS = [
  { value: 'planned', label: 'Запланировано' },
  { value: 'in_progress', label: 'В процессе' },
  { value: 'done', label: 'Готово' },
] as const;

export function TaskSheet({ task, kind: initialKind, date: initialDate, onClose }: Props) {
  const { today, settings } = useApp();
  const save = useSaveTask();
  const del = useDeleteTask();

  const [kind, setKind] = useState<TaskKind>(task?.kind ?? initialKind ?? 'task');
  const [title, setTitle] = useState(task?.title ?? '');
  const [date, setDate] = useState<DateStr | null>(task ? task.date : initialDate === undefined ? today : initialDate);
  const [time, setTime] = useState(task?.time ?? '');
  const [repeat, setRepeat] = useState<Repeat>(task?.repeat ?? 'none');
  const [remind, setRemind] = useState<Remind>(task?.remind ?? (kind === 'event' ? '1h' : 'none'));
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'planned');
  const [comment, setComment] = useState(task?.comment ?? '');
  const [error, setError] = useState('');

  const notifOn = kind === 'event' ? settings.notifications.events : settings.notifications.tasks;
  const isEvent = kind === 'event';
  const sheetTitle = task
    ? isEvent
      ? 'Событие'
      : 'Задача'
    : date
      ? capitalize(relativeDay(date, today))
      : isEvent
        ? 'Новое событие'
        : 'Новая задача';

  async function onSave() {
    if (!title.trim()) return setError('Введите название');
    if (isEvent && !date) return setError('У события должна быть дата');
    setError('');
    try {
      await save.mutateAsync({
        id: task?.id,
        kind,
        title: title.trim(),
        date,
        time: date && time ? time : null,
        repeat: date ? repeat : 'none',
        remind: date ? remind : 'none',
        status: isEvent ? 'planned' : status,
        comment,
      });
      toast(task ? 'Сохранено' : isEvent ? 'Событие добавлено' : 'Задача добавлена');
      onClose();
    } catch {
      setError('Не удалось сохранить. Проверьте соединение.');
    }
  }

  async function onDelete() {
    if (!task || !(await confirmAction(`Удалить «${task.title}»?`))) return;
    await del.mutateAsync(task.id);
    toast('Удалено');
    onClose();
  }

  return (
    <Sheet title={sheetTitle} onClose={onClose}>
      {!task && (
        <Segmented
          options={[
            { value: 'task', label: 'Задача' },
            { value: 'event', label: 'Событие' },
          ]}
          value={kind}
          onChange={(k) => {
            setKind(k);
            if (k === 'event' && !date) setDate(today);
          }}
        />
      )}

      <Field label="Название">
        <input
          className="input"
          aria-label="Название"
          value={title}
          maxLength={200}
          autoFocus={!task}
          placeholder={isEvent ? 'Например, ужин с друзьями' : 'Например, позвонить маме'}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSave()}
        />
      </Field>

      {date !== null ? (
        <>
          <div className="field-row">
            <Field label="Дата">
              <input
                className="input"
                type="date"
                aria-label="Дата"
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
              />
            </Field>
            <Field label="Время">
              <input
                className="input"
                type="time"
                aria-label="Время"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </Field>
          </div>
          {!isEvent && (
            <button className="link-btn" style={{ marginTop: -8, marginBottom: 10 }} onClick={() => setDate(null)}>
              × Без даты
            </button>
          )}

          <Field label="Повторять">
            <Segmented small options={[...REPEAT]} value={repeat} onChange={setRepeat} />
          </Field>
          <Field label="Напомнить">
            <Segmented small options={[...REMIND]} value={remind} onChange={setRemind} />
          </Field>
          {remind !== 'none' && !notifOn && (
            <p className="hint">Уведомления для этого выключены — включите в Настройках → Уведомления.</p>
          )}
          {remind !== 'none' && !time && (
            <p className="hint">Без времени напоминание придёт в 9:00.</p>
          )}
        </>
      ) : (
        <button className="link-btn" style={{ marginBottom: 10 }} onClick={() => setDate(today)}>
          + Указать дату
        </button>
      )}

      {!isEvent && (
        <Field label="Статус">
          <Segmented small options={[...STATUS]} value={status} onChange={setStatus} />
        </Field>
      )}

      <Field label="Комментарий">
        <textarea
          className="input"
          aria-label="Комментарий"
          value={comment}
          maxLength={2000}
          onChange={(e) => setComment(e.target.value)}
        />
      </Field>

      {error && <p className="error-text">{error}</p>}
      <button className="btn primary block" onClick={onSave} disabled={save.isPending}>
        {save.isPending ? 'Сохраняю…' : 'Сохранить'}
      </button>
      {task && (
        <button className="btn danger block" style={{ marginTop: 10 }} onClick={onDelete} disabled={del.isPending}>
          Удалить
        </button>
      )}
    </Sheet>
  );
}
