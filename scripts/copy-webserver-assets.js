import fs from 'fs';
import path from 'path';

const outDir = path.resolve('dist-be/backend/server');

fs.copyFileSync(path.resolve('src/backend/webserver/package.json'), path.join(outDir, 'package.json'));
console.log('Copied webserver package.json → dist-be/backend/server');

const migrationsSrc = path.resolve('src/backend/shared/migrations');
const migrationsDest = path.join(outDir, 'shared/migrations');
fs.mkdirSync(migrationsDest, { recursive: true });

const files = fs.readdirSync(migrationsSrc).filter(file => file.endsWith('.sql'));
files.forEach(file => fs.copyFileSync(path.join(migrationsSrc, file), path.join(migrationsDest, file)));
console.log(`Copied ${files.length} migration(s) → dist-be/backend/server/shared/migrations`);
