// Applies specific migration files to the database in DATABASE_URL, each in its own transaction.
//
//   DATABASE_URL=postgres://... node run-migrations.js 20240101000011_lock_down_breadmaker.sql 20240101000012_lms.sql
//
// Files must be named explicitly: running every migration would re-run
// 20240101000000_wipe_old_breadmaker.sql, which drops the whole breadmaker schema.
import fs from 'fs';
import path from 'path';
import pg from 'pg';

const { Client } = pg;
const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
const files = process.argv.slice(2);

if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL to the Postgres connection string.');
  process.exit(1);
}
if (files.length === 0) {
  console.error('Name the migration files to apply, e.g. node run-migrations.js 20240101000012_lms.sql');
  process.exit(1);
}
if (files.some((file) => file.includes('wipe'))) {
  console.error('Refusing to run a wipe migration.');
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`Applying ${file}`);
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    }
  }
  console.log('Done.');
} catch (err) {
  console.error('Migration failed; that file was rolled back:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
