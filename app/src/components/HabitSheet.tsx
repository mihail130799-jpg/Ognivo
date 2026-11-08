import { useState } from 'react';
import type { HabitDto } from '@ognivo/shared';
import { Field, Sheet, toast } from './ui';
import { useDeleteHabit, useSaveHabit } from '../lib/queries';
import { confirmAction } from '../lib/telegram';

const EMOJIS = ['💧', '😴', '💊', '🏃', '🧘', '📖', '🥗', '🦷', '🚶', '☀️', '📵', '✍️', '🧠', '🍎', '🛏', '✨'];
const SUGGESTIONS: [string, string][] = [
  ['💧', 'Выпить 2 л воды'],
  ['😴', 'Лечь до 23:00'],
  ['💊', 'Витамины'],
  ['🚶', '10 000 шагов'],
  ['📖', 'Читать 20 минут'],
  ['🧘', 'Медитация'],
];

export function HabitSheet({ habit, onClose }: { habit?: HabitDto; onClose: () => void }) {
  const save = useSaveHabit();
  const del = useDeleteHabit();
  const [title, setTitle] = useState(habit?.title ?? '');
  const [emoji, setEmoji] = useState(habit?.emoji ?? '💧');
  const [error, setError] = useState('');

  async function onSave() {
    if (!title.trim()) return setError('Введите название');
    try {
      await save.mutateAsync({ id: habit?.id, title: title.trim(), emoji });
      toast(habit ? 'Сохранено' : 'Привычка добавлена');
      onClose();
    } catch {
      setError('Не удалось сохранить. Проверьте соединение.');
    }
  }

  async function onDelete() {
    if (!habit || !(await confirmAction(`Удалить привычку «${habit.title}» вместе с отметками?`))) return;
    await del.mutateAsync(habit.id);
    toast('Привычка удалена');
    onClose();
  }

  return (
    <Sheet title={habit ? 'Привычка' : 'Новая привычка'} onClose={onClose}>
      {!habit && (
        <div className="chips" style={{ flexWrap: 'wrap' }}>
          {SUGGESTIONS.map(([e, t]) => (
            <button
              key={t}
              className="chip"
              onClick={() => {
                setEmoji(e);
                setTitle(t);
              }}
            >
              {e} {t}
            </button>
          ))}
        </div>
      )}
      <Field label="Название">
        <input
          className="input"
          aria-label="Название"
          value={title}
          maxLength={200}
          placeholder="Например, выпить воду"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSave()}
        />
      </Field>
      <Field label="Значок">
        <div className="emoji-grid">
          {EMOJIS.map((e) => (
            <button key={e} className={`emoji-btn${e === emoji ? ' on' : ''}`} onClick={() => setEmoji(e)} aria-label={e}>
              {e}
            </button>
          ))}
        </div>
      </Field>
      {error && <p className="error-text">{error}</p>}
      <button className="btn primary block" onClick={onSave} disabled={save.isPending}>
        {save.isPending ? 'Сохраняю…' : 'Сохранить'}
      </button>
      {habit && (
        <button className="btn danger block" style={{ marginTop: 10 }} onClick={onDelete} disabled={del.isPending}>
          Удалить
        </button>
      )}
    </Sheet>
  );
}
