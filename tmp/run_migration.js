import postgres from '../backend/node_modules/postgres/src/index.js';
import fs from 'fs';
import path from 'path';

const connectionString = 'postgres://postgres:BADBOYveda9626@db.anlkjdlixiwespogdozf.supabase.co:6543/postgres';

async function run() {
  console.log('Connecting to Supabase Database...');
  const sql = postgres(connectionString, { ssl: 'require' });

  try {
    const migrationPath = path.resolve('supabase/migrations/202606130001_create_system_settings.sql');
    console.log(`Reading SQL from: ${migrationPath}`);
    const sqlText = fs.readFileSync(migrationPath, 'utf8');

    console.log('Executing SQL...');
    await sql.unsafe(sqlText);
    console.log('✅ Migration applied successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await sql.end();
  }
}

run();
