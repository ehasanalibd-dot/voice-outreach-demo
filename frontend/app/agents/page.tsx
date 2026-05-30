'use client';

import { useState, useEffect } from 'react';
import { apiGet, apiPatch, apiPost } from '@/lib/api';

interface Agent {
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

interface PromptVersion {
  id: string;
  agent_slug: string;
  version: number;
  system_prompt: string;
  is_active: boolean;
  created_at: string;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [prompt, setPrompt] = useState('');
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [testOutput, setTestOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => { loadAgents(); }, []);

  async function loadAgents() {
    try {
      const data = await apiGet('/agents');
      setAgents(data);
      if (data.length > 0 && !selected) {
        setSelected(data[0]);
        setPrompt(data[0].system_prompt);
      }
    } catch (e) { console.error(e); }
  }

  async function loadVersions() {
    if (!selected) return;
    try {
      const data = await apiGet(`/agents/${selected.slug}/versions`);
      setVersions(data);
    } catch (e) { console.error(e); }
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      await apiPatch(`/agents/${selected.slug}`, { system_prompt: prompt });
      setToast('✓ Prompt saved — version incremented');
      setTimeout(() => setToast(''), 3000);
      await loadAgents();
      const updated = await apiGet(`/agents/${selected.slug}`);
      setSelected(updated);
    } catch (e: any) {
      setToast('✗ ' + e.message);
    } finally { setSaving(false); }
  }

  async function test() {
    if (!selected || !testInput) return;
    setLoading(true);
    setTestOutput('⏳ Processing...');
    try {
      const result = await apiPost(`/agents/${selected.slug}/test`, { test_input: testInput });
      setTestOutput(result.output || JSON.stringify(result, null, 2));
    } catch (e: any) {
      setTestOutput('✗ Error: ' + e.message);
    } finally { setLoading(false); }
  }

  async function activateVersion(versionId: string) {
    if (!selected) return;
    try {
      await apiPost(`/agents/${selected.slug}/versions/${versionId}/activate`, {});
      setToast('✓ Rolled back to previous version');
      setTimeout(() => setToast(''), 3000);
      await loadAgents();
      const updated = await apiGet(`/agents/${selected.slug}`);
      setSelected(updated);
      setPrompt(updated.system_prompt);
      await loadVersions();
    } catch (e: any) {
      setToast('✗ ' + e.message);
    }
  }

  function selectAgent(a: Agent) {
    setSelected(a);
    setPrompt(a.system_prompt);
    setVersions([]);
    setShowVersions(false);
    setTestInput('');
    setTestOutput('');
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-20 right-4 z-50 bg-dark-700 border border-dark-500 text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      <div className="grid grid-cols-12 gap-4 min-h-[75vh]">
        {/* Left: Agent list */}
        <div className="col-span-3 bg-dark-800 rounded-lg p-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Agents</h3>
          {agents.map(a => (
            <button
              key={a.id}
              onClick={() => selectAgent(a)}
              className={`w-full text-left p-3 rounded-lg transition-all ${
                selected?.slug === a.slug
                  ? 'bg-accent/20 border border-accent/40 text-white'
                  : 'bg-dark-700 border border-transparent text-gray-300 hover:bg-dark-600'
              }`}
            >
              <div className="font-medium text-sm">{a.name}</div>
              <div className="text-xs text-gray-500 mt-0.5">v{a.version} · {a.model?.split('/').pop()}</div>
            </button>
          ))}
        </div>

        {/* Right: Editor */}
        <div className="col-span-9 space-y-4">
          {selected && (
            <>
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">{selected.name}</h2>
                  <p className="text-sm text-gray-400 mt-0.5">{selected.description}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowVersions(!showVersions); if (!showVersions) loadVersions(); }}
                    className="px-3 py-1.5 text-sm bg-dark-700 hover:bg-dark-600 rounded-lg border border-dark-500"
                  >
                    📜 Version History
                  </button>
                  <button
                    onClick={save}
                    disabled={saving}
                    className="px-4 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Prompt'}
                  </button>
                </div>
              </div>

              {/* Prompt editor */}
              <div>
                <label className="text-xs font-mono text-gray-500 mb-1 block">SYSTEM PROMPT</label>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  className="w-full h-64 bg-dark-800 border border-dark-500 text-white rounded-lg p-4 font-mono text-sm resize-y focus:ring-1 focus:ring-accent/50 focus:border-accent/50"
                />
                <div className="text-xs text-gray-500 mt-1">{prompt.length} chars · temp: {selected.temperature} · max_tokens: {selected.max_tokens}</div>
              </div>

              {/* Live Test */}
              <div className="bg-dark-800 rounded-lg p-4 border border-dark-600">
                <h4 className="text-sm font-semibold text-gray-300 mb-3">🧪 Live Test</h4>
                <textarea
                  value={testInput}
                  onChange={e => setTestInput(e.target.value)}
                  placeholder="Paste sample input (email body, contact data, message text...)"
                  className="w-full h-20 bg-dark-700 border border-dark-500 text-white rounded-lg p-3 text-sm resize-y mb-2"
                />
                <button
                  onClick={test}
                  disabled={loading || !testInput}
                  className="px-4 py-1.5 text-sm bg-accent hover:bg-accent-dark text-white rounded-lg font-medium disabled:opacity-50"
                >
                  {loading ? '⏳ Testing...' : '▶ Run Agent'}
                </button>
                {testOutput && (
                  <div className="mt-3 bg-dark-700 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">OUTPUT:</div>
                    <pre className="text-sm text-white whitespace-pre-wrap font-mono">{testOutput}</pre>
                  </div>
                )}
              </div>

              {/* Version History Panel */}
              {showVersions && (
                <div className="bg-dark-800 rounded-lg p-4 border border-dark-600">
                  <h4 className="text-sm font-semibold text-gray-300 mb-3">📜 Version History</h4>
                  {versions.length === 0 ? (
                    <p className="text-sm text-gray-500">No previous versions yet. Save a prompt change to create one.</p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {versions.map(v => (
                        <div key={v.id} className={`p-3 rounded-lg ${v.is_active ? 'bg-accent/10 border border-accent/30' : 'bg-dark-700'}`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-mono text-sm">v{v.version}</span>
                              {v.is_active && <span className="ml-2 text-xs bg-emerald-600 text-white px-2 py-0.5 rounded">ACTIVE</span>}
                              <span className="ml-2 text-xs text-gray-500">{new Date(v.created_at).toLocaleString()}</span>
                            </div>
                            {!v.is_active && (
                              <button
                                onClick={() => activateVersion(v.id)}
                                className="text-xs px-2 py-1 bg-dark-600 hover:bg-dark-500 rounded text-gray-300"
                              >
                                Rollback
                              </button>
                            )}
                          </div>
                          <pre className="text-xs text-gray-400 mt-1 truncate">{v.system_prompt.substring(0, 120)}...</pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
