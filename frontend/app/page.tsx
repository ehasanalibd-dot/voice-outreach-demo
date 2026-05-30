'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface DashboardData {
  total_emails: number;
  active_calls: number;
  success_rate: number;
  avg_duration: number;
  total_calls: number;
  completed_calls: number;
  recent_emails: any[];
  active_call_list: any[];
  recent_calls: any[];
  recent_transcripts: any[];
  campaigns: any[];
}

interface ActivityEvent {
  type: string;
  data: any;
  timestamp: string;
}

const API = '/api';

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<string>('');
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [campaignForm, setCampaignForm] = useState({ name: '', audience: '', voice_style: 'professional' });
  const [expandedTranscript, setExpandedTranscript] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const activityLogRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const params = selectedCampaign ? `?campaign_id=${selectedCampaign}` : '';
      const res = await fetch(`${API}/dashboard${params}`);
      if (res.ok) setData(await res.json());
    } catch (e) { console.error('Fetch error:', e); }
  }, [selectedCampaign]);

  // WebSocket connection
  useEffect(() => {
    // Auto-detect WebSocket URL — works for both local access and Cloudflare tunnel
    const host = window.location.hostname;
    const port = window.location.port;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    // If accessed via tunnel (no port or port 443/80), connect WS through same origin
    // Cloudflare tunnels support WebSocket upgrades
    let wsUrl: string;
    if (port === '3000') {
      // Local dev — connect directly to backend
      wsUrl = `ws://${host}:4001/ws`;
    } else {
      // Tunnel or production — connect through same origin, proxy /ws to backend
      wsUrl = `${protocol}//${host}${port ? ':' + port : ''}/ws`;
    }
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      setActivities(prev => [{ ...msg, timestamp: msg.timestamp || new Date().toISOString() }, ...prev].slice(0, 50));
      // Refresh data on any event
      fetchData();
    };

    ws.onclose = () => {
      setTimeout(() => {
        const newWs = new WebSocket(wsUrl);
        wsRef.current = newWs;
      }, 3000);
    };

    return () => { ws.close(); };
  }, [fetchData]);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 5000); return () => clearInterval(i); }, [fetchData]);

  const createCampaign = async () => {
    try {
      const res = await fetch(`${API}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campaignForm)
      });
      if (res.ok) {
        const c = await res.json();
        setSelectedCampaign(c.id);
        setShowCampaignForm(false);
        setCampaignForm({ name: '', audience: '', voice_style: 'professional' });
        fetchData();
      }
    } catch (e) { console.error('Campaign create error:', e); }
  };

  const simulateEmail = async () => {
    if (!selectedCampaign) return;
    await fetch(`${API}/emails/mock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: selectedCampaign })
    });
  };

  const simulateBatch = async () => {
    if (!selectedCampaign) return;
    await fetch(`${API}/emails/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: selectedCampaign, count: 5 })
    });
  };

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-500 font-mono animate-pulse">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Campaign Selector + Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <select
            value={selectedCampaign}
            onChange={(e) => setSelectedCampaign(e.target.value)}
            className="bg-dark-700 border border-dark-500 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-accent/50 focus:border-accent outline-none"
          >
            <option value="">All Campaigns</option>
            {data.campaigns.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button onClick={() => setShowCampaignForm(!showCampaignForm)} className="px-4 py-2 bg-accent hover:bg-accent-dark rounded-lg text-sm font-medium transition-colors">
            + New Campaign
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={simulateEmail} disabled={!selectedCampaign} className="px-4 py-2 bg-dark-600 hover:bg-dark-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm transition-colors border border-dark-500">
            📧 Simulate Email
          </button>
          <button onClick={simulateBatch} disabled={!selectedCampaign} className="px-4 py-2 bg-dark-600 hover:bg-dark-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm transition-colors border border-dark-500">
            ⚡ Simulate 5 Emails
          </button>
        </div>
      </div>

      {/* Campaign Form Modal */}
      {showCampaignForm && (
        <div className="bg-dark-800 border border-dark-500 rounded-xl p-6 animate-fade-in">
          <h3 className="text-lg font-semibold mb-4">Create Campaign</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Campaign Name*</label>
              <input type="text" value={campaignForm.name} onChange={(e) => setCampaignForm({...campaignForm, name: e.target.value})} placeholder="Demo Campaign" className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accent/50 outline-none" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Target Audience</label>
              <input type="text" value={campaignForm.audience} onChange={(e) => setCampaignForm({...campaignForm, audience: e.target.value})} placeholder="Insurance executives" className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accent/50 outline-none" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Voice Style</label>
              <select value={campaignForm.voice_style} onChange={(e) => setCampaignForm({...campaignForm, voice_style: e.target.value})} className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accent/50 outline-none">
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="energetic">Energetic</option>
                <option value="warm">Warm</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={createCampaign} className="px-4 py-2 bg-accent hover:bg-accent-dark rounded-lg text-sm font-medium transition-colors">Create</button>
            <button onClick={() => setShowCampaignForm(false)} className="px-4 py-2 bg-dark-600 hover:bg-dark-500 rounded-lg text-sm transition-colors border border-dark-500">Cancel</button>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Emails" value={data.total_emails} icon="📧" color="blue" />
        <StatCard label="Active Calls" value={data.active_calls} icon="📞" color="amber" pulse={data.active_calls > 0} />
        <StatCard label="Success Rate" value={`${data.success_rate}%`} icon="✅" color="emerald" />
        <StatCard label="Avg Duration" value={`${data.avg_duration}s`} icon="⏱️" color="purple" />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Email Feed */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-dark-600 flex items-center justify-between">
            <h2 className="font-semibold text-sm">📧 Inbound Emails</h2>
            <span className="text-xs text-gray-500 font-mono">{data.recent_emails?.length || 0}</span>
          </div>
          <div className="max-h-[400px] overflow-y-auto divide-y divide-dark-700">
            {data.recent_emails?.length === 0 && (
              <div className="px-4 py-8 text-center text-gray-500 text-sm">No emails yet. Use simulation buttons above.</div>
            )}
            {data.recent_emails?.map((email: any) => (
              <EmailRow key={email.id} email={email} />
            ))}
          </div>
        </div>

        {/* Calls Panel */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-dark-600 flex items-center justify-between">
            <h2 className="font-semibold text-sm">📞 Calls</h2>
            {data.active_calls > 0 && <span className="text-xs text-amber-400 font-mono live-pulse">{data.active_calls} active</span>}
          </div>
          <div className="max-h-[400px] overflow-y-auto divide-y divide-dark-700">
            {data.active_call_list?.length === 0 && data.recent_calls?.length === 0 && (
              <div className="px-4 py-8 text-center text-gray-500 text-sm">No calls yet.</div>
            )}
            {data.active_call_list?.map((call: any) => (
              <CallRow key={call.id} call={call} isActive />
            ))}
            {data.recent_calls?.map((call: any) => (
              <CallRow key={call.id} call={call} isActive={false} />
            ))}
          </div>
        </div>
      </div>

      {/* Transcripts */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-dark-600">
          <h2 className="font-semibold text-sm">📝 Recent Transcripts</h2>
        </div>
        <div className="divide-y divide-dark-700">
          {data.recent_transcripts?.length === 0 && (
            <div className="px-4 py-6 text-center text-gray-500 text-sm">No transcripts yet.</div>
          )}
          {data.recent_transcripts?.map((t: any) => (
            <div key={t.id} className="px-4 py-3">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedTranscript(expandedTranscript === t.id ? null : t.id)}>
                <div>
                  <span className="font-medium text-sm">{t.contact_name || 'Unknown'}</span>
                  <span className="text-xs text-gray-500 ml-2">{t.created_at}</span>
                </div>
                <span className="text-xs text-gray-500">{expandedTranscript === t.id ? '▲' : '▼'}</span>
              </div>
              {expandedTranscript === t.id && (
                <div className="mt-3 space-y-2 animate-fade-in">
                  <p className="text-sm text-gray-300 leading-relaxed">{t.content}</p>
                  {t.summary && <p className="text-xs text-accent-light bg-accent/10 p-2 rounded">{t.summary}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Activity Log */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-dark-600 flex items-center justify-between">
          <h2 className="font-semibold text-sm">⚡ Live Activity</h2>
          <span className="text-xs text-gray-500 font-mono">{activities.length} events</span>
        </div>
        <div ref={activityLogRef} className="max-h-[250px] overflow-y-auto p-3 space-y-1 font-mono text-xs">
          {activities.length === 0 && (
            <div className="text-center text-gray-600 py-4">Waiting for events...</div>
          )}
          {activities.map((event, i) => (
            <ActivityLine key={`${event.timestamp}-${i}`} event={event} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color, pulse }: { label: string; value: any; icon: string; color: string; pulse?: boolean }) {
  const colorMap: Record<string, string> = {
    blue: 'from-blue-500/10 to-blue-500/5 border-blue-500/20',
    amber: 'from-amber-500/10 to-amber-500/5 border-amber-500/20',
    emerald: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/20',
    purple: 'from-purple-500/10 to-purple-500/5 border-purple-500/20',
  };
  return (
    <div className={`bg-gradient-to-br ${colorMap[color]} border rounded-xl p-4 ${pulse ? 'animate-pulse-slow' : ''}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400 uppercase tracking-wider">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="text-2xl font-bold font-mono">{value}</div>
    </div>
  );
}

