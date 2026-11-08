import { useMemo, useState } from 'react';
import {
  addDays,
  CATEGORY_BY_ID,
  endOfMonth,
  startOfMonth,
  startOfWeek,
  type CategoryKind,
  type DateStr,
  type SavingsGoalDto,
} from '@ognivo/shared';
import { PageHeader } from '../components/PageHeader';
import { Chips, Progress, Segmented, Skeleton } from '../components/ui';
import { Donut } from '../components/Donut';
import { Lantern } from '../components/Lantern';
import { GoalSheet, MoveSheet } from '../components/GoalSheets';
import { useApp } from '../lib/appContext';
import { useMoneySummary, useSavings, useTransactions, type Range } from '../lib/queries';
import { capitalize, dayMonth, money, MONTHS_NOM, plural, relativeDay } from '../lib/format';
import { categoryColor } from '../lib/colors';
import './Money.css';

type Period = 'week' | 'month' | 'year' | 'all';

function periodRange(p: Period, anchor: DateStr): Range {
  switch (p) {
    case 'week': {
      const s = startOfWeek(anchor);
      return { from: s, to: addDays(s, 6) };
    }
    case 'month':
      return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
    case 'year':
      return { from: `${anchor.slice(0, 4)}-01-01`, to: `${anchor.slice(0, 4)}-12-31` };
    case 'all':
      return {};
  }
}

function shiftAnchor(p: Period, anchor: DateStr, dir: number): DateStr {
  if (p === 'week') return addDays(anchor, 7 * dir);
  const y = Number(anchor.slice(0, 4));
  const m = Number(anchor.slice(5, 7)) - 1;
  const d = p === 'month' ? new Date(Date.UTC(y, m + dir, 1)) : new Date(Date.UTC(y + dir, 0, 1));
  return d.toISOString().slice(0, 10);
}

function periodLabel(p: Period, r: Range): string {
  if (p === 'all' || !r.from || !r.to) return 'За всё время';
  if (p === 'year') return r.from.slice(0, 4);
  if (p === 'month') return `${MONTHS_NOM[Number(r.from.slice(5, 7)) - 1]} ${r.from.slice(0, 4)}`;
  return `${dayMonth(r.from)} — ${dayMonth(r.to)}`;
}

export function Money() {
  const { openSettings, moneyView, setMoneyView } = useApp();
  return (
    <>
      <PageHeader title="Деньги" onSettings={openSettings} />
      <Segmented
        options={[
          { value: 'ops', label: 'Операции' },
          { value: 'goals', label: 'Копилки' },
        ]}
        value={moneyView}
        onChange={setMoneyView}
      />
      {moneyView === 'ops' ? <Operations /> : <Goals />}
    </>
  );
}

// ── Операции ──

