import { useCallback, useEffect, useMemo, useState } from 'react';
import { BottomNav, type Tab } from './components/BottomNav';
import { PageHeader } from './components/PageHeader';
import { Icon } from './components/Icon';
import { Sheet, ToastHost } from './components/ui';
import { TaskSheet } from './components/TaskSheet';
import { TransactionSheet } from './components/TransactionSheet';
import { Home } from './screens/Home';
import { AppContext, useApp, type AppApi, type MoneyView } from './lib/appContext';
import { useMe, useUpdateMe } from './lib/queries';
import { ApiError } from './lib/api';
import { getTelegramName, systemColorScheme, tg } from './lib/telegram';
import type { DateStr, TaskDto, TaskKind, ThemeMode } from '@ognivo/shared';

function useTheme(mode: ThemeMode | undefined, animations: boolean | undefined) {
  useEffect(() => {
    const apply = () => {
      const theme = !mode || mode === 'system' ? systemColorScheme() : mode;
      document.documentElement.dataset.theme = theme;
      const bg = theme === 'light' ? '#F6F1EA' : '#16141A';
      try {
        tg?.setHeaderColor(bg);
        tg?.setBackgroundColor(bg);
      } catch {
        /* старые клиенты Telegram */
      }
    };
    apply();
    tg?.onEvent('themeChanged', apply);
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [mode]);

  useEffect(() => {
    document.documentElement.dataset.anim = animations === false ? 'off' : 'on';
  }, [animations]);
}

type SheetState =
  | { type: 'task'; kind?: TaskKind; date?: DateStr | null; task?: TaskDto }
  | { type: 'tx'; kind: 'expense' | 'income' }
  | { type: 'quick' }
  | { type: 'settings' }
  | null;

const TITLES: Record<Exclude<Tab, 'home'>, string> = { plan: 'План', money: 'Деньги', sport: 'Спорт' };

export function App() {
  const me = useMe();
  const updateMe = useUpdateMe();
  const [tab, setTab] = useState<Tab>('home');
  const [, setMoneyView] = useState<MoneyView>('ops');
  const [sheet, setSheet] = useState<SheetState>(null);

  useTheme(me.data?.settings.theme, me.data?.settings.animations);

  // Сообщаем серверу часовой пояс устройства — от него зависят «сегодня» и напоминания
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (me.data && tz && me.data.timezone !== tz) updateMe.mutate({ timezone: tz });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.data?.timezone]);

  const close = useCallback(() => setSheet(null), []);

  const ctx = useMemo<AppApi | null>(() => {
    if (!me.data) return null;
    const s = me.data.settings;
    return {
      today: me.data.today,
      name: me.data.name || getTelegramName() || 'друг',
      settings: s,
      currency: s.currency,
      go: (t, sub) => {
        setTab(t);
        if (sub) setMoneyView(sub);
        window.scrollTo({ top: 0 });
      },
      openSettings: () => setSheet({ type: 'settings' }),
      openTask: (o) => setSheet({ type: 'task', ...o }),
      openTransaction: (kind) => setSheet({ type: 'tx', kind }),
    };
  }, [me.data]);

  if (me.isLoading) return <div className="splash">🔥</div>;
  if (!ctx) {
    const unauthorized = me.error instanceof ApiError && me.error.status === 401;
    return (
      <div className="page">
        <PageHeader title="Ognivo" />
        <div className="card">
          <p className="muted">
            {unauthorized
              ? 'Откройте Ognivo через бота в Telegram — так мы узнаем, что это вы.'
              : 'Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз.'}
          </p>
          {!unauthorized && (
            <button className="btn primary" style={{ marginTop: 14 }} onClick={() => me.refetch()}>
              Повторить
            </button>
          )}
        </div>
      </div>
    );
  }

  const s = ctx.settings;
  const visibleTabs: Tab[] = ['home', ...(['plan', 'money', 'sport'] as const).filter((t) => s.sections[t])];
  const activeTab = visibleTabs.includes(tab) ? tab : 'home';

  return (
    <AppContext.Provider value={ctx}>
      <main className="page" key={activeTab}>
        {activeTab === 'home' ? (
          <Home />
        ) : (
          <>
            <PageHeader title={TITLES[activeTab]} onSettings={ctx.openSettings} />
            <div className="card">
              <p className="muted">Этот раздел появится на следующих шагах этапа 4.</p>
            </div>
          </>
        )}
      </main>

      <button className="fab" aria-label="Добавить" onClick={() => setSheet({ type: 'quick' })}>
        <Icon name="plus" size={24} />
      </button>
      <BottomNav active={activeTab} visible={visibleTabs} onChange={(t) => ctx.go(t)} />

      {sheet?.type === 'task' && <TaskSheet kind={sheet.kind} date={sheet.date} task={sheet.task} onClose={close} />}
      {sheet?.type === 'tx' && <TransactionSheet kind={sheet.kind} onClose={close} />}
      {sheet?.type === 'quick' && <QuickAdd onPick={setSheet} go={ctx.go} />}
      {sheet?.type === 'settings' && (
        <Sheet title="Настройки" onClose={close}>
          <p className="muted">Экран настроек появится на последнем шаге этапа 4.</p>
        </Sheet>
      )}
      <ToastHost />
    </AppContext.Provider>
  );
}

function QuickAdd({ onPick, go }: { onPick: (s: SheetState) => void; go: AppApi['go'] }) {
  const { today, settings } = useApp();
  const items = [
    settings.sections.plan && { ic: '✅', title: 'Задача', sub: 'Дело на день или без даты', act: () => onPick({ type: 'task', kind: 'task', date: today }) },
    settings.sections.plan && { ic: '📅', title: 'Событие', sub: 'Встреча, запись, день рождения', act: () => onPick({ type: 'task', kind: 'event', date: today }) },
    settings.sections.money && { ic: '💸', title: 'Расход', sub: 'Покупка или платёж', act: () => onPick({ type: 'tx', kind: 'expense' }) },
    settings.sections.money && { ic: '💰', title: 'Доход', sub: 'Зарплата, подработка, возврат', act: () => onPick({ type: 'tx', kind: 'income' }) },
    settings.sections.sport && { ic: '🏋️', title: 'Тренировка', sub: 'Составить план на день', act: () => { onPick(null); go('sport'); } },
  ].filter(Boolean) as { ic: string; title: string; sub: string; act: () => void }[];

  return (
    <Sheet title="Добавить" onClose={() => onPick(null)}>
      {items.map((i) => (
        <button key={i.title} className="menu-item" onClick={i.act}>
          <span className="ic">{i.ic}</span>
          <span>
            {i.title}
            <small>{i.sub}</small>
          </span>
        </button>
      ))}
    </Sheet>
  );
}
