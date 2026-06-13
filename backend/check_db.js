import postgres from 'postgres';

async function check() {
  const sql = postgres({
    host: 'db.anlkjdlixiwespogdozf.supabase.co',
    port: 6543,
    database: 'postgres',
    username: 'postgres',
    password: 'BADBOYveda9626@',
    ssl: 'require'
  });

  try {
    const rows = await sql`
      SELECT * FROM whatsapp_sessions
    `;
    console.log('--- ALL Rows in whatsapp_sessions ---');
    console.log(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error('Error fetching settings:', err);
  } finally {
    await sql.end();
  }
}

check();
