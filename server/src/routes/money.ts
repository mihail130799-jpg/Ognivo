import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Transaction } from '@prisma/client';
import { isValidCategory, type CategoryKind, type MoneySummary, type TransactionDto } from '@ognivo/shared';
import { prisma } from '../db.js';
import { badRequest, notFound, parse, rangeWhere, zAmount, zComment, zDate, zId, zRange } from '../lib/http.js';

const zKind = z.enum(['expense', 'income']);
const zTxCreate = z
  .object({ kind: zKind, amount: zAmount, categoryId: z.string(), date: zDate, comment: zComment.optional() })
  .strict();
const zTxPatch = zTxCreate.partial().strict();

function toDto(t: Transaction): TransactionDto {
  return {
    id: t.id,
    kind: t.kind as CategoryKind,
    amount: Number(t.amount),
    categoryId: t.categoryId,
    date: t.date,
    comment: t.comment,
  };
}

async function findOwn(userId: string, id: string) {
  const tx = await prisma.transaction.findFirst({ where: { id, userId } });
  if (!tx) throw notFound();
  return tx;
}

export async function moneyRoutes(app: FastifyInstance) {
  /** Операции за период, новые сверху. Без from/to — за всё время. */
  app.get('/transactions', async (req) => {
    const range = parse(zRange, req.query);
    const list = await prisma.transaction.findMany({
      where: { userId: req.user.id, date: rangeWhere(range) },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return list.map(toDto);
  });

  /** Итоги за период: доходы, расходы, разница и суммы по категориям. */
  app.get('/transactions/summary', async (req): Promise<MoneySummary> => {
    const range = parse(zRange, req.query);
    const groups = await prisma.transaction.groupBy({
      by: ['kind', 'categoryId'],
      where: { userId: req.user.id, date: rangeWhere(range) },
      _sum: { amount: true },
    });
    let income = 0;
    let expense = 0;
    const byCategory = groups.map((g) => {
      const total = Number(g._sum.amount ?? 0n);
      if (g.kind === 'income') income += total;
      else expense += total;
      return { categoryId: g.categoryId, kind: g.kind as CategoryKind, total };
    });
    byCategory.sort((a, b) => b.total - a.total);
    return { income, expense, balance: income - expense, byCategory };
  });

  app.post('/transactions', async (req, reply) => {
    const body = parse(zTxCreate, req.body);
    if (!isValidCategory(body.categoryId, body.kind)) throw badRequest('categoryId: неизвестная категория');
    const tx = await prisma.transaction.create({
      data: { ...body, amount: BigInt(body.amount), userId: req.user.id },
    });
    return reply.code(201).send(toDto(tx));
  });

  app.patch('/transactions/:id', async (req) => {
    const { id } = parse(zId, req.params);
    const body = parse(zTxPatch, req.body);
    const cur = await findOwn(req.user.id, id);
    const kind = body.kind ?? (cur.kind as CategoryKind);
    const categoryId = body.categoryId ?? cur.categoryId;
    if (!isValidCategory(categoryId, kind)) throw badRequest('categoryId: категория не подходит к типу операции');
    const tx = await prisma.transaction.update({
      where: { id },
      data: { ...body, amount: body.amount !== undefined ? BigInt(body.amount) : undefined },
    });
    return toDto(tx);
  });

  app.delete('/transactions/:id', async (req) => {
    const { id } = parse(zId, req.params);
    await findOwn(req.user.id, id);
    await prisma.transaction.delete({ where: { id } });
    return { ok: true };
  });
}
