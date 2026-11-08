import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { mergeSettings, todayIn, type MeResponse, type UserSettings } from '@ognivo/shared';
import { prisma } from '../db.js';
import { parse, badRequest } from '../lib/http.js';
import type { User } from '@prisma/client';

function readSettings(user: User): UserSettings {
  try {
    return mergeSettings(JSON.parse(user.settings || '{}'));
  } catch {
    return mergeSettings(null);
  }
}

function toMe(user: User): MeResponse {
  return {
    id: user.id,
    telegramId: user.telegramId,
    name: user.name,
    username: user.username,
    timezone: user.timezone,
    today: todayIn(user.timezone),
    settings: readSettings(user),
  };
}

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const bool = z.boolean().optional();
const zSettingsPatch = z
  .object({
    theme: z.enum(['light', 'dark', 'system']).optional(),
    currency: z.enum(['RUB', 'USD', 'EUR', 'KZT']).optional(),
    animations: bool,
    sections: z.object({ plan: bool, money: bool, sport: bool }).strict().optional(),
    homeBlocks: z
      .object({ tasks: bool, events: bool, workout: bool, finance: bool, savings: bool })
      .strict()
      .optional(),
    notifications: z.object({ tasks: bool, events: bool, workouts: bool }).strict().optional(),
    trainingDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  })
  .strict();

const zMePatch = z
  .object({
    name: z.string().trim().min(1).max(64).optional(),
    timezone: z.string().max(64).optional(),
    settings: zSettingsPatch.optional(),
  })
  .strict();

export async function meRoutes(app: FastifyInstance) {
  app.get('/me', async (req) => toMe(req.user));

  app.patch('/me', async (req) => {
    const body = parse(zMePatch, req.body);
    if (body.timezone && !isValidTimezone(body.timezone)) throw badRequest('timezone: неизвестный часовой пояс');

    const cur = readSettings(req.user);
    const s = body.settings;
    const next: UserSettings | undefined = s && {
      ...cur,
      ...s,
      sections: { ...cur.sections, ...s.sections },
      homeBlocks: { ...cur.homeBlocks, ...s.homeBlocks },
      notifications: { ...cur.notifications, ...s.notifications },
      trainingDays: s.trainingDays ? [...new Set(s.trainingDays)].sort() : cur.trainingDays,
    };

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name: body.name,
        timezone: body.timezone,
        settings: next ? JSON.stringify(next) : undefined,
      },
    });
    return toMe(user);
  });
}
