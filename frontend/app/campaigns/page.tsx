'use client';

import { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';

interface Campaign {
  id: string;
  name: string;
  audience: string;
  voice_style: string;
  persona_override: string;
  created_at: string;
}

interface Persona {
  id: string;
  slug: string;
  name: string;
  tone: string;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', audience: '', voice_style: 'professional', persona_override: 'auto' });
  const [toast, setToast] = useState('');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    try {
      const [c, p] = await Promise.all([apiGet('/campaigns'), apiGet('/personas')]);
      setCampaigns(c);
      setPersonas(p);
    } catch (e) { console.error(e); }
  }

  const selected = campaigns.find(c => c.id === selectedId) || null;

  async function create() {
    if (!form.name) return;
    try {
      await apiPost('/campaigns', form);
      setToast('✓ Campaign created');
      setTimeout(() => setToast(''), 3000);
      setShowCreate(false);
      setForm({ name: '', audience: '', voice_style: 'professional', persona_override: 'auto' });
      await loadAll();
    } catch (e: any) { setToast('✗ ' + e.message); }
  }

  async function updatePersonaOverride(campaignId: string, override: string) {
    try {
      await apiPatch(`/campaigns/${campaignId}`, { persona_override: override });
      setToast(`✓ Override set to: ${override}`);
      setTimeout(() => setToast(''), 3000);
      await loadAll();
    } catch (e: any) { setToast('✗ ' + e.message); }
  }

  async function deleteCampaign(id: string) {
    if (!confirm('Delete this campaign?')) return;
    try {
      await apiDelete(`/campaigns/${id}`);
      if (selectedId === id) setSelectedId(null);
      await loadAll();
    } catch (e: any) { setToast('✗ ' + e.message); }
  }

  async function simulateEmail() {
    if (!selectedId) return;
    try {
      await apiPost('/emails/mock', { campaign_id: selectedId });
      setToast('✓ Test email triggered');
      setTimeout(() => setToast(''), 3000);
    } catch (e: any) { setToast('✗ ' + e.message); }
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-20 right-4 z-50 bg-dark-700 border border-dark-500 text-sm px-4 py-2 rounded-lg shadow-lg">{toast}</div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Campaigns</h2>
        <div className="flex gap-2">
          <button onClick={simulateEmail} disabled={!selectedId} className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-dark rounded-lg disabled:opacity-50">
            🧪 Simulate Email
          </button>
          <button onClick={() => setShowCreate(!showCreate)} className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 rounded-lg">
            + New Campaign
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-dark-800 rounded-lg p-4 border border-dark-600 space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">Create Campaign</h3>
          <div className="grid grid-cols-2 gap-3">
            <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Campaign Name" className="bg-dark-700 border border-dark-500 text-white rounded-lg px-3 py-2 text-sm" />
            <input value={form.audience} onChange={e => setForm({...form, audience: e.target.value})} placeholder="Audience (e.g. insurance execs)" className="bg-dark-700 border border-dark-500 text-white rounded-lg px-3 py-2 text-sm" />
            <input value={form.voice_style} onChange={e => setForm({...form, voice_style: e.target.value})} placeholder="Voice Style" className="bg-dark-700 border border-dark-500 text-white rounded-lg px-3 py-2 text-sm" />
            <select value={form.persona_override} onChange={e => setForm({...form, persona_override: e.target.value})} className="bg-dark-700 border border-dark-500 text-white rounded-lg px-3 py-2 text-sm">
              <option value="auto">Auto-match persona</option>
              {personas.map(p => (
                <option key={p.slug} value={p.slug}>{p.name} ({p.tone.split(',')[0]})</option>
              ))}
            </select>
          </div>
          <button onClick={create} className="px-4 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 rounded-lg">Create</button>
        </div>
      )}

      {/* Campaign list */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {campaigns.map(c => (
          <div
            key={c.id}
            onClick={() => setSelectedId(c.id)}
            className={`bg-dark-800 rounded-lg p-4 border cursor-pointer transition-all ${
              selectedId === c.id ? 'border-accent/50 ring-1 ring-accent/30' : 'border-dark-600 hover:border-dark-500'
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold text-white">{c.name}</h3>
              <button onClick={(e) => { e.stopPropagation(); deleteCampaign(c.id); }} className="text-xs text-red-400 hover:text-red-300">✕</button>
            </div>
            <p className="text-sm text-gray-400 mb-3">{c.audience || 'General audience'}</p>

            {/* Persona override picker */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">PERSONA MODE</label>
              <select
                value={c.persona_override || 'auto'}
                onChange={(e) => { e.stopPropagation(); updatePersonaOverride(c.id, e.target.value); }}
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-dark-700 border border-dark-500 text-white rounded-lg px-2 py-1.5 text-sm"
              >
                <option value="auto">🤖 Auto-match by role</option>
                {personas.map(p => (
                  <option key={p.slug} value={p.slug}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="mt-2 text-xs text-gray-500">
              Voice: {c.voice_style} · Created {new Date(c.created_at).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
