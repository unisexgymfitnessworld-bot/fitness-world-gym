import postgres from 'postgres';
import fs from 'fs';
import path from 'path';

async function run() {
  console.log('Connecting to Supabase Database...');
  const sql = postgres({
    host: 'db.anlkjdlixiwespogdozf.supabase.co',
    port: 6543,
    database: 'postgres',
    username: 'postgres',
    password: 'BADBOYveda9626@',
    ssl: 'require'
  });

  try {
    const migrationPath = path.resolve('../supabase/migrations/202606130001_create_system_settings.sql');
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
