import 'dotenv/config';

import { DataSource } from 'typeorm';

// This file itself is compiled to `dist/` in a production image and run
// straight by Node, or run from `src/` through ts-node on a developer's
// machine. `__filename`'s own extension tells us which, so one file can glob
// the right entities/migrations in both places without an env flag.
const compiled = __filename.endsWith('.js');
const root = compiled ? 'dist' : 'src';
const ext = compiled ? 'js' : 'ts';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [`${root}/**/*.entity.${ext}`],
  migrations: [`${root}/infrastructure/database/migrations/*.${ext}`],
  synchronize: false,
  migrationsTableName: 'migrations',
});
