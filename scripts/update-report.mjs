// Скачать свежую копию базы с VPS и пересобрать сводку secrets/report.html.
// Запуск: npm run report  (SSH спросит пароль от сервера один раз)
// На сервере ничего не остаётся: снимок делается во временной папке контейнера и сразу удаляется.
import { spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, renameSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = 'root@23.27.246.207';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'secrets');
const db = path.join(dir, 'ognivo-view.db');
const tmp = `${db}.download`;
const report = path.join(dir, 'report.html');

// Снимок через VACUUM INTO (согласованный, рабочая база не трогается) → в stdout → в файл на ПК
const remote =
  'docker exec -e BACKUP_DIR=/tmp/view ognivo sh -c ' +
  `'rm -rf /tmp/view && node server/scripts/backup.mjs >&2 && cat /tmp/view/*.db; s=$?; rm -rf /tmp/view; exit $s'`;

mkdirSync(dir, { recursive: true });
console.log('Скачиваю свежую копию базы с сервера…');
const fd = openSync(tmp, 'w');
const r = spawnSync('ssh', [HOST, remote], { stdio: ['inherit', fd, 'inherit'] });
closeSync(fd);

if (r.status !== 0 || statSync(tmp).size === 0) {
  try {
    unlinkSync(tmp);
  } catch {}
  console.error('Не удалось скачать базу — сводка не обновлена.');
  process.exit(1);
}
renameSync(tmp, db);

const g = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(root, 'scripts', 'report.mjs'), db, report], { stdio: 'inherit' });
if (g.status !== 0) process.exit(g.status ?? 1);

// Открыть сводку в браузере
if (process.platform === 'win32') spawnSync('cmd', ['/c', 'start', '', report], { stdio: 'ignore' });
