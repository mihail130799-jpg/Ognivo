import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Lantern } from './Lantern';
import { api, ApiError } from '../lib/api';
import { onResume, openExternal, setToken } from '../lib/platform';
import './LoginScreen.css';

interface LoginStart {
  code: string;
  pin: string;
  url: string;
  expiresAt: string;
}

/** Вход вне Telegram (Android-приложение, браузер): подтверждение в боте → токен. */
export function LoginScreen() {
  const qc = useQueryClient();
  const [req, setReq] = useState<LoginStart | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const polling = useRef(false);

  // Сюда попадаем без входа или с недействительным токеном (вышли на другом устройстве) — забываем его
  useEffect(() => setToken(null), []);

  async function start() {
    setBusy(true);
    setError('');
    try {
      const r = await api<LoginStart>('/auth/login/start', { method: 'POST' });
      setReq(r);
      await openExternal(r.url);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 429
          ? 'Слишком много попыток. Подождите несколько минут.'
          : e instanceof ApiError && e.status === 503
            ? 'Вход временно недоступен. Попробуйте позже.'
            : 'Нет связи с сервером. Проверьте интернет.',
      );
    } finally {
      setBusy(false);
    }
  }

  // Ждём подтверждения: опрос раз в 2 с и сразу при возвращении из Telegram
  useEffect(() => {
    if (!req) return;
    let stopped = false;
    const poll = async () => {
      if (stopped || polling.current) return;
      polling.current = true;
      try {
        const r = await api<{ status: 'pending' } | { status: 'ok'; token: string }>('/auth/login/poll', {
          method: 'POST',
          body: JSON.stringify({ code: req.code }),
        });
        if (r.status === 'ok' && !stopped) {
          setToken(r.token);
          await qc.resetQueries();
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 410 && !stopped) {
          setReq(null);
          setError('Время на подтверждение вышло или вход отменён. Попробуйте ещё раз.');
        }
      } finally {
        polling.current = false;
      }
    };
    const t = setInterval(poll, 2000);
    const off = onResume(poll);
    return () => {
      stopped = true;
      clearInterval(t);
      off();
    };
  }, [req, qc]);

  return (
    <div className="login">
      <div className="login-hero">
        <Lantern fill={0.75} size={72} />
        <h1>Ognivo</h1>
        <p className="muted">Дела, деньги и тренировки — в одном месте.</p>
      </div>

      {!req ? (
        <div className="card login-card">
          <p className="login-text">
            Войдите через Telegram — откроются ваши записи из Ognivo. Пароль не нужен: вход подтверждается в боте
            @ognivo_tracker_bot.
          </p>
          <button className="btn primary block" onClick={start} disabled={busy}>
            {busy ? 'Открываю Telegram…' : 'Войти через Telegram'}
          </button>
          {error && <p className="error-text" style={{ marginTop: 12 }}>{error}</p>}
        </div>
      ) : (
        <div className="card login-card">
          <span className="field-label">Код входа</span>
          <div className="login-pin" aria-live="polite">
            {req.pin}
          </div>
          <p className="login-text">
            В Telegram откроется бот Ognivo. Проверьте, что код совпадает, и нажмите «✅ Подтвердить вход» — приложение
            откроется само.
          </p>
          <div className="login-wait muted">
            <span className="login-spinner" aria-hidden="true" /> Жду подтверждения…
          </div>
          <div className="btn-row" style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={() => openExternal(req.url)}>
              Открыть Telegram
            </button>
            <button className="btn ghost" onClick={() => setReq(null)}>
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
