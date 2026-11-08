import { useState } from 'react';
import { CURRENCY_SYMBOL, type SavingsGoalDto } from '@ognivo/shared';
import { Field, Segmented, Sheet, toast } from './ui';
import { Lantern } from './Lantern';
import { useAddMove, useDeleteGoal, useDeleteMove, useGoalMoves, useSaveGoal } from '../lib/queries';
import { useApp } from '../lib/appContext';
import { amountToInput, capitalize, money, parseAmount, relativeDay } from '../lib/format';
import { confirmAction } from '../lib/telegram';
import { ApiError } from '../lib/api';

const GOAL_EMOJIS = ['🏝', '🛡', '💻', '🚗', '🏠', '🎓', '💍', '📱', '✈️', '🎁', '🩺', '🏮'];


/** Создание и редактирование копилки (+ история пополнений). */
export function GoalSheet({ goal, onClose }: { goal?: SavingsGoalDto; onClose: () => void }) {
  const { currency, today } = useApp();
  const save = useSaveGoal();
  const del = useDeleteGoal();
  const moves = useGoalMoves(goal?.id);
  const delMove = useDeleteMove();
  const [title, setTitle] = useState(goal?.title ?? '');
  const [emoji, setEmoji] = useState(goal?.emoji ?? '🏝');
  const [target, setTarget] = useState(goal ? amountToInput(goal.target) : '');
  const [deadline, setDeadline] = useState(goal?.deadline ?? '');
  const [error, setError] = useState('');

  async function onSave() {
    const t = parseAmount(target);
    if (!title.trim()) return setError('Введите название');
    if (!t) return setError('Укажите сумму цели больше нуля');
    try {
      await save.mutateAsync({ id: goal?.id, title: title.trim(), emoji, target: t, deadline: deadline || null });
      toast(goal ? 'Сохранено' : 'Копилка создана');
      onClose();
    } catch {
      setError('Не удалось сохранить. Проверьте соединение.');
    }
  }

  async function onDelete() {
    if (!goal || !(await confirmAction(`Удалить копилку «${goal.title}» и всю её историю?`))) return;
    await del.mutateAsync(goal.id);
    toast('Копилка удалена');
    onClose();
  }

  async function onDeleteMove(moveId: string) {
    if (!goal || !(await confirmAction('Удалить эту запись из истории копилки?'))) return;
    try {
      await delMove.mutateAsync({ goalId: goal.id, moveId });
      moves.refetch();
    } catch (e) {
      toast(e instanceof ApiError && e.status === 400 ? 'Нельзя: баланс копилки станет отрицательным' : 'Не удалось удалить');
    }
  }

  return (
    <Sheet title={goal ? 'Копилка' : 'Новая копилка'} onClose={onClose}>
      <Field label="Название">
        <input className="input" aria-label="Название" value={title} maxLength={200} placeholder="Например, отпуск" onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Значок">
        <div className="emoji-grid six">
          {GOAL_EMOJIS.map((e) => (
            <button key={e} className={`emoji-btn${e === emoji ? ' on' : ''}`} onClick={() => setEmoji(e)} aria-label={e}>
              {e}
            </button>
          ))}
        </div>
      </Field>
      <div className="field-row">
        <Field label={`Цель, ${CURRENCY_SYMBOL[currency]}`}>
          <input
            className="input"
            aria-label="Сумма цели"
            inputMode="decimal"
            placeholder="100 000"
            value={target}
            onChange={(e) => setTarget(e.target.value.replace(/[^\d.,\s]/g, ''))}
          />
        </Field>
        <Field label="Срок (необязательно)">
          <input className="input" type="date" aria-label="Срок" min={today} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
      </div>
      {error && <p className="error-text">{error}</p>}
      <button className="btn primary block" onClick={onSave} disabled={save.isPending}>
        {save.isPending ? 'Сохраняю…' : 'Сохранить'}
      </button>

      {goal && (
        <>
          <div className="card-title" style={{ margin: '22px 0 8px' }}>
            История
          </div>
          {moves.data?.length ? (
            moves.data.map((m) => (
              <div key={m.id} className="op" onClick={() => onDeleteMove(m.id)} title="Нажмите, чтобы удалить">
                <div className="op-ic">{m.amount > 0 ? '⬆️' : '⬇️'}</div>
                <div className="op-t">
                  <b>{m.amount > 0 ? 'Пополнение' : 'Снятие'}</b>
                  <span>
                    {capitalize(relativeDay(m.date, today))}
                    {m.comment ? ` · ${m.comment}` : ''}
                  </span>
                </div>
                <div className={`op-s ${m.amount > 0 ? 'inc' : 'exp'}`}>{money(m.amount, currency, { sign: true })}</div>
              </div>
            ))
          ) : (
            <p className="empty">Пополнений пока не было.</p>
          )}
          <button className="btn danger block" style={{ marginTop: 16 }} onClick={onDelete} disabled={del.isPending}>
            Удалить копилку
          </button>
        </>
      )}
    </Sheet>
  );
}

