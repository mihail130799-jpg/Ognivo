import { z } from 'zod';
import { DATE_RE, TIME_RE } from '@ognivo/shared';

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = () => new HttpError(404, 'not_found');
export const badRequest = (msg: string) => new HttpError(400, msg);

/** Проверяет данные по схеме zod; при ошибке — 400 с описанием. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const res = schema.safeParse(data);
  if (!res.success) {
    const msg = res.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    throw badRequest(msg);
  }
  return res.data;
}

export const zDate = z.string().regex(DATE_RE, 'ожидается дата YYYY-MM-DD');
export const zTime = z.string().regex(TIME_RE, 'ожидается время HH:MM');
export const zId = z.object({ id: z.string().min(1) });
export const zTitle = z.string().trim().min(1, 'пустое название').max(200);
export const zComment = z.string().max(2000);
/** Сумма в копейках: целое, положительное, до 1 трлн ₽ */
export const zAmount = z.number().int().positive().max(100_000_000_000_000);

export const zRange = z
  .object({ from: zDate.optional(), to: zDate.optional() })
  .refine((r) => !r.from || !r.to || r.from <= r.to, 'from должен быть не позже to');

export function rangeWhere(r: { from?: string; to?: string }) {
  if (!r.from && !r.to) return undefined;
  return { ...(r.from ? { gte: r.from } : {}), ...(r.to ? { lte: r.to } : {}) };
}
