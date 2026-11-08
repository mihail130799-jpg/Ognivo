import { Icon, type IconName } from './Icon';
import { haptic } from '../lib/telegram';
import './BottomNav.css';

export type Tab = 'home' | 'plan' | 'money' | 'sport';

const TABS: { id: Tab; icon: IconName; label: string }[] = [
  { id: 'home', icon: 'home', label: 'Главная' },
  { id: 'plan', icon: 'plan', label: 'План' },
  { id: 'money', icon: 'money', label: 'Деньги' },
  { id: 'sport', icon: 'sport', label: 'Спорт' },
];

interface Props {
  active: Tab;
  visible: Tab[];
  onChange: (tab: Tab) => void;
}

export function BottomNav({ active, visible, onChange }: Props) {
  return (
    <nav className="bottom-nav">
      {TABS.filter((t) => visible.includes(t.id)).map((t) => (
        <button
          key={t.id}
          className={t.id === active ? 'on' : undefined}
          onClick={() => {
            haptic();
            onChange(t.id);
          }}
        >
          <Icon name={t.icon} />
          {t.label}
        </button>
      ))}
    </nav>
  );
}
