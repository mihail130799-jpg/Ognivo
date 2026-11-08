// Утверждённые категории операций. id хранится в базе, поэтому менять id нельзя —
// можно менять только подписи и иконки.

export type CategoryKind = 'expense' | 'income';

export interface Category {
  id: string;
  kind: CategoryKind;
  emoji: string;
  title: string;
}

export const EXPENSE_CATEGORIES: readonly Category[] = [
  { id: 'groceries', kind: 'expense', emoji: '🛒', title: 'Продукты' },
  { id: 'cafe', kind: 'expense', emoji: '🍽', title: 'Кафе и рестораны' },
  { id: 'transport', kind: 'expense', emoji: '🚕', title: 'Транспорт и такси' },
  { id: 'car', kind: 'expense', emoji: '🚗', title: 'Авто' },
  { id: 'housing', kind: 'expense', emoji: '🏠', title: 'Жильё и ЖКХ' },
  { id: 'telecom', kind: 'expense', emoji: '📱', title: 'Связь и интернет' },
  { id: 'health', kind: 'expense', emoji: '💊', title: 'Здоровье и аптека' },
  { id: 'clothes', kind: 'expense', emoji: '👕', title: 'Одежда и обувь' },
  { id: 'fun', kind: 'expense', emoji: '🎬', title: 'Развлечения и досуг' },
  { id: 'sport', kind: 'expense', emoji: '🏋️', title: 'Спорт' },
  { id: 'gifts_out', kind: 'expense', emoji: '🎁', title: 'Подарки' },
  { id: 'education', kind: 'expense', emoji: '📚', title: 'Образование' },
  { id: 'subscriptions', kind: 'expense', emoji: '🔁', title: 'Подписки' },
  { id: 'other_out', kind: 'expense', emoji: '📦', title: 'Другое' },
];

export const INCOME_CATEGORIES: readonly Category[] = [
  { id: 'salary', kind: 'income', emoji: '💼', title: 'Зарплата' },
  { id: 'freelance', kind: 'income', emoji: '🧑‍💻', title: 'Подработка / фриланс' },
  { id: 'gifts_in', kind: 'income', emoji: '🎁', title: 'Подарки' },
  { id: 'invest', kind: 'income', emoji: '📈', title: 'Проценты и инвестиции' },
  { id: 'refunds', kind: 'income', emoji: '↩️', title: 'Возвраты и кешбэк' },
  { id: 'other_in', kind: 'income', emoji: '📦', title: 'Другое' },
];

export const ALL_CATEGORIES: readonly Category[] = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

export const CATEGORY_BY_ID: Readonly<Record<string, Category>> = Object.fromEntries(
  ALL_CATEGORIES.map((c) => [c.id, c]),
);

export function isValidCategory(id: string, kind: CategoryKind): boolean {
  return CATEGORY_BY_ID[id]?.kind === kind;
}