function Operations() {
  const { today, currency, openTransaction } = useApp();
  const [period, setPeriod] = useState<Period>('month');
  const [anchor, setAnchor] = useState<DateStr>(today);
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const range = periodRange(period, anchor);
  const summary = useMoneySummary(range);
  const txs = useTransactions(range);
  const s = summary.data;

  const cats = (s?.byCategory ?? []).filter((c) => c.kind === kind);
  const catTotal = cats.reduce((a, c) => a + c.total, 0);
  const isCurrent = period === 'all' || (range.from! <= today && today <= range.to!);

  const groups = useMemo(() => {
    const list = (txs.data ?? []).filter((t) => !catFilter || t.categoryId === catFilter);
    const map = new Map<DateStr, typeof list>();
    for (const t of list) map.set(t.date, [...(map.get(t.date) ?? []), t]);
    return [...map.entries()];
  }, [txs.data, catFilter]);

  return (
    <>
      <Chips
        options={[
          { value: 'week', label: 'Неделя' },
          { value: 'month', label: 'Месяц' },
          { value: 'year', label: 'Год' },
          { value: 'all', label: 'Всё время' },
        ]}
        value={period}
        onChange={(p) => {
          setPeriod(p);
          setAnchor(today);
          setCatFilter(null);
        }}
      />

      <div className="card money-summary">
        {period !== 'all' && (
          <div className="period-nav">
            <button className="week-nav" aria-label="Предыдущий период" onClick={() => setAnchor(shiftAnchor(period, anchor, -1))}>
              ‹
            </button>
            <span>{periodLabel(period, range)}</span>
            <button
              className="week-nav"
              aria-label="Следующий период"
              disabled={isCurrent}
              style={{ opacity: isCurrent ? 0.3 : 1 }}
              onClick={() => setAnchor(shiftAnchor(period, anchor, 1))}
            >
              ›
            </button>
          </div>
        )}
        {!s ? (
          <Skeleton h={80} />
        ) : (
          <>
            <div className="sum-row">
              <div>
                <div className="lbl">Доходы</div>
                <div className="val inc">{money(s.income, currency)}</div>
              </div>
              <div>
                <div className="lbl">Расходы</div>
                <div className="val exp">{money(s.expense, currency)}</div>
              </div>
            </div>
            <div className="lbl">Разница</div>
            <div className="money-big">{money(s.balance, currency, { sign: true })}</div>
          </>
        )}
        <p className="note">Разница считается только по внесённым записям и может не совпадать с остатком на банковской карте.</p>
        <div className="btn-row">
          <button className="btn primary" onClick={() => openTransaction('expense')}>
            − Расход
          </button>
          <button className="btn ghost" onClick={() => openTransaction('income')}>
            + Доход
          </button>
        </div>
      </div>

      {s && (s.income > 0 || s.expense > 0) && (
        <div className="card">
          <div className="card-head">
            <span className="card-title">По категориям</span>
          </div>
          <Segmented
            small
            options={[
              { value: 'expense', label: 'Расходы' },
              { value: 'income', label: 'Доходы' },
            ]}
            value={kind}
            onChange={(k) => {
              setKind(k);
              setCatFilter(null);
            }}
          />
          {cats.length === 0 ? (
            <p className="empty">{kind === 'expense' ? 'Расходов за этот период нет.' : 'Доходов за этот период нет.'}</p>
          ) : (
            <div className="donut-wrap">
              <Donut size={112} parts={cats.map((c) => ({ key: c.categoryId, value: c.total, color: categoryColor(c.categoryId) }))}>
                <div>
                  <b className="donut-sum">{money(catTotal, currency)}</b>
                  <span className="donut-cap">{kind === 'expense' ? 'расходы' : 'доходы'}</span>
                </div>
              </Donut>
              <div className="legend">
                {cats.map((c) => (
                  <button
                    key={c.categoryId}
                    className={`legend-row${catFilter === c.categoryId ? ' on' : ''}${catFilter && catFilter !== c.categoryId ? ' dim' : ''}`}
                    onClick={() => setCatFilter(catFilter === c.categoryId ? null : c.categoryId)}
                  >
                    <i style={{ background: categoryColor(c.categoryId) }} />
                    <span className="legend-name">
                      {CATEGORY_BY_ID[c.categoryId]?.emoji} {CATEGORY_BY_ID[c.categoryId]?.title ?? c.categoryId}
                    </span>
                    <b>{Math.round((c.total / catTotal) * 100)}%</b>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <span className="card-title money-h">История</span>
          {catFilter && (
            <button className="link-btn" onClick={() => setCatFilter(null)}>
              × {CATEGORY_BY_ID[catFilter]?.title}
            </button>
          )}
        </div>
        {txs.isLoading ? (
          <>
            <Skeleton h={40} />
            <Skeleton h={40} />
          </>
        ) : groups.length === 0 ? (
          <p className="empty">За этот период операций нет.</p>
        ) : (
          groups.map(([date, list]) => (
            <div key={date}>
              <div className="day-h">{capitalize(relativeDay(date, today))}</div>
              {list.map((t) => {
                const cat = CATEGORY_BY_ID[t.categoryId];
                return (
                  <button key={t.id} className="op" onClick={() => openTransaction(t.kind, t)}>
                    <div className="op-ic">{cat?.emoji ?? '📦'}</div>
                    <div className="op-t">
                      <b>{cat?.title ?? 'Другое'}</b>
                      {t.comment && <span>{t.comment}</span>}
                    </div>
                    <div className={`op-s ${t.kind === 'income' ? 'inc' : 'exp'}`}>
                      {money(t.kind === 'income' ? t.amount : -t.amount, currency, { sign: true })}
                    </div>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ── Копилки ──

function monthsUntil(today: DateStr, deadline: DateStr): number {
  const a = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7));
  const b = Number(deadline.slice(0, 4)) * 12 + Number(deadline.slice(5, 7));
  return Math.max(1, b - a);
}

function Goals() {
  const { today, currency } = useApp();
  const { data: goals, isLoading } = useSavings();
  const [edit, setEdit] = useState<{ goal?: SavingsGoalDto } | null>(null);
  const [move, setMove] = useState<{ goal: SavingsGoalDto; mode: 'in' | 'out' } | null>(null);
  const totalSaved = (goals ?? []).reduce((a, g) => a + g.saved, 0);

  return (
    <>
      {goals && goals.length > 0 && (
        <div className="card goals-total">
          <div className="lbl">Всего в копилках</div>
          <div className="money-big">{money(totalSaved, currency)}</div>
          <div className="muted">
            {goals.length} {plural(goals.length, ['цель', 'цели', 'целей'])}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="card">
          <Skeleton h={60} />
        </div>
      ) : !goals?.length ? (
        <div className="card goals-empty">
          <Lantern fill={0.15} size={64} />
          <div className="card-title">Заведите первую копилку</div>
          <p className="muted">Отпуск, новая техника или подушка безопасности — фонарик будет разгораться по мере накоплений.</p>
        </div>
      ) : (
        goals.map((g) => {
          const pct = g.target ? g.saved / g.target : 0;
          const left = Math.max(0, g.target - g.saved);
          const perMonth = g.deadline && left > 0 && g.deadline >= today ? Math.ceil(left / monthsUntil(today, g.deadline)) : 0;
          return (
            <div key={g.id} className="card goal">
              <div className="goal-main" onClick={() => setEdit({ goal: g })}>
                <Lantern fill={pct} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="card-head" style={{ marginBottom: 2 }}>
                    <span className="card-title ellipsis">
                      {g.emoji} {g.title}
                    </span>
                    <span className="muted">{pct >= 1 ? '🎉' : `${Math.floor(pct * 100)}%`}</span>
                  </div>
                  <div className="muted" style={{ marginBottom: 8 }}>
                    {money(g.saved, currency)} из {money(g.target, currency)}
                  </div>
                  <Progress value={pct} />
                  {g.deadline && (
                    <div className="goal-deadline">
                      до {dayMonth(g.deadline)} {g.deadline.slice(0, 4) !== today.slice(0, 4) ? g.deadline.slice(0, 4) : ''}
                      {perMonth > 0 && ` · ≈ ${money(perMonth, currency)} в месяц`}
                      {g.deadline < today && left > 0 && ' · срок прошёл'}
                    </div>
                  )}
                </div>
              </div>
              <div className="btn-row" style={{ marginTop: 14 }}>
                <button className="btn primary" onClick={() => setMove({ goal: g, mode: 'in' })}>
                  + Пополнить
                </button>
                <button className="btn ghost" disabled={g.saved <= 0} onClick={() => setMove({ goal: g, mode: 'out' })}>
                  − Снять
                </button>
              </div>
            </div>
          );
        })
      )}

      <button className="dashed" onClick={() => setEdit({})}>
        + Новая копилка
      </button>

      {edit && <GoalSheet goal={edit.goal} onClose={() => setEdit(null)} />}
      {move && <MoveSheet goal={move.goal} mode={move.mode} onClose={() => setMove(null)} />}
    </>
  );
}
