// Резервная копия базы SQLite: согласованный снимок через VACUUM INTO, хранение 14 дней.
// Запуск в контейнере: node /app/server/scripts/backup.mjs
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const DIR = process.env.BACKUP_DIR ?? '/data/backups';
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS ?? 14);

mkdirSync(DIR, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const file = path.join(DIR, `ognivo-${stamp}.db`);

const prisma = new PrismaClient();
try {
  await prisma.$executeRawUnsafe(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  console.log(`${new Date().toISOString()} копия: ${file} (${(statSync(file).size / 1024).toFixed(0)} КБ)`);
} finally {
  await prisma.$disconnect();
}

const cutoff = Date.now() - KEEP_DAYS * 86400_000;
for (const f of readdirSync(DIR)) {
  const p = path.join(DIR, f);
  if (f.startsWith('ognivo-') && f.endsWith('.db') && statSync(p).mtimeMs < cutoff) {
    unlinkSync(p);
    console.log(`удалена старая копия: ${f}`);
  }
}
