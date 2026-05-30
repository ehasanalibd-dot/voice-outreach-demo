import db from '../database';
import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const DEFAULT_MODEL = 'google/gemini-2.5-flash';

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

export interface PromptVersion {
  id: string;
  agent_slug: string;
  version: number;
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  is_active: boolean;
  created_at: string;
}

/** Fetch agent by slug */
export async function getAgent(slug: string): Promise<Agent | null> {
  return db.queryOne('SELECT * FROM agents WHERE slug = $1 AND enabled = TRUE', [slug]);
}

/** Fetch all agents */
export async function getAllAgents(): Promise<Agent[]> {
  return db.query('SELECT * FROM agents ORDER BY slug');
}

/** Update an agent's system prompt - saves old version, increments version */
export async function updateAgentPrompt(
  slug: string,
  systemPrompt: string,
  overrides: Partial<Pick<Agent, 'name' | 'description' | 'temperature' | 'max_tokens' | 'model' | 'enabled'>> = {}
): Promise<Agent | null> {
  const agent = await db.queryOne('SELECT * FROM agents WHERE slug = $1', [slug]);
  if (!agent) return null;

  // Save current state to prompt_versions BEFORE updating
  const { v4: uuid } = await import('uuid');
  const versionId = uuid();
  await db.run(
    `INSERT INTO prompt_versions (id, agent_slug, version, system_prompt, model, temperature, max_tokens, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)`,
    [versionId, slug, agent.version, agent.system_prompt, agent.model, agent.temperature, agent.max_tokens]
  );

  // Mark new version as active (deactivate old ones)
  await db.run(
    'UPDATE prompt_versions SET is_active = FALSE WHERE agent_slug = $1', [slug]
  );
  const newVersionId = uuid();
  await db.run(
    `INSERT INTO prompt_versions (id, agent_slug, version, system_prompt, model, temperature, max_tokens, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)`,
    [newVersionId, slug, agent.version + 1, systemPrompt, overrides.model || agent.model, overrides.temperature ?? agent.temperature, overrides.max_tokens ?? agent.max_tokens]
  );

  // Update the agent itself
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

/** Get all prompt versions for an agent */
export async function getAgentVersions(slug: string): Promise<PromptVersion[]> {
  return db.query(
    'SELECT * FROM prompt_versions WHERE agent_slug = $1 ORDER BY version DESC',
    [slug]
  );
}

/** Activate a specific version (rollback) */
export async function activateVersion(slug: string, versionId: string): Promise<Agent | null> {
  const version = await db.queryOne(
    'SELECT * FROM prompt_versions WHERE id = $1 AND agent_slug = $2',
    [versionId, slug]
  );
  if (!version) return null;

  // Deactivate all versions for this agent
  await db.run('UPDATE prompt_versions SET is_active = FALSE WHERE agent_slug = $1', [slug]);
  // Activate the selected one
  await db.run('UPDATE prompt_versions SET is_active = TRUE WHERE id = $1', [versionId]);
  // Update the agent to use this version's prompt
  await db.run(
    `UPDATE agents SET system_prompt = $2, version = $3, model = $4, temperature = $5, max_tokens = $6, updated_at = NOW() WHERE slug = $1`,
    [slug, version.system_prompt, version.version, version.model, version.temperature, version.max_tokens]
  );
  return getAgent(slug);
}

/** Test an agent with input text using OpenRouter */
export async function testAgent(slug: string, testInput: string): Promise<{ output: string; model: string; prompt_used: string }> {
  const agent = await db.queryOne('SELECT * FROM agents WHERE slug = $1', [slug]);
  if (!agent) throw new Error(`Agent '${slug}' not found`);
  if (!OPENROUTER_API_KEY) throw new Error('No OpenRouter API key configured');

  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: agent.model || DEFAULT_MODEL,
      messages: [
        { role: 'system', content: agent.system_prompt },
        { role: 'user', content: testInput },
      ],
      temperature: agent.temperature ?? 0.7,
      max_tokens: agent.max_tokens ?? 500,
    },
    {
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://voice-outreach-demo.app',
        'X-Title': 'Voice Outreach Demo',
      },
    }
  );

  const output = response.data.choices?.[0]?.message?.content?.trim() || '[empty response]';
  return { output, model: agent.model || DEFAULT_MODEL, prompt_used: agent.system_prompt };
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

/** Auto-match a persona to a contact's role */
export async function matchPersona(role: string | null | undefined): Promise<Persona> {
  const personas = await getAllPersonas();

  if (role) {
    const roleLower = role.toLowerCase();
    for (const p of personas) {
      if (!p.role_patterns || p.slug === 'default') continue;
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
