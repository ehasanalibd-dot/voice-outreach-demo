import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'voice_outreach',
  user: process.env.PG_USER || 'outreach',
  password: process.env.PG_PASSWORD || 'outreach123',
  max: 10,
});

// Helper functions that mimic better-sqlite3 API but async
export const db = {
  async query(sql: string, params: any[] = []): Promise<any> {
    const result = await pool.query(sql, params);
    return result.rows;
  },

  async queryOne(sql: string, params: any[] = []): Promise<any | null> {
    const result = await pool.query(sql, params);
    return result.rows[0] || null;
  },

  async run(sql: string, params: any[] = []): Promise<any> {
    const result = await pool.query(sql, params);
    return { changes: result.rowCount };
  },

  async exec(sql: string): Promise<void> {
    await pool.query(sql);
  },
};

// Initialize database schema
export async function initDatabase(): Promise<void> {
  const schema = `
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      audience TEXT DEFAULT '',
      voice_style TEXT DEFAULT 'professional',
      inbox_config TEXT DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      from_name TEXT DEFAULT '',
      from_email TEXT DEFAULT '',
      subject TEXT DEFAULT '',
      body TEXT DEFAULT '',
      raw TEXT DEFAULT '',
      received_at TIMESTAMP DEFAULT NOW(),
      status TEXT DEFAULT 'new' CHECK(status IN ('new','processed','called','failed'))
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      email_id TEXT NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
      name TEXT,
      role TEXT,
      company TEXT,
      phone TEXT,
      email TEXT,
      extracted_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scripts (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      generated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      script_id TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      twilio_sid TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','calling','connected','completed','failed')),
      started_at TIMESTAMP,
      ended_at TIMESTAMP,
      duration INTEGER,
      transcript_url TEXT
    );

    CREATE TABLE IF NOT EXISTS transcripts (
      id TEXT PRIMARY KEY,
      call_id TEXT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
      content TEXT DEFAULT '',
      summary TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_emails_campaign ON emails(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email_id);
    CREATE INDEX IF NOT EXISTS idx_calls_campaign ON calls(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
  `;

  await db.exec(schema);
  console.log('[Database] PostgreSQL schema initialized');
}

export default db;
