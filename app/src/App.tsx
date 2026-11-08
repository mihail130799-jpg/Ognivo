import { useEffect, useState } from 'react';
import { BottomNav, type Tab } from './components/BottomNav';
import { PageHeader } from './components/PageHeader';
import { getTelegramName, systemColorScheme, tg } from './lib/telegram';
import { api } from './lib/api';

// Каркас: навигация и заглушки экранов. Сами разделы появятся на этапе 4.

function useSystemTheme() {
  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = systemColorScheme();
    };
    apply();
    tg?.onEvent('themeChanged', apply);
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
}

const today = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(
  new Date(),
);

const TITLES: Record<Exclude<Tab, 'home'>, string> = {
  plan: 'План',
  money: 'Деньги',
  sport: 'Спорт',
};

export function App() {
  useSystemTheme();
  const [tab, setTab] = useState<Tab>('home');
  const [apiStatus, setApiStatus] = useState<'…' | 'ok' | 'нет связи'>('…');

  useEffect(() => {
    api<{ ok: boolean }>('/health')
      .then(() => setApiStatus('ok'))
      .catch(() => setApiStatus('нет связи'));
  }, []);

  const name = getTelegramName() ?? 'друг';

  return (
    <>
      <main className="page" key={tab}>
        {tab === 'home' ? (
          <PageHeader
            eyebrow={today}
            title={
              <>
                Привет,
                <br />
                <span style={{ color: 'var(--accent)' }}>{name}</span> 🔥
              </>
            }
            onSettings={() => {}}
          />
        ) : (
          <PageHeader title={TITLES[tab]} onSettings={() => {}} />
        )}

        <div className="card">
          <p className="muted">
            Каркас приложения готов. Этот экран будет сделан на этапе 4.
            <br />
            Сервер: {apiStatus}
          </p>
        </div>
      </main>
      <BottomNav active={tab} visible={['home', 'plan', 'money', 'sport']} onChange={setTab} />
    </>
  );
}
