import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import {
  BUILTIN_EXERCISES,
  BUILTIN_EXERCISE_BY_ID,
  type ExerciseInfo,
  type ExerciseUnit,
  type MuscleGroup,
  type WorkoutDto,
} from '@ognivo/shared';
import { prisma } from '../db.js';
import { badRequest, notFound, parse, rangeWhere, zComment, zDate, zId, zRange, zTitle } from '../lib/http.js';

const zGroup = z.enum(['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'cardio', 'other']);
const zUnit = z.enum(['reps', 'time']);
const zExerciseCreate = z.object({ title: zTitle, group: zGroup.optional(), unit: zUnit.optional() }).strict();

const zSet = z
  .object({
    reps: z.number().int().min(0).max(10_000).nullable().optional(),
    weight: z.number().min(0).max(2_000).nullable().optional(),
    durationSec: z.number().int().min(0).max(24 * 3600).nullable().optional(),
    done: z.boolean().optional(),
  })
  .strict();

const zWorkoutBody = z
  .object({
    title: zTitle,
    date: zDate,
    note: zComment.optional(),
    exercises: z
      .array(z.object({ exerciseId: z.string().min(1), sets: z.array(zSet).max(50) }).strict())
      .max(40),
  })
  .strict();

const workoutInclude = {
  exercises: { orderBy: { sortOrder: 'asc' }, include: { sets: { orderBy: { sortOrder: 'asc' } } } },
} satisfies Prisma.WorkoutInclude;

type WorkoutFull = Prisma.WorkoutGetPayload<{ include: typeof workoutInclude }>;

function toDto(w: WorkoutFull): WorkoutDto {
  return {
    id: w.id,
    title: w.title,
    date: w.date,
    status: w.status as 'planned' | 'done',
    note: w.note,
    finishedAt: w.finishedAt?.toISOString() ?? null,
    exercises: w.exercises.map((e) => ({
      id: e.id,
      exerciseId: e.exerciseId,
      title: e.title,
      unit: e.unit as ExerciseUnit,
      sets: e.sets.map((s) => ({
        id: s.id,
        reps: s.reps,
        weight: s.weight,
        durationSec: s.durationSec,
        done: s.done,
      })),
    })),
  };
}

/** Находит упражнения по id (встроенные и пользовательские) — для названия и единиц. */
async function resolveExercises(userId: string, ids: string[]): Promise<Map<string, ExerciseInfo>> {
  const map = new Map<string, ExerciseInfo>();
  const customIds = ids.filter((id) => !id.startsWith('b:'));
  const custom = customIds.length
    ? await prisma.exercise.findMany({ where: { userId, id: { in: customIds } } })
    : [];
  for (const id of ids) {
    if (id.startsWith('b:')) {
      const b = BUILTIN_EXERCISE_BY_ID[id];
      if (b) map.set(id, b);
    }
  }
  for (const c of custom) {
    map.set(c.id, { id: c.id, title: c.title, group: c.group as MuscleGroup, unit: c.unit as ExerciseUnit, builtin: false });
  }
  const missing = ids.filter((id) => !map.has(id));
  if (missing.length) throw badRequest(`exerciseId: неизвестное упражнение ${missing[0]}`);
  return map;
}

function nestedCreate(body: z.infer<typeof zWorkoutBody>, info: Map<string, ExerciseInfo>) {
  return body.exercises.map((e, i) => {
    const ex = info.get(e.exerciseId)!;
    return {
      exerciseId: e.exerciseId,
      title: ex.title,
      unit: ex.unit,
      sortOrder: i,
      sets: {
        create: e.sets.map((s, j) => ({
          sortOrder: j,
          reps: s.reps ?? null,
          weight: s.weight ?? null,
          durationSec: s.durationSec ?? null,
          done: s.done ?? false,
        })),
      },
    };
  });
}

async function findOwn(userId: string, id: string) {
  const w = await prisma.workout.findFirst({ where: { id, userId }, include: workoutInclude });
  if (!w) throw notFound();
  return w;
}

export async function sportRoutes(app: FastifyInstance) {
  // ── Упражнения ──
  app.get('/exercises', async (req): Promise<ExerciseInfo[]> => {
    const custom = await prisma.exercise.findMany({ where: { userId: req.user.id }, orderBy: { title: 'asc' } });
    return [
      ...BUILTIN_EXERCISES,
      ...custom.map((c) => ({
        id: c.id,
        title: c.title,
        group: c.group as MuscleGroup,
        unit: c.unit as ExerciseUnit,
        builtin: false,
      })),
    ];
  });

  app.post('/exercises', async (req, reply) => {
    const body = parse(zExerciseCreate, req.body);
    const c = await prisma.exercise.create({ data: { userId: req.user.id, ...body } });
    const dto: ExerciseInfo = {
      id: c.id,
      title: c.title,
      group: c.group as MuscleGroup,
      unit: c.unit as ExerciseUnit,
      builtin: false,
    };
    return reply.code(201).send(dto);
  });

  app.delete('/exercises/:id', async (req) => {
    const { id } = parse(zId, req.params);
    const c = await prisma.exercise.findFirst({ where: { id, userId: req.user.id } });
    if (!c) throw notFound();
    // В уже сохранённых тренировках упражнение остаётся (там хранится название)
    await prisma.exercise.delete({ where: { id } });
    return { ok: true };
  });

  // ── Тренировки ──
  app.get('/workouts', async (req) => {
    const range = parse(zRange, req.query);
    const list = await prisma.workout.findMany({
      where: { userId: req.user.id, date: rangeWhere(range) },
      include: workoutInclude,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return list.map(toDto);
  });

  app.get('/workouts/:id', async (req) => {
    const { id } = parse(zId, req.params);
    return toDto(await findOwn(req.user.id, id));
  });

  app.post('/workouts', async (req, reply) => {
    const body = parse(zWorkoutBody, req.body);
    const info = await resolveExercises(req.user.id, body.exercises.map((e) => e.exerciseId));
    const w = await prisma.workout.create({
      data: {
        userId: req.user.id,
        title: body.title,
        date: body.date,
        note: body.note ?? '',
        exercises: { create: nestedCreate(body, info) },
      },
      include: workoutInclude,
    });
    return reply.code(201).send(toDto(w));
  });

  /** Полная замена тренировки (название, дата, упражнения и подходы). */
  app.put('/workouts/:id', async (req) => {
    const { id } = parse(zId, req.params);
    const body = parse(zWorkoutBody, req.body);
    const cur = await findOwn(req.user.id, id);
    // Для уже сохранённых упражнений сохраняем прежнее название, даже если своё упражнение удалено
    const known = new Map(cur.exercises.map((e) => [e.exerciseId, e]));
    const unknownIds = body.exercises.map((e) => e.exerciseId).filter((eid) => !known.has(eid));
    const info = await resolveExercises(req.user.id, unknownIds);
    for (const [eid, e] of known) {
      info.set(eid, { id: eid, title: e.title, unit: e.unit as ExerciseUnit, group: 'other', builtin: eid.startsWith('b:') });
    }

    const w = await prisma.$transaction(async (db) => {
      await db.workoutExercise.deleteMany({ where: { workoutId: id } });
      return db.workout.update({
        where: { id },
        data: {
          title: body.title,
          date: body.date,
          note: body.note ?? '',
          remindedAt: body.date !== cur.date ? null : undefined,
          exercises: { create: nestedCreate(body, info) },
        },
        include: workoutInclude,
      });
    });
    return toDto(w);
  });

  app.post('/workouts/:id/finish', async (req) => {
    const { id } = parse(zId, req.params);
    await findOwn(req.user.id, id);
    const w = await prisma.workout.update({
      where: { id },
      data: { status: 'done', finishedAt: new Date() },
      include: workoutInclude,
    });
    return toDto(w);
  });

  app.post('/workouts/:id/reopen', async (req) => {
    const { id } = parse(zId, req.params);
    await findOwn(req.user.id, id);
    const w = await prisma.workout.update({
      where: { id },
      data: { status: 'planned', finishedAt: null },
      include: workoutInclude,
    });
    return toDto(w);
  });

  app.delete('/workouts/:id', async (req) => {
    const { id } = parse(zId, req.params);
    await findOwn(req.user.id, id);
    await prisma.workout.delete({ where: { id } });
    return { ok: true };
  });
}
