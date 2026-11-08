import type { FastifyInstance } from 'fastify';
import type { User } from '@prisma/client';
import { z } from 'zod';
import { InputFile } from 'grammy';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { telegram } from '../telegramApi.js';
import { HttpError, parse } from '../lib/http.js';

/** Все данные пользователя одним JSON (BigInt → число). */
async function buildExport(user: User): Promise<string> {
  const userId = user.id;
  const [tasks, habits, transactions, savingsGoals, exercises, workouts] = await Promise.all([
    prisma.task.findMany({ where: { userId }, include: { completions: true } }),
    prisma.habit.findMany({ where: { userId }, include: { checks: true } }),
    prisma.transaction.findMany({ where: { userId } }),
    prisma.savingsGoal.findMany({ where: { userId }, include: { moves: true } }),
    prisma.exercise.findMany({ where: { userId } }),
    prisma.workout.findMany({ where: { userId }, include: { exercises: { include: { sets: true } } } }),
  ]);
  const data = {
    exportedAt: new Date().toISOString(),
    profile: { name: user.name, username: user.username, timezone: user.timezone, settings: JSON.parse(user.settings || '{}') },
    tasks,
    habits,
    transactions,
    savingsGoals,
    exercises,
    workouts,
  };
  return JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2);
}

const zFeedback = z
  .object({ kind: z.enum(['bug', 'idea']), text: z.string().trim().min(3, 'слишком коротко').max(4000) })
  .strict();

export async function dataRoutes(app: FastifyInstance) {
  /** Скачать выгрузку файлом (для браузера). */
  app.get('/export', async (req, reply) => {
    return reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="ognivo-export.json"')
      .send(await buildExport(req.user));
  });

  /** Отправить выгрузку файлом в чат с ботом — в Telegram скачивание из Mini App работает не везде. */
  app.post('/export/send', async (req) => {
    if (!telegram) throw new HttpError(503, 'bot_not_configured');
    const json = await buildExport(req.user);
    try {
      await telegram.sendDocument(req.user.telegramId, new InputFile(Buffer.from(json, 'utf8'), 'ognivo-export.json'), {
        caption: 'Ваши данные Ognivo 🔥',
      });
    } catch (e) {
      req.log.warn({ err: e }, 'не удалось отправить выгрузку');
      // Чаще всего пользователь ещё не запускал бота (/start) или заблокировал его
      throw new HttpError(409, 'cannot_message_user');
    }
    return { ok: true };
  });

  /** Удаление всех данных. Профиль остаётся, настройки сбрасываются. */
  app.delete('/data', async (req) => {
    const userId = req.user.id;
    await prisma.$transaction([
      prisma.task.deleteMany({ where: { userId } }),
      prisma.habit.deleteMany({ where: { userId } }),
      prisma.transaction.deleteMany({ where: { userId } }),
      prisma.savingsGoal.deleteMany({ where: { userId } }),
      prisma.exercise.deleteMany({ where: { userId } }),
      prisma.workout.deleteMany({ where: { userId } }),
      prisma.feedback.deleteMany({ where: { userId } }),
      prisma.user.update({ where: { id: userId }, data: { settings: '{}' } }),
    ]);
    return { ok: true };
  });

  /** Обратная связь: сохраняем и, если настроено, пересылаем разработчику. */
  app.post('/feedback', async (req, reply) => {
    const body = parse(zFeedback, req.body);
    await prisma.feedback.create({ data: { userId: req.user.id, kind: body.kind, text: body.text } });
    if (telegram && env.FEEDBACK_CHAT_ID) {
      const who = req.user.username ? `@${req.user.username}` : req.user.name;
      const head = body.kind === 'bug' ? '🐞 Баг' : '💡 Идея';
      telegram
        .sendMessage(env.FEEDBACK_CHAT_ID, `${head} от ${who} (id ${req.user.telegramId}):\n\n${body.text}`)
        .catch((e) => req.log.warn({ err: e }, 'не удалось переслать обратную связь'));
    }
    return reply.code(201).send({ ok: true });
  });
}
