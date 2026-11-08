import { useState } from 'react';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, CURRENCY_SYMBOL, type CategoryKind, type TransactionDto } from '@ognivo/shared';
import { Field, Segmented, Sheet, toast } from './ui';
import { useDeleteTransaction, useSaveTransaction } from '../lib/queries';
import { useApp } from '../lib/appContext';
import { parseAmount } from '../lib/format';
import { confirmAction } from '../lib/telegram';
import './TransactionSheet.css';

interface Props {
  kind?: CategoryKind;
  tx?: TransactionDto;
  onClose: () => void;
}

function amountToInput(minor: number): string {
  return (minor / 100).toString().replace('.', ',');
}

export function TransactionSheet({ kind: initialKind = 'expense', tx, onClose }: Props) {
  const { today, currency } = useApp();
  const save = useSaveTransaction();
  const del = useDeleteTransaction();

  const [kind, setKind] = useState<CategoryKind>(tx?.kind ?? initialKind);
  const [amount, setAmount] = useState(tx ? amountToInput(tx.amount) : '');
  const [categoryId, setCategoryId] = useState(tx?.categoryId ?? (initialKind === 'income' ? 'salary' : 'groceries'));
  const [date, setDate] = useState(tx?.date ?? today);
  const [comment, setComment] = useState(tx?.comment ?? '');
  const [error, setError] = useState('');

  const cats = kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  function switchKind(k: CategoryKind) {
    setKind(k);
    setCategoryId(k === 'income' ? 'salary' : 'groceries');
  }

  async function onSave() {
    const minor = parseAmount(amount);
    if (!minor) return setError('Введите сумму больше нуля');
    setError('');
    try {
      await save.mutateAsync({ id: tx?.id, kind, amount: minor, categoryId, date, comment: comment.trim() });
      toast(tx ? 'Сохранено' : kind === 'income' ? 'Доход добавлен' : 'Расход добавлен');
      onClose();
    } catch {
      setError('Не удалось сохранить. Проверьте соединение.');
    }
  }

  async function onDelete() {
    if (!tx || !(await confirmAction('Удалить операцию?'))) return;
    await del.mutateAsync(tx.id);
    toast('Удалено');
    onClose();
  }

  const title = tx ? 'Операция' : kind === 'income' ? 'Новый доход' : 'Новый расход';

  return (
    <Sheet title={title} onClose={onClose}>
      <Segmented
        options={[
          { value: 'expense', label: 'Расход' },
          { value: 'income', label: 'Доход' },
        ]}
        value={kind}
        onChange={switchKind}
      />

      <div className={`amount-input ${kind === 'income' ? 'inc' : ''}`}>
        <input
          aria-label="Сумма"
          inputMode="decimal"
          placeholder="0"
          value={amount}
          autoFocus={!tx}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.,\s]/g, ''))}
          style={{ width: `${Math.max(1, amount.length) + 0.5}ch` }}
        />
        <span>{CURRENCY_SYMBOL[currency]}</span>
      </div>

      <div className="cats" role="radiogroup" aria-label="Категория">
        {cats.map((c) => (
          <button
            key={c.id}
            role="radio"
            aria-checked={c.id === categoryId}
            className={`cat${c.id === categoryId ? ' on' : ''}`}
            onClick={() => setCategoryId(c.id)}
          >
            <span className="e">{c.emoji}</span>
            {c.title}
          </button>
        ))}
      </div>

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
        <Field label="Комментарий">
          <input
            className="input"
            aria-label="Комментарий"
            value={comment}
            maxLength={200}
            placeholder="необязательно"
            onChange={(e) => setComment(e.target.value)}
          />
        </Field>
      </div>

      {error && <p className="error-text">{error}</p>}
      <button className="btn primary block" onClick={onSave} disabled={save.isPending}>
        {save.isPending ? 'Сохраняю…' : 'Сохранить'}
      </button>
      {tx && (
        <button className="btn danger block" style={{ marginTop: 10 }} onClick={onDelete} disabled={del.isPending}>
          Удалить
        </button>
      )}
    </Sheet>
  );
}
