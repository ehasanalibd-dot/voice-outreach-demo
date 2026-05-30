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

    -- AI Agents: configurable system prompts for each AI role
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,           -- e.g. 'contact_extractor', 'script_generator', 'reply_agent'
      name TEXT NOT NULL,                  -- Human-readable name
      description TEXT DEFAULT '',
      system_prompt TEXT NOT NULL,         -- The actual LLM system prompt (editable)
      model TEXT DEFAULT 'google/gemini-2.5-flash',
      temperature REAL DEFAULT 0.7,
      max_tokens INTEGER DEFAULT 500,
      enabled BOOLEAN DEFAULT TRUE,
      version INTEGER DEFAULT 1,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Personas: tone/voice profiles for different contact types
    CREATE TABLE IF NOT EXISTS personas (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,          -- e.g. 'c_suite', 'engineering', 'claims'
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      tone TEXT NOT NULL,                 -- e.g. 'formal, strategic, decisive'
      system_prompt_addition TEXT DEFAULT '', -- Extra prompt injected into script/reply generation
      role_patterns TEXT DEFAULT '',      -- Regex patterns or keywords to match against contact roles
      enabled BOOLEAN DEFAULT TRUE,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Link campaign → default persona (optional override)
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS default_persona_id TEXT REFERENCES personas(id);

    -- Track which agent + persona was used for each script
    ALTER TABLE scripts ADD COLUMN IF NOT EXISTS agent_id TEXT;
    ALTER TABLE scripts ADD COLUMN IF NOT EXISTS persona_id TEXT;

    -- Track which agent + persona was used for each reply (future)
    CREATE TABLE IF NOT EXISTS replies (
      id TEXT PRIMARY KEY,
      call_id TEXT REFERENCES calls(id) ON DELETE CASCADE,
      contact_id TEXT REFERENCES contacts(id) ON DELETE CASCADE,
      agent_id TEXT,
      persona_id TEXT,
      direction TEXT DEFAULT 'outbound' CHECK(direction IN ('inbound','outbound')),
      channel TEXT DEFAULT 'whatsapp' CHECK(channel IN ('whatsapp','email')),
      content TEXT NOT NULL,
      delivered BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Prompt versioning for A/B testing
    CREATE TABLE IF NOT EXISTS prompt_versions (
      id TEXT PRIMARY KEY,
      agent_slug TEXT NOT NULL,
      version INTEGER NOT NULL,
      system_prompt TEXT NOT NULL,
      model TEXT,
      temperature REAL,
      max_tokens INTEGER,
      is_active BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_pv_agent ON prompt_versions(agent_slug, version);

    -- A/B testing tracking columns
    ALTER TABLE scripts ADD COLUMN IF NOT EXISTS prompt_version_id TEXT;
    ALTER TABLE scripts ADD COLUMN IF NOT EXISTS ab_group TEXT;
    
    -- Campaign persona override
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS persona_override TEXT DEFAULT 'auto';

    CREATE INDEX IF NOT EXISTS idx_emails_campaign ON emails(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email_id);
    CREATE INDEX IF NOT EXISTS idx_calls_campaign ON calls(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
    CREATE INDEX IF NOT EXISTS idx_agents_slug ON agents(slug);
    CREATE INDEX IF NOT EXISTS idx_personas_slug ON personas(slug);
  `;

  await db.exec(schema);
  console.log('[Database] PostgreSQL schema initialized');

  // Seed default agents + personas if empty
  const agentCount = await db.queryOne('SELECT COUNT(*) as c FROM agents');
  if (agentCount && parseInt(agentCount.c) === 0) {
    await seedDefaults();
  }
}

async function seedDefaults() {
  console.log('[Database] Seeding default agents and personas...');
  const { v4: uuid } = await import('uuid');

  const agents = [
    {
      slug: 'contact_extractor',
      name: 'Contact Extractor',
      description: 'Extracts name, role, company, phone, email from inbound emails.',
      system_prompt: `You are a contact extraction assistant. Extract the following fields from the email as a JSON object only (no markdown, no backticks):
{
  "name": "Full name of the person",
  "role": "Their job title or role (specific)",
  "company": "Their company name",
  "phone": "Phone number with country code if present",
  "email": "Email address if present",
  "seniority": "c_suite|director|manager|ic|unknown"
}
If a field is not found, use null. Classify seniority based on the role title (e.g. CEO/CTO/CFO/Chief = c_suite, VP/SVP/Head of = director, Manager = manager, individual contributor = ic). Only output valid JSON.`,
      temperature: 0.1,
      max_tokens: 500,
    },
    {
      slug: 'script_generator',
      name: 'Script Generator',
      description: 'Generates personalized outbound voice call scripts.',
      system_prompt: `You are a professional voice outreach script writer. Write a short, warm, personalized phone call script.
The script should:
- Greet the person by name
- Reference their specific role and company to show personalization
- Reference the campaign context
- Use the persona tone instructions exactly as provided
- Be concise — max 30 seconds of speaking time (~75 words)
- End with a clear next step or call-to-action
Output ONLY the script text, no headers or labels.`,
      temperature: 0.7,
      max_tokens: 300,
    },
    {
      slug: 'reply_agent',
      name: 'Reply Agent',
      description: 'Generates contextual WhatsApp/email replies back to contacts.',
      system_prompt: `You are a reply agent for voice outreach follow-ups. You write short, personalized replies to contacts based on their role and persona.
Rules:
- Keep replies under 50 words for WhatsApp, under 100 for email
- Match the persona tone exactly as instructed
- Reference something specific from the contact's profile (name, role, company)
- Include a clear call-to-action (book a call, confirm interest, answer a question)
- Never use generic "Hi there" — always use their name if known
- If this is an inbound message from the contact, acknowledge their question directly
Output ONLY the reply text, no headers or labels.`,
      temperature: 0.7,
      max_tokens: 400,
    },
  ];

  for (const a of agents) {
    await db.run(
      `INSERT INTO agents (id, slug, name, description, system_prompt, temperature, max_tokens) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (slug) DO NOTHING`,
      [uuid(), a.slug, a.name, a.description, a.system_prompt, a.temperature, a.max_tokens]
    );
  }

  const personas = [
    {
      slug: 'c_suite',
      name: 'C-Suite Executive',
      description: 'For CEOs, CTOs, CFOs, and other C-level leaders.',
      tone: 'formal, strategic, decisive, respectful of their time',
      system_prompt_addition: 'Speak to them as a strategic partner. Be brief. Lead with business value and outcomes, not features. Use confident, professional language.',
      role_patterns: '\\b(chief|ceo|cto|cfo|coo|cpo|cro|chairman|president|founder|co-founder)\\b',
    },
    {
      slug: 'director',
      name: 'Director / VP',
      description: 'For VPs, SVPs, Heads of Department, Directors.',
      tone: 'professional, outcome-driven, collaborative',
      system_prompt_addition: 'Address them as a peer. Focus on results, team impact, and strategic alignment. Use warm but professional language.',
      role_patterns: '\\b(vice president|vp|svp|head of|director|senior director)\\b',
    },
    {
      slug: 'claims',
      name: 'Claims / Underwriting',
      description: 'For claims officers, underwriting professionals, adjusters.',
      tone: 'empathetic, detail-oriented, risk-aware',
      system_prompt_addition: 'Acknowledge the complexity and responsibility of their role. Be precise. Focus on accuracy, compliance, and trust. Avoid aggressive sales language.',
      role_patterns: '\\b(claims|underwriting|adjuster|actuary|risk|compliance)\\b',
    },
    {
      slug: 'engineering',
      name: 'Engineering / Technical',
      description: 'For engineers, architects, developers, technical leads.',
      tone: 'direct, data-driven, no-fluff, technically precise',
      system_prompt_addition: 'Be specific and avoid marketing language. Lead with technical value, integrations, or capabilities. They appreciate conciseness and honesty over hype.',
      role_patterns: '\\b(engineer|developer|architect|devops|data scientist|technical|qa)\\b',
    },
    {
      slug: 'default',
      name: 'General Professional',
      description: 'Fallback for contacts whose role is unclear.',
      tone: 'friendly, professional, curious',
      system_prompt_addition: 'Use a balanced, approachable tone. Ask open-ended questions to learn more. Keep it warm and concise.',
      role_patterns: '',
    },
  ];

  for (const p of personas) {
    await db.run(
      `INSERT INTO personas (id, slug, name, description, tone, system_prompt_addition, role_patterns) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (slug) DO NOTHING`,
      [uuid(), p.slug, p.name, p.description, p.tone, p.system_prompt_addition, p.role_patterns]
    );
  }
  console.log('[Database] Seeded 3 agents + 5 personas');
}

export default db;