/** Пополнить или снять деньги из копилки. */
export function MoveSheet({ goal, mode: initialMode, onClose }: { goal: SavingsGoalDto; mode: 'in' | 'out'; onClose: () => void }) {
  const { currency, today } = useApp();
  const add = useAddMove();
  const [mode, setMode] = useState(initialMode);
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const left = Math.max(0, goal.target - goal.saved);

  async function onSave() {
    const minor = parseAmount(amount);
    if (!minor) return setError('Введите сумму больше нуля');
    if (mode === 'out' && minor > goal.saved) return setError(`В копилке только ${money(goal.saved, currency)}`);
    try {
      await add.mutateAsync({ goalId: goal.id, amount: mode === 'in' ? minor : -minor, date: today, comment: comment.trim() });
      toast(mode === 'in' ? 'Копилка пополнена 🔥' : 'Деньги сняты');
      onClose();
    } catch {
      setError('Не удалось сохранить. Проверьте соединение.');
    }
  }

  return (
    <Sheet
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {goal.emoji} {goal.title}
        </span>
      }
      onClose={onClose}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <Lantern fill={goal.target ? goal.saved / goal.target : 0} />
        <div className="muted">
          Накоплено {money(goal.saved, currency)} из {money(goal.target, currency)}
          {left > 0 && (
            <>
              <br />
              Осталось {money(left, currency)}
            </>
          )}
        </div>
      </div>
      <Segmented
        options={[
          { value: 'in', label: 'Пополнить' },
          { value: 'out', label: 'Снять' },
        ]}
        value={mode}
        onChange={setMode}
      />
      <div className={`amount-input ${mode === 'in' ? 'inc' : ''}`}>
        <input
          aria-label="Сумма"
          inputMode="decimal"
          placeholder="0"
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.,\s]/g, ''))}
          style={{ width: `${Math.max(1, amount.length) + 0.5}ch` }}
        />
        <span>{CURRENCY_SYMBOL[currency]}</span>
      </div>
      {mode === 'in' && left > 0 && (
        <div className="chips" style={{ justifyContent: 'center' }}>
          {[100_000, 500_000, 1_000_000].filter((v) => v <= left).map((v) => (
            <button key={v} className="chip" onClick={() => setAmount(amountToInput(v))}>
              {money(v, currency)}
            </button>
          ))}
          <button className="chip" onClick={() => setAmount(amountToInput(left))}>
            Всё до цели
          </button>
        </div>
      )}
      <Field label="Комментарий">
        <input className="input" aria-label="Комментарий" value={comment} maxLength={200} placeholder="необязательно" onChange={(e) => setComment(e.target.value)} />
      </Field>
      {error && <p className="error-text">{error}</p>}
      <button className="btn primary block" onClick={onSave} disabled={add.isPending}>
        {add.isPending ? 'Сохраняю…' : mode === 'in' ? 'Пополнить' : 'Снять'}
      </button>
    </Sheet>
  );
}
