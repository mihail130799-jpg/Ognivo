import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SavingsGoalDto, SavingsMoveDto } from '@ognivo/shared';
import { prisma } from '../db.js';
import { badRequest, notFound, parse, zAmount, zComment, zDate, zId, zTitle } from '../lib/http.js';

const zEmoji = z.string().min(1).max(16);
const zGoalCreate = z
  .object({ title: zTitle, emoji: zEmoji.optional(), target: zAmount, deadline: zDate.nullable().optional() })
  .strict();
const zGoalPatch = zGoalCreate.partial().strict();
const zMove = z
  .object({
    /** + пополнение, − снятие (в копейках) */
    amount: z.number().int().refine((n) => n !== 0, 'сумма не может быть 0').refine((n) => Math.abs(n) <= 1e14),
    date: zDate,
    comment: zComment.optional(),
  })
  .strict();

async function savedOf(goalId: string): Promise<number> {
  const agg = await prisma.savingsMove.aggregate({ where: { goalId }, _sum: { amount: true } });
  return Number(agg._sum.amount ?? 0n);
}

async function findOwn(userId: string, id: string) {
  const goal = await prisma.savingsGoal.findFirst({ where: { id, userId, archived: false } });
  if (!goal) throw notFound();
  return goal;
}

async function toDto(g: { id: string; title: string; emoji: string; target: bigint; deadline: string | null }) {
  return {
    id: g.id,
    title: g.title,
    emoji: g.emoji,
    target: Number(g.target),
    saved: await savedOf(g.id),
    deadline: g.deadline,
  } satisfies SavingsGoalDto;
}

export async function savingsRoutes(app: FastifyInstance) {
  app.get('/savings', async (req): Promise<SavingsGoalDto[]> => {
    const goals = await prisma.savingsGoal.findMany({
      where: { userId: req.user.id, archived: false },
      orderBy: { createdAt: 'asc' },
    });
    const sums = await prisma.savingsMove.groupBy({
      by: ['goalId'],
      where: { goalId: { in: goals.map((g) => g.id) } },
      _sum: { amount: true },
    });
    const saved = new Map(sums.map((s) => [s.goalId, Number(s._sum.amount ?? 0n)]));
    return goals.map((g) => ({
      id: g.id,
      title: g.title,
      emoji: g.emoji,
      target: Number(g.target),
      saved: saved.get(g.id) ?? 0,
      deadline: g.deadline,
    }));
  });

  app.post('/savings', async (req, reply) => {
    const body = parse(zGoalCreate, req.body);
    const g = await prisma.savingsGoal.create({
      data: {
        userId: req.user.id,
        title: body.title,
        emoji: body.emoji,
        target: BigInt(body.target),
        deadline: body.deadline ?? null,
      },
    });
    return reply.code(201).send(await toDto(g));
  });

  app.patch('/savings/:id', async (req) => {
    const { id } = parse(zId, req.params);
    const body = parse(zGoalPatch, req.body);
    await findOwn(req.user.id, id);
    const g = await prisma.savingsGoal.update({
      where: { id },
      data: { ...body, target: body.target !== undefined ? BigInt(body.target) : undefined },
    });
    return toDto(g);
  });

  app.delete('/savings/:id', async (req) => {
    const { id } = parse(zId, req.params);
    await findOwn(req.user.id, id);
    await prisma.savingsGoal.delete({ where: { id } });
    return { ok: true };
  });

  app.get('/savings/:id/moves', async (req): Promise<SavingsMoveDto[]> => {
    const { id } = parse(zId, req.params);
    await findOwn(req.user.id, id);
    const moves = await prisma.savingsMove.findMany({
      where: { goalId: id },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return moves.map((m) => ({ id: m.id, amount: Number(m.amount), date: m.date, comment: m.comment }));
  });

  /** Пополнить (amount > 0) или снять (amount < 0). Снять больше накопленного нельзя. */
  app.post('/savings/:id/moves', async (req, reply) => {
    const { id } = parse(zId, req.params);
    const body = parse(zMove, req.body);
    const goal = await findOwn(req.user.id, id);
    if (body.amount < 0 && (await savedOf(id)) + body.amount < 0) {
      throw badRequest('amount: нельзя снять больше, чем накоплено');
    }
    await prisma.savingsMove.create({
      data: { goalId: id, amount: BigInt(body.amount), date: body.date, comment: body.comment ?? '' },
    });
    return reply.code(201).send(await toDto(goal));
  });

  app.delete('/savings/:id/moves/:moveId', async (req) => {
    const { id, moveId } = parse(z.object({ id: z.string(), moveId: z.string() }), req.params);
    const goal = await findOwn(req.user.id, id);
    const move = await prisma.savingsMove.findFirst({ where: { id: moveId, goalId: id } });
    if (!move) throw notFound();
    if ((await savedOf(id)) - Number(move.amount) < 0) {
      throw badRequest('нельзя удалить пополнение: баланс копилки станет отрицательным');
    }
    await prisma.savingsMove.delete({ where: { id: moveId } });
    return toDto(goal);
  });
}
