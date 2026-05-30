'use client';

import { useState, useEffect } from 'react';
import { apiGet, apiPatch, apiPost } from '@/lib/api';

interface Persona {
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

export default function PersonasPage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selected, setSelected] = useState<Persona | null>(null);
  const [tone, setTone] = useState('');
  const [addition, setAddition] = useState('');
  const [patterns, setPatterns] = useState('');
  const [testRole, setTestRole] = useState('');
  const [matchResult, setMatchResult] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => { loadPersonas(); }, []);

  async function loadPersonas() {
    try {
      const data = await apiGet('/personas');
      setPersonas(data);
      if (data.length > 0 && !selected) selectPersona(data[0]);
    } catch (e) { console.error(e); }
  }

  function selectPersona(p: Persona) {
    setSelected(p);
    setTone(p.tone);
    setAddition(p.system_prompt_addition);
    setPatterns(p.role_patterns);
    setMatchResult(null);
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      await apiPatch(`/personas/${selected.slug}`, {
        tone,
        system_prompt_addition: addition,
        role_patterns: patterns,
      });
      setToast('✓ Persona saved');
      setTimeout(() => setToast(''), 3000);
      await loadPersonas();
    } catch (e: any) {
      setToast('✗ ' + e.message);
    } finally { setSaving(false); }
  }

  async function testMatch() {
    if (!testRole) return;
    try {
      const result = await apiPost('/personas/match', { role: testRole });
      setMatchResult(result);
    } catch (e: any) {
      setMatchResult({ error: e.message });
    }
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-20 right-4 z-50 bg-dark-700 border border-dark-500 text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      <div className="grid grid-cols-12 gap-4 min-h-[75vh]">
        {/* Left: Persona list */}
        <div className="col-span-3 bg-dark-800 rounded-lg p-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Personas</h3>
          {personas.map(p => (
            <button
              key={p.id}
              onClick={() => selectPersona(p)}
              className={`w-full text-left p-3 rounded-lg transition-all ${
                selected?.slug === p.slug
                  ? 'bg-purple-600/20 border border-purple-500/40 text-white'
                  : 'bg-dark-700 border border-transparent text-gray-300 hover:bg-dark-600'
              }`}
            >
              <div className="font-medium text-sm">{p.name}</div>
              <div className="text-xs text-gray-500 mt-0.5 truncate">{p.tone}</div>
            </button>
          ))}
        </div>

        {/* Right: Editor */}
        <div className="col-span-9 space-y-4">
          {selected && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">{selected.name}</h2>
                  <p className="text-sm text-gray-400 mt-0.5">{selected.description}</p>
                </div>
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-4 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Persona'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-mono text-gray-500 mb-1 block">TONE DESCRIPTION</label>
                  <textarea
                    value={tone}
                    onChange={e => setTone(e.target.value)}
                    className="w-full h-28 bg-dark-800 border border-dark-500 text-white rounded-lg p-3 text-sm resize-y"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-gray-500 mb-1 block">MATCH PATTERNS (regex)</label>
                  <textarea
                    value={patterns}
                    onChange={e => setPatterns(e.target.value)}
                    placeholder="\\bCEO\\b|\\bCTO\\b"
                    className="w-full h-28 bg-dark-800 border border-dark-500 text-white rounded-lg p-3 text-sm font-mono resize-y"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-mono text-gray-500 mb-1 block">SYSTEM PROMPT ADDITION</label>
                <textarea
                  value={addition}
                  onChange={e => setAddition(e.target.value)}
                  className="w-full h-24 bg-dark-800 border border-dark-500 text-white rounded-lg p-3 text-sm resize-y"
                />
              </div>

              {/* Match Tester */}
              <div className="bg-dark-800 rounded-lg p-4 border border-dark-600">
                <h4 className="text-sm font-semibold text-gray-300 mb-3">🎯 Test Persona Matching</h4>
                <div className="flex gap-3">
                  <input
                    value={testRole}
                    onChange={e => setTestRole(e.target.value)}
                    placeholder="Enter a role (e.g. 'Senior Claims Manager', 'CTO', 'Data Engineer')"
                    className="flex-1 bg-dark-700 border border-dark-500 text-white rounded-lg px-3 py-2 text-sm"
                    onKeyDown={e => e.key === 'Enter' && testMatch()}
                  />
                  <button
                    onClick={testMatch}
                    disabled={!testRole}
                    className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium disabled:opacity-50"
                  >
                    Test Match
                  </button>
                </div>
                {matchResult && (
                  <div className="mt-3 bg-dark-700 rounded-lg p-3">
                    {matchResult.error ? (
                      <p className="text-red-400 text-sm">{matchResult.error}</p>
                    ) : (
                      <div>
                        <div className="text-sm">
                          <span className="text-gray-400">Input:</span> <span className="text-white font-mono">{matchResult.input_role}</span>
                        </div>
                        <div className="text-sm mt-1">
                          <span className="text-gray-400">Matched:</span>{' '}
                          <span className="text-purple-400 font-bold">{matchResult.matched?.name || 'No match'}</span>
                          {matchResult.matched?.tone && (
                            <span className="text-gray-500 ml-2">({matchResult.matched.tone})</span>
                          )}
                        </div>
                        {matchResult.matched?.system_prompt_addition && (
                          <pre className="text-xs text-gray-400 mt-2 border-t border-dark-500 pt-2">{matchResult.matched.system_prompt_addition}</pre>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
