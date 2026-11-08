import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { HabitDto } from '@ognivo/shared';
import { prisma } from '../db.js';
import { notFound, parse, rangeWhere, zDate, zId, zRange, zTitle } from '../lib/http.js';

const zEmoji = z.string().min(1).max(16);
const zHabitCreate = z.object({ title: zTitle, emoji: zEmoji.optional() }).strict();
const zHabitPatch = z
  .object({ title: zTitle.optional(), emoji: zEmoji.optional(), sortOrder: z.number().int().optional() })
  .strict();

async function findOwn(userId: string, id: string) {
  const habit = await prisma.habit.findFirst({ where: { id, userId, archived: false } });
  if (!habit) throw notFound();
  return habit;
}

export async function habitRoutes(app: FastifyInstance) {
  /** Привычки с отметками за период (по умолчанию — все отметки). */
  app.get('/habits', async (req): Promise<HabitDto[]> => {
    const range = parse(zRange, req.query);
    const habits = await prisma.habit.findMany({
      where: { userId: req.user.id, archived: false },
      include: { checks: { where: { date: rangeWhere(range) }, orderBy: { date: 'asc' } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return habits.map((h) => ({
      id: h.id,
      title: h.title,
      emoji: h.emoji,
      sortOrder: h.sortOrder,
      checks: h.checks.map((c) => c.date),
    }));
  });

  app.post('/habits', async (req, reply) => {
    const body = parse(zHabitCreate, req.body);
    const count = await prisma.habit.count({ where: { userId: req.user.id, archived: false } });
    const h = await prisma.habit.create({
      data: { userId: req.user.id, title: body.title, emoji: body.emoji, sortOrder: count },
    });
    return reply.code(201).send({ id: h.id, title: h.title, emoji: h.emoji, sortOrder: h.sortOrder, checks: [] });
  });

  app.patch('/habits/:id', async (req) => {
    const { id } = parse(zId, req.params);
    const body = parse(zHabitPatch, req.body);
    await findOwn(req.user.id, id);
    const h = await prisma.habit.update({ where: { id }, data: body });
    return { id: h.id, title: h.title, emoji: h.emoji, sortOrder: h.sortOrder };
  });

  app.delete('/habits/:id', async (req) => {
    const { id } = parse(zId, req.params);
    await findOwn(req.user.id, id);
    await prisma.habit.delete({ where: { id } });
    return { ok: true };
  });

  /** Переключить отметку привычки на дату. */
  app.post('/habits/:id/check', async (req) => {
    const { id } = parse(zId, req.params);
    const { date } = parse(z.object({ date: zDate }).strict(), req.body);
    await findOwn(req.user.id, id);
    const existing = await prisma.habitCheck.findUnique({ where: { habitId_date: { habitId: id, date } } });
    if (existing) await prisma.habitCheck.delete({ where: { id: existing.id } });
    else await prisma.habitCheck.create({ data: { habitId: id, date } });
    return { checked: !existing };
  });
}
