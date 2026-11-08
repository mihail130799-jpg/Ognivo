import { useCallback, useEffect, useState } from 'react';
import { addToHomeScreen, checkHomeScreenStatus, haptic, type HomeScreenStatus } from './telegram';
import { toast } from '../components/ui';

/** Состояние ярлыка на домашнем экране и действие «добавить». */
export function useHomeScreen() {
  const [status, setStatus] = useState<HomeScreenStatus | 'loading'>('loading');

  useEffect(() => {
    let alive = true;
    checkHomeScreenStatus().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);

  const add = useCallback(() => {
    haptic();
    addToHomeScreen(() => {
      setStatus('added');
      toast('Ognivo добавлен на домашний экран 🔥');
    });
  }, []);

  return {
    status,
    /** Можно предложить добавить: клиент умеет, а ярлыка ещё нет (или узнать нельзя) */
    canAdd: status === 'missed' || status === 'unknown',
    add,
  };
}

const DISMISS_KEY = 'ognivo.homeScreenHintDismissed';

/** Подсказка на главной — один раз на устройство, пока её не закрыли. */
export function useHomeScreenHint() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* хранилище недоступно — просто скрываем до перезапуска */
    }
  }, []);
  return { dismissed, dismiss };
}
