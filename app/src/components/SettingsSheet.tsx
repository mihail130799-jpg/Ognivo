import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CURRENCY_SYMBOL, type Currency, type DeepPartial, type UserSettings } from '@ognivo/shared';
import { Segmented, Sheet, Toggle, toast } from './ui';
import { useMe, useUpdateMe } from '../lib/queries';
import { api, ApiError } from '../lib/api';
import { useHomeScreen } from '../lib/useHomeScreen';
import { confirmAction, getInitData, isInTelegram, openLink, requestWriteAccess, telegramClientInfo } from '../lib/telegram';
import './SettingsSheet.css';

const APP_VERSION = '0.1';

function Section({ title, children, note }: { title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="card set-card">
      <div className="set-title">{title}</div>
      {children}
      {note && <p className="set-note">{note}</p>}
    </div>
  );
}

function Row({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="set-row">
      <span>{label}</span>
      <Toggle on={on} onChange={onChange} label={label} />
    </div>
  );
}

function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'только что';
  const m = Math.round(s / 60);
  return m < 60 ? `${m} мин назад` : `${Math.round(m / 60)} ч назад`;
}

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const update = useUpdateMe();
  const qc = useQueryClient();
  const [name, setName] = useState(me.data?.name ?? '');
  const [feedback, setFeedback] = useState<'bug' | 'idea' | null>(null);
  const home = useHomeScreen();
  const [, tick] = useState(0);

  // Обновляем подпись «синхронизировано N мин назад»
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!me.data) return null;
  const s = me.data.settings;
  const set = (patch: DeepPartial<UserSettings>) =>
    update.mutate({ settings: patch }, { onError: () => toast('Не удалось сохранить настройку') });

  function saveName() {
    const v = name.trim();
    if (!v || v === me.data!.name) return setName(me.data!.name);
    update.mutate({ name: v }, { onSuccess: () => toast('Имя сохранено') });
  }

  async function setNotif(key: keyof UserSettings['notifications'], v: boolean) {
    if (v && !(await requestWriteAccess())) {
      toast('Разрешите боту писать вам — иначе напоминания не придут');
      return;
    }
    set({ notifications: { [key]: v } });
  }

  async function sync() {
    await qc.invalidateQueries();
    toast('Данные обновлены');
  }

  async function exportData() {
    try {
      if (isInTelegram) {
        await api('/export/send', { method: 'POST' });
        toast('Файл отправлен в чат с ботом');
        return;
      }
      const res = await fetch('/api/export', { headers: { 'X-Telegram-Init-Data': getInitData() } });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `ognivo-export-${me.data!.today}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast(
        e instanceof ApiError && e.status === 409
          ? 'Сначала запустите бота командой /start'
          : e instanceof ApiError && e.status === 503
            ? 'Бот ещё не подключён'
            : 'Не удалось выгрузить данные',
      );
    }
  }

  async function wipe() {
    if (!(await confirmAction('Удалить все задачи, привычки, операции, копилки и тренировки? Это нельзя отменить.'))) return;
    if (!(await confirmAction('Точно удалить? Восстановить данные будет невозможно.'))) return;
    try {
      await api('/data', { method: 'DELETE' });
      await qc.invalidateQueries();
      toast('Все данные удалены');
      onClose();
    } catch {
      toast('Не удалось удалить данные');
    }
  }

  const updatedAt = me.dataUpdatedAt;

  return (
    <Sheet title="Настройки" onClose={onClose}>
      <Section title="Профиль">
        <label className="field-label" htmlFor="set-name">
          Имя
        </label>
        <input
          id="set-name"
          className="input"
          value={name}
          maxLength={64}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </Section>

      <Section title="Оформление">
        <span className="field-label">Тема</span>
        <Segmented
          small
          options={[
            { value: 'light', label: 'Светлая' },
            { value: 'dark', label: 'Тёмная' },
            { value: 'system', label: 'Как в системе' },
          ]}
          value={s.theme}
          onChange={(theme) => set({ theme })}
        />
        <span className="field-label">Валюта</span>
        <Segmented
          options={(Object.keys(CURRENCY_SYMBOL) as Currency[]).map((c) => ({ value: c, label: CURRENCY_SYMBOL[c] }))}
          value={s.currency}
          onChange={(currency) => set({ currency })}
        />
        <Row label="Анимации (фонарики и переходы)" on={s.animations} onChange={(animations) => set({ animations })} />
      </Section>

      <Section title="Разделы">
        <Row label="План" on={s.sections.plan} onChange={(v) => set({ sections: { plan: v } })} />
        <Row label="Деньги" on={s.sections.money} onChange={(v) => set({ sections: { money: v } })} />
        <Row label="Спорт" on={s.sections.sport} onChange={(v) => set({ sections: { sport: v } })} />
      </Section>

      <Section title="Блоки на главной">
        <Row label="Задачи" on={s.homeBlocks.tasks} onChange={(v) => set({ homeBlocks: { tasks: v } })} />
        <Row label="События" on={s.homeBlocks.events} onChange={(v) => set({ homeBlocks: { events: v } })} />
        <Row label="Тренировка" on={s.homeBlocks.workout} onChange={(v) => set({ homeBlocks: { workout: v } })} />
        <Row label="Финансы" on={s.homeBlocks.finance} onChange={(v) => set({ homeBlocks: { finance: v } })} />
        <Row label="Копилка" on={s.homeBlocks.savings} onChange={(v) => set({ homeBlocks: { savings: v } })} />
      </Section>

      <Section
        title="Уведомления"
        note="Напоминания приходят сообщением от бота в Telegram. Работает, когда Ognivo открыт из Telegram."
      >
        <Row label="Напоминания о задачах" on={s.notifications.tasks} onChange={(v) => setNotif('tasks', v)} />
        <Row label="Напоминания о событиях" on={s.notifications.events} onChange={(v) => setNotif('events', v)} />
        <Row label="Напоминания о тренировках" on={s.notifications.workouts} onChange={(v) => setNotif('workouts', v)} />
      </Section>

      <Section title="Аккаунт и вход">
        <p className="set-text">
          Вход через Telegram: {me.data.username ? `@${me.data.username}` : me.data.name}
        </p>
        <div className="set-sync">
          <span className={`sync-dot${me.isError ? ' err' : ''}`} />
          <span className="muted" style={{ flex: 1 }}>
            {me.isError ? 'Нет связи с сервером' : `Синхронизировано · ${timeAgo(updatedAt)}`}
          </span>
          <button className="btn ghost" onClick={sync}>
            Синхронизировать
          </button>
        </div>
      </Section>

      {isInTelegram && home.status !== 'loading' && (
        <Section title="Домашний экран">
          {home.status === 'added' ? (
            <p className="set-text muted" style={{ marginBottom: 0 }}>
              ✓ Ognivo уже на домашнем экране — открывается одним касанием, как обычное приложение.
            </p>
          ) : home.status === 'unsupported' ? (
            <p className="set-text muted" style={{ marginBottom: 0 }}>
              Эта версия Telegram не даёт добавить иконку прямо из Ognivo. Попробуйте так: нажмите «⋯» вверху справа →
              «Добавить на экран „Домой“». Если такого пункта нет — обновите Telegram в App Store.
            </p>
          ) : (
            <>
              <p className="set-text muted">Иконка Ognivo на экране телефона — открывается сразу, без поиска бота в чатах.</p>
              <button className="btn primary" onClick={home.add}>
                📲 Добавить на домашний экран
              </button>
            </>
          )}
        </Section>
      )}

      <Section title="Обратная связь">
        <p className="set-text muted">Нашли ошибку или есть идея? Напишите нам — ответим в чате с ботом.</p>
        <div className="btn-row">
          <button className="btn ghost" onClick={() => setFeedback('bug')}>
            Сообщить о баге
          </button>
          <button className="btn primary" onClick={() => setFeedback('idea')}>
            Предложить идею
          </button>
        </div>
      </Section>

      <Section title="Данные">
        <p className="set-text muted">Данные сохраняются в вашем аккаунте и доступны на любом устройстве, где вы вошли в Telegram.</p>
        <button className="set-link" onClick={() => openLink('/privacy.html')}>
          Политика конфиденциальности <span>↗</span>
        </button>
        <div className="set-actions">
          <button className="btn ghost" onClick={exportData}>
            Скачать данные (JSON)
          </button>
          <button className="btn danger" onClick={wipe}>
            Удалить все данные
          </button>
        </div>
      </Section>

      <p className="set-version">
        Ognivo · v{APP_VERSION}
        {telegramClientInfo() && (
          <>
            <br />
            {telegramClientInfo()} · ярлык: {home.status}
          </>
        )}
      </p>

      {feedback && <FeedbackSheet kind={feedback} onClose={() => setFeedback(null)} />}
    </Sheet>
  );
}

function FeedbackSheet({ kind, onClose }: { kind: 'bug' | 'idea'; onClose: () => void }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    if (text.trim().length < 3) return setError('Напишите чуть подробнее');
    setSending(true);
    try {
      await api('/feedback', { method: 'POST', body: JSON.stringify({ kind, text: text.trim() }) });
      toast('Спасибо! Сообщение отправлено');
      onClose();
    } catch {
      setError('Не удалось отправить. Проверьте соединение.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet title={kind === 'bug' ? 'Сообщить о баге' : 'Предложить идею'} onClose={onClose}>
      <textarea
        className="input"
        aria-label="Сообщение"
        autoFocus
        value={text}
        maxLength={4000}
        style={{ minHeight: 140, marginBottom: 12 }}
        placeholder={kind === 'bug' ? 'Что случилось и на каком экране?' : 'Что бы вы хотели добавить или изменить?'}
        onChange={(e) => setText(e.target.value)}
      />
      {error && <p className="error-text">{error}</p>}
      <button className="btn primary block" onClick={send} disabled={sending}>
        {sending ? 'Отправляю…' : 'Отправить'}
      </button>
    </Sheet>
  );
}
