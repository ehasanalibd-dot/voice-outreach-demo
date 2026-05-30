import db from '../database';

export interface Agent {
  id: string;
  slug: string;
  name: string;
  description: string;
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  enabled: boolean;
  version: number;
  updated_at: string;
}

export interface Persona {
  id: string;
  slug: string;
  name: string;
  description: string;
  tone: string;
  system_prompt_addition: string;
  role_patterns: string;
  enabled: boolean;
  updated_at: string;
}

/** Fetch agent by slug (unique identifier like 'script_generator') */
export async function getAgent(slug: string): Promise<Agent | null> {
  return db.queryOne('SELECT * FROM agents WHERE slug = $1 AND enabled = TRUE', [slug]);
}

/** Fetch all agents */
export async function getAllAgents(): Promise<Agent[]> {
  return db.query('SELECT * FROM agents ORDER BY slug');
}

/** Update an agent's system prompt (increments version) */
export async function updateAgentPrompt(
  slug: string,
  systemPrompt: string,
  overrides: Partial<Pick<Agent, 'name' | 'description' | 'temperature' | 'max_tokens' | 'model' | 'enabled'>> = {}
): Promise<Agent | null> {
  const sets: string[] = ['system_prompt = $2', 'version = version + 1', 'updated_at = NOW()'];
  const params: any[] = [slug, systemPrompt];
  let idx = 3;
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      sets.push(`${key} = $${idx}`);
      params.push(value);
      idx++;
    }
  }
  params.push(slug);
  await db.run(`UPDATE agents SET ${sets.join(', ')} WHERE slug = $1`, params);
  return getAgent(slug);
}

/** Fetch all personas */
export async function getAllPersonas(): Promise<Persona[]> {
  return db.query('SELECT * FROM personas WHERE enabled = TRUE ORDER BY slug');
}

/** Fetch persona by slug */
export async function getPersona(slug: string): Promise<Persona | null> {
  return db.queryOne('SELECT * FROM personas WHERE slug = $1', [slug]);
}

/** Update a persona */
export async function updatePersona(
  slug: string,
  updates: Partial<Omit<Persona, 'id' | 'slug' | 'updated_at'>>
): Promise<Persona | null> {
  const keys = Object.keys(updates);
  if (keys.length === 0) return getPersona(slug);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).concat('updated_at = NOW()');
  const params = [slug, ...keys.map(k => (updates as any)[k])];
  await db.run(`UPDATE personas SET ${sets.join(', ')} WHERE slug = $1`, params);
  return getPersona(slug);
}

/**
 * Auto-match a persona to a contact's role using regex patterns.
 * Falls back to 'default' persona if no pattern matches.
 */
export async function matchPersona(role: string | null | undefined): Promise<Persona> {
  const personas = await getAllPersonas();

  if (role) {
    const roleLower = role.toLowerCase();
    for (const p of personas) {
      if (!p.role_patterns) continue;
      try {
        const regex = new RegExp(p.role_patterns, 'i');
        if (regex.test(roleLower)) {
          return p;
        }
      } catch {
        // ignore invalid regex
      }
    }
  }

  // Fallback to 'default' persona
  const fallback = await getPersona('default');
  if (fallback) return fallback;

  // Last-resort: first persona with empty role_patterns
  return personas.find(p => !p.role_patterns) || personas[0];
}

/** Create a new persona */
export async function createPersona(
  data: Omit<Persona, 'id' | 'updated_at'>
): Promise<Persona | null> {
  const { v4: uuid } = await import('uuid');
  const id = uuid();
  await db.run(
    `INSERT INTO personas (id, slug, name, description, tone, system_prompt_addition, role_patterns, enabled)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, data.slug, data.name, data.description || '', data.tone, data.system_prompt_addition || '', data.role_patterns || '', data.enabled]
  );
  return getPersona(data.slug);
}
