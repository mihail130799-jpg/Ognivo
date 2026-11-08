import { ALL_CATEGORIES } from '@ognivo/shared';

// Палитра для категорий в диаграммах: тёплые, приглушённые, различимые в обеих темах.
const PALETTE = ['#F2A65A', '#8FBF9A', '#E8857A', '#9DA8D6', '#D9B26F', '#7FB7C4', '#C795C9', '#B5A58F'];

const byId = new Map(ALL_CATEGORIES.map((c, i) => [c.id, PALETTE[i % PALETTE.length]]));

export function categoryColor(id: string): string {
  return byId.get(id) ?? '#8A8079';
}
