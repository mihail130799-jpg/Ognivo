import { createContext, useContext } from 'react';
import type { Currency, DateStr, TaskDto, TaskKind, TransactionDto, UserSettings } from '@ognivo/shared';
import type { Tab } from '../components/BottomNav';

export type MoneyView = 'ops' | 'goals';

export interface AppApi {
  today: DateStr;
  name: string;
  settings: UserSettings;
  currency: Currency;
  /** Перейти в раздел (и, для «Денег», на нужную вкладку) */
  go: (tab: Tab, sub?: MoneyView) => void;
  openSettings: () => void;
  openTask: (opts?: { kind?: TaskKind; date?: DateStr | null; task?: TaskDto }) => void;
  openTransaction: (kind: 'expense' | 'income', tx?: TransactionDto) => void;
  /** Какая вкладка «Денег» открыта */
  moneyView: MoneyView;
  setMoneyView: (v: MoneyView) => void;
}

export const AppContext = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp вне AppContext');
  return ctx;
}
