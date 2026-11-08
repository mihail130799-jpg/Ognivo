import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Task, TaskCompletion } from '@prisma/client';
import type { Remind, Repeat, TaskDto, TaskKind, TaskStatus } from '@ognivo/shared';
import { occursOn } from '@ognivo/shared';
import { prisma } from '../db.js';
import { badRequest, notFound, parse, zComment, zDate, zId, zTime, zTitle } from '../lib/http.js';

const zTaskBase = z.object({
  kind: z.enum(['task', 'event']),
  title: zTitle,
  date: zDate.nullable(),
  time: zTime.nullable(),
  repeat: z.enum(['none', 'day', 'week', 'month']),
  remind: z.enum(['none', 'ontime', '15m', '1h', '1d']),
  status: z.enum(['planned', 'in_progress', 'done']),
  comment: zComment,
});

const zTaskCreate = zTaskBase
  .partial()
  .required({ title: true })
  .strict();
const zTaskPatch = zTaskBase.partial().strict();

function toDto(t: Task & { completions: TaskCompletion[] }): TaskDto {
  return {
    id: t.id,
    kind: t.kind as TaskKind,
    title: t.title,
    date: t.date,
    time: t.time,
    repeat: t.repeat as Repeat,
    remind: t.remind as Remind,
    status: t.status as TaskStatus,
    comment: t.comment,
    doneDates: t.completions.map((c) => c.date).sort(),
    createdAt: t.createdAt.toISOString(),
  };
}

/** Проверка согласованности полей: без даты нельзя повторять, время и напоминание. */
function validate(t: { date: string | null; time: string | null; repeat: string; remind: string }) {
  if (!t.date && t.repeat !== 'none') throw badRequest('repeat: повтор возможен только для задачи с датой');
  if (!t.date && t.time) throw badRequest('time: время без даты не указывается');
  if (!t.date && t.remind !== 'none') throw badRequest('remind: напоминание возможно только для задачи с датой');
}

async function findOwn(userId: string, id: string) {
  const task = await prisma.task.findFirst({ where: { id, userId }, include: { completions: true } });
  if (!task) throw notFound();
  return task;
}

export async function taskRoutes(app: FastifyInstance) {
  /** Все задачи и события пользователя (повторы раскрывает клиент через occursOn). */
  app.get('/tasks', async (req) => {
    const tasks = await prisma.task.findMany({
      where: { userId: req.user.id },
      include: { completions: true },
      orderBy: [{ date: 'asc' }, { time: 'asc' }, { createdAt: 'asc' }],
    });
    return tasks.map(toDto);
  });

  app.post('/tasks', async (req, reply) => {
    const body = parse(zTaskCreate, req.body);
    const data = {
      kind: body.kind ?? 'task',
      title: body.title,
      date: body.date ?? null,
      time: body.time ?? null,
      repeat: body.repeat ?? 'none',
      remind: body.remind ?? 'none',
      status: body.status ?? 'planned',
      comment: body.comment ?? '',
    };
    validate(data);
    const task = await prisma.task.create({
      data: { ...data, userId: req.user.id, doneAt: data.status === 'done' ? new Date() : null },
      include: { completions: true },
    });
    return reply.code(201).send(toDto(task));
  });

  app.patch('/tasks/:id', async (req) => {
    const { id } = parse(zId, req.params);
    const body = parse(zTaskPatch, req.body);
    const cur = await findOwn(req.user.id, id);
    const merged = { ...cur, ...body };
    validate(merged);

    const statusChanged = body.status && body.status !== cur.status;
    // При смене даты/времени/напоминания напоминание должно прийти заново
    const scheduleChanged =
      (body.date !== undefined && body.date !== cur.date) ||
      (body.time !== undefined && body.time !== cur.time) ||
      (body.remind !== undefined && body.remind !== cur.remind);

    const task = await prisma.task.update({
      where: { id },
      data: {
        ...body,
        doneAt: statusChanged ? (body.status === 'done' ? new Date() : null) : undefined,
        remindedAt: scheduleChanged ? null : undefined,
      },
      include: { completions: true },
    });
    return toDto(task);
  });

  app.delete('/tasks/:id', async (req) => {
    const { id } = parse(zId, req.params);
    await findOwn(req.user.id, id);
    await prisma.task.delete({ where: { id } });
    return { ok: true };
  });

  /**
   * Отметить выполнение / снять отметку.
   * Для обычной задачи переключает статус done ↔ planned,
   * для повторяющейся — отметку на конкретную дату.
   */
  app.post('/tasks/:id/toggle', async (req) => {
    const { id } = parse(zId, req.params);
    const { date } = parse(z.object({ date: zDate.optional() }).strict(), req.body ?? {});
    const cur = await findOwn(req.user.id, id);

    if (cur.repeat === 'none') {
      const done = cur.status !== 'done';
      const task = await prisma.task.update({
        where: { id },
        data: { status: done ? 'done' : 'planned', doneAt: done ? new Date() : null },
        include: { completions: true },
      });
      return toDto(task);
    }

    if (!date) throw badRequest('date: для повторяющейся задачи нужна дата');
    if (!occursOn(cur.date, cur.repeat as Repeat, date)) throw badRequest('date: задача не приходится на эту дату');

    const existing = cur.completions.find((c) => c.date === date);
    if (existing) await prisma.taskCompletion.delete({ where: { id: existing.id } });
    else await prisma.taskCompletion.create({ data: { taskId: id, date } });
    return toDto(await findOwn(req.user.id, id));
  });
}
