'use client';

import { useState, useEffect } from 'react';
import { apiGet } from '@/lib/api';

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<any>(null);
  const [personas, setPersonas] = useState<any[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [abTest, setAbTest] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [tab, setTab] = useState<'overview' | 'personas' | 'versions' | 'ab' | 'campaigns'>('overview');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    try {
      const [o, p, v, ab, c] = await Promise.all([
        apiGet('/analytics/overview'),
        apiGet('/analytics/personas'),
        apiGet('/analytics/versions'),
        apiGet('/analytics/ab-test'),
        apiGet('/analytics/campaigns'),
      ]);
      setOverview(o);
      setPersonas(p);
      setVersions(v);
      setAbTest(ab);
      setCampaigns(c);
    } catch (e) { console.error(e); }
  }

  const tabs = [
    { key: 'overview', label: 'Overview', icon: '📊' },
    { key: 'personas', label: 'By Persona', icon: '👤' },
    { key: 'versions', label: 'Prompt Versions', icon: '📜' },
    { key: 'ab', label: 'A/B Test', icon: '🧪' },
    { key: 'campaigns', label: 'By Campaign', icon: '📣' },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-2 border-b border-dark-600 pb-2">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t.key ? 'bg-dark-700 text-white border-b-2 border-accent' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && overview && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Emails', value: overview.total_emails, color: 'text-blue-400' },
            { label: 'Total Calls', value: overview.total_calls, color: 'text-emerald-400' },
            { label: 'Completed', value: overview.completed_calls, color: 'text-green-400' },
            { label: 'Success Rate', value: `${overview.success_rate}%`, color: 'text-accent' },
            { label: 'Inbound Replies', value: overview.inbound_replies, color: 'text-purple-400' },
            { label: 'Outbound Replies', value: overview.outbound_replies, color: 'text-yellow-400' },
          ].map(stat => (
            <div key={stat.label} className="bg-dark-800 rounded-lg p-6 border border-dark-600">
              <div className="text-sm text-gray-400 mb-1">{stat.label}</div>
              <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Persona Performance */}
      {tab === 'personas' && (
        <div className="space-y-3">
          <h3 className="text-lg font-bold text-white">Script Performance by Persona</h3>
          {personas.length === 0 ? (
            <p className="text-gray-500 text-sm">No data yet. Process some emails to see analytics.</p>
          ) : (
            <div className="space-y-2">
              {personas.map(p => (
                <div key={p.persona_slug} className="bg-dark-800 rounded-lg p-4 border border-dark-600">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-semibold text-white">{p.persona_name}</span>
                      <span className="text-xs text-gray-500 ml-2">{p.tone}</span>
                    </div>
                    <span className="text-sm text-gray-400">{p.scripts_generated} scripts generated</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div><span className="text-gray-500">Calls made:</span> <span className="text-white">{p.calls_made || 0}</span></div>
                    <div><span className="text-gray-500">Completed:</span> <span className="text-emerald-400">{p.calls_completed || 0}</span></div>
                    <div><span className="text-gray-500">Success rate:</span> <span className="text-white">{p.calls_made > 0 ? Math.round((p.calls_completed / p.calls_made) * 100) : 0}%</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Prompt Versions */}
      {tab === 'versions' && (
        <div className="space-y-3">
          <h3 className="text-lg font-bold text-white">Prompt Version Performance</h3>
          {versions.length === 0 ? (
            <p className="text-gray-500 text-sm">No versions tracked yet. Edit an agent prompt to start versioning.</p>
          ) : (
            <div className="space-y-2">
              {versions.map((v, i) => (
                <div key={i} className="bg-dark-800 rounded-lg p-4 border border-dark-600 flex items-center justify-between">
                  <div>
                    <span className="font-mono text-sm text-white">{v.agent_slug}</span>
                    <span className="text-xs text-gray-500 ml-2">v{v.version}</span>
                    {v.is_active && <span className="ml-2 text-xs bg-emerald-600 text-white px-2 py-0.5 rounded">ACTIVE</span>}
                  </div>
                  <div className="text-sm text-gray-400">
                    {v.scripts_generated} scripts · <span className="text-xs">{new Date(v.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="text-xs text-gray-500 max-w-xs truncate">{v.prompt_preview}...</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* A/B Test */}
      {tab === 'ab' && (
        <div className="space-y-3">
          <h3 className="text-lg font-bold text-white">A/B Test Results</h3>
          {abTest.length === 0 ? (
            <p className="text-gray-500 text-sm">No A/B test data yet. Scripts are automatically assigned to groups A/B.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {abTest.map(row => (
                <div key={row.ab_group} className="bg-dark-800 rounded-lg p-6 border border-dark-600">
                  <div className="text-2xl font-bold text-white mb-3">Group {row.ab_group}</div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-gray-400">Scripts generated:</span><span className="text-white">{row.scripts_generated}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Calls made:</span><span className="text-white">{row.calls_made || 0}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Completed:</span><span className="text-emerald-400">{row.calls_completed || 0}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Avg script length:</span><span className="text-white">{Math.round(row.avg_script_length / 10)} chars</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Success rate:</span><span className="text-accent">{(row.calls_made || 0) > 0 ? Math.round(((row.calls_completed || 0) / row.calls_made) * 100) : 0}%</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Campaign Performance */}
      {tab === 'campaigns' && (
        <div className="space-y-3">
          <h3 className="text-lg font-bold text-white">Performance by Campaign</h3>
          {campaigns.length === 0 ? (
            <p className="text-gray-500 text-sm">No campaigns yet.</p>
          ) : (
            <div className="space-y-2">
              {campaigns.map(c => (
                <div key={c.id} className="bg-dark-800 rounded-lg p-4 border border-dark-600">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-white">{c.name}</div>
                    <div className="flex gap-2">
                      {c.persona_override && c.persona_override !== 'auto' && (
                        <span className="text-xs bg-purple-600/20 text-purple-400 px-2 py-0.5 rounded">
                          Override: {c.persona_override}
                        </span>
                      )}
                      <span className="text-xs text-gray-500">{new Date(c.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div><span className="text-gray-500">Emails:</span> <span className="text-white">{c.emails_received}</span></div>
                    <div><span className="text-gray-500">Calls:</span> <span className="text-white">{c.calls_made}</span></div>
                    <div><span className="text-gray-500">Completed:</span> <span className="text-emerald-400">{c.calls_completed}</span></div>
                    <div><span className="text-gray-500">Rate:</span> <span className="text-accent">{c.calls_made > 0 ? Math.round((c.calls_completed / c.calls_made) * 100) : 0}%</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