function EmailRow({ email }: { email: any }) {
  const statusColors: Record<string, string> = {
    new: 'bg-blue-500',
    processed: 'bg-amber-500',
    called: 'bg-emerald-500',
    failed: 'bg-red-500',
  };
  return (
    <div className="px-4 py-3 flex items-center gap-3 hover:bg-dark-700/50 transition-colors">
      <span className={`w-2 h-2 rounded-full ${statusColors[email.status] || 'bg-gray-500'} flex-shrink-0`}></span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{email.from_name || email.from_email || 'Unknown'}</div>
        <div className="text-xs text-gray-500 truncate">{email.subject || '(no subject)'}</div>
      </div>
      <span className="text-xs text-gray-600 font-mono flex-shrink-0">{email.status}</span>
    </div>
  );
}

function CallRow({ call, isActive }: { call: any; isActive: boolean }) {
  const statusColors: Record<string, string> = {
    pending: 'text-gray-400',
    calling: 'text-amber-400',
    connected: 'text-blue-400',
    completed: 'text-emerald-400',
    failed: 'text-red-400',
  };
  return (
    <div className={`px-4 py-3 flex items-center gap-3 ${isActive ? 'bg-amber-500/5' : ''}`}>
      <span className={`text-lg ${isActive ? 'live-pulse' : ''}`}>📞</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{call.contact_name || 'Unknown'}</div>
        <div className="text-xs text-gray-500 truncate">{call.contact_company || ''} {call.contact_phone ? `• ${call.contact_phone}` : ''}</div>
      </div>
      <span className={`text-xs font-mono ${statusColors[call.status] || 'text-gray-400'}`}>{call.status}</span>
    </div>
  );
}

function ActivityLine({ event }: { event: ActivityEvent }) {
  const colors: Record<string, string> = {
    email_received: 'text-blue-400',
    contact_extracted: 'text-purple-400',
    call_started: 'text-amber-400',
    call_completed: 'text-emerald-400',
    call_failed: 'text-red-400',
    call_status_update: 'text-cyan-400',
  };
  const icons: Record<string, string> = {
    email_received: '📧',
    contact_extracted: '👤',
    call_started: '📞',
    call_completed: '✅',
    call_failed: '❌',
    call_status_update: '🔄',
  };
  const time = new Date(event.timestamp).toLocaleTimeString();
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-gray-600 w-16">{time}</span>
      <span>{icons[event.type] || '•'}</span>
      <span className={colors[event.type] || 'text-gray-400'}>{event.type}</span>
      <span className="text-gray-500 truncate">{JSON.stringify(event.data).slice(0, 80)}</span>
    </div>
  );
}
