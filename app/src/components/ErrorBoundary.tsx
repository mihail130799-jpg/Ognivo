import { Component, type ReactNode } from 'react';

/** Если в интерфейсе случилась ошибка — показываем понятный экран вместо пустой страницы. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Ошибка интерфейса:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <h1 className="title">Что-то пошло не так</h1>
        <div className="card">
          <p className="muted">Попробуйте перезапустить приложение. Ваши данные сохранены на сервере.</p>
          <button className="btn primary" style={{ marginTop: 14 }} onClick={() => location.reload()}>
            Перезапустить
          </button>
        </div>
      </div>
    );
  }
}
