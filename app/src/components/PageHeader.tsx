import type { ReactNode } from 'react';
import { Icon } from './Icon';

interface Props {
  eyebrow?: ReactNode;
  title: ReactNode;
  onSettings?: () => void;
}

export function PageHeader({ eyebrow, title, onSettings }: Props) {
  return (
    <>
      <div className="page-top">
        <div className="eyebrow">
          <b>Ognivo</b>
          {eyebrow ? <> · {eyebrow}</> : null}
        </div>
        {onSettings && (
          <button className="icon-btn" onClick={onSettings} aria-label="Настройки">
            <Icon name="settings" />
          </button>
        )}
      </div>
      <h1 className="title">{title}</h1>
    </>
  );
}
