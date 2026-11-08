import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { haptic } from '../lib/telegram';

// ── Чипы ──

interface Option<T extends string> {
  value: T;
  label: ReactNode;
}

export function Chips<T extends string>(props: { options: Option<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="chips">
      {props.options.map((o) => (
        <button
          key={o.value}
          className={`chip${o.value === props.value ? ' on' : ''}`}
          onClick={() => {
            haptic();
            props.onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>(props: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  small?: boolean;
}) {
  return (
    <div className={`seg${props.small ? ' small' : ''}`} role="tablist">
      {props.options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === props.value}
          className={o.value === props.value ? 'on' : undefined}
          onClick={() => {
            haptic();
            props.onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Чекбокс с «искрой» ──

export function Check({ on, onToggle, label }: { on: boolean; onToggle: () => void; label?: string }) {
  const [spark, setSpark] = useState(0);
  return (
    <button
      className={`check${on ? ' on' : ''}`}
      aria-label={label ?? (on ? 'Снять отметку' : 'Отметить выполненным')}
      aria-pressed={on}
      onClick={(e) => {
        e.stopPropagation();
        if (!on) {
          haptic('success');
          setSpark((n) => n + 1);
        } else haptic();
        onToggle();
      }}
    >
      {spark > 0 && <span key={spark} className="spark" />}
    </button>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      className={`toggle${on ? ' on' : ''}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => {
        haptic();
        onChange(!on);
      }}
    />
  );
}

export function Progress({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="progress">
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    // div, а не label: внутри бывают группы кнопок, и клик по подписи не должен нажимать первую из них
    <div className="field" role="group" aria-label={label}>
      <span className="field-label">{label}</span>
      {children}
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w, marginBottom: 8 }} />;
}

// ── Шторка снизу ──

export function Sheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <>
      <div className="overlay" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-grab" />
        <div className="sheet-head">
          <div className="sheet-title">{title}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </>,
    document.body,
  );
}

// ── Всплывающее сообщение ──

let showToastImpl: (text: string) => void = () => {};
export const toast = (text: string) => showToastImpl(text);

export function ToastHost() {
  const [msg, setMsg] = useState<{ text: string; id: number } | null>(null);
  useEffect(() => {
    showToastImpl = (text) => setMsg({ text, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2400);
    return () => clearTimeout(t);
  }, [msg]);
  return msg ? (
    <div className="toast" key={msg.id}>
      {msg.text}
    </div>
  ) : null;
}
