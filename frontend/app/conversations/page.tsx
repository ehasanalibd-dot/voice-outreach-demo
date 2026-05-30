'use client';

import { useState, useEffect, useRef } from 'react';
import { apiGet, apiPost } from '@/lib/api';

interface Conversation {
  contact_id: string;
  name: string;
  role: string;
  company: string;
  phone: string;
  message_count: number;
  inbound_count: number;
  outbound_count: number;
  last_message_at: string;
  last_message_preview: string;
  last_message_direction: string;
}

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  sender: 'us' | 'them';
  channel: string;
  content: string;
  created_at: string;
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [contact, setContact] = useState<any>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadConversations(); }, []);
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  async function loadConversations() {
    try {
      const data = await apiGet('/conversations');
      setConversations(data);
    } catch (e) { console.error(e); }
  }

  async function loadThread(contactId: string) {
    setSelectedId(contactId);
    try {
      const data = await apiGet(`/conversations/${contactId}`);
      setMessages(data.messages);
      setContact(data.contact);
    } catch (e) { console.error(e); }
  }

  async function sendReply(manual: boolean = true) {
    if (!selectedId || (!replyText && manual)) return;
    setSending(true);
    try {
      if (aiGenerating && !replyText) {
        // Generate AI reply
        const result = await apiPost(`/conversations/${selectedId}/reply`, {});
        setReplyText('');
      } else {
        await apiPost(`/conversations/${selectedId}/reply`, { message: replyText });
        setReplyText('');
      }
      // Reload thread
      await loadThread(selectedId);
    } catch (e: any) {
      console.error('Send error:', e.message);
    } finally { setSending(false); setAiGenerating(false); }
  }

  async function generateAIReply() {
    if (!selectedId) return;
    setAiGenerating(true);
    setSending(true);
    try {
      const result = await apiPost(`/conversations/${selectedId}/reply`, {});
      setReplyText('');
      await loadThread(selectedId);
    } catch (e: any) {
      console.error('AI reply error:', e.message);
    } finally { setSending(false); setAiGenerating(false); }
  }

  return (
    <div className="grid grid-cols-12 gap-4 min-h-[75vh]">
      {/* Left: Conversation list */}
      <div className="col-span-4 bg-dark-800 rounded-lg overflow-hidden">
        <div className="p-3 border-b border-dark-600">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Conversations ({conversations.length})
          </h3>
        </div>
        <div className="overflow-y-auto max-h-[75vh]">
          {conversations.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">No conversations yet. They&apos;ll appear here when contacts reply to your outreach.</p>
          ) : (
            conversations.map(c => (
              <button
                key={c.contact_id}
                onClick={() => loadThread(c.contact_id)}
                className={`w-full text-left p-3 border-b border-dark-700 transition-colors ${
                  selectedId === c.contact_id ? 'bg-accent/10' : 'hover:bg-dark-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm text-white">{c.name || 'Unknown'}</span>
                  <span className="text-xs text-gray-500">
                    {c.last_message_at ? new Date(c.last_message_at).toLocaleDateString() : ''}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{c.role}{c.company ? ` · ${c.company}` : ''}</div>
                <div className="text-xs text-gray-400 mt-1 truncate">
                  {c.last_message_direction === 'inbound' ? '↩ ' : '↪ '}
                  {c.last_message_preview?.substring(0, 60)}
                </div>
                <div className="flex gap-2 mt-1">
                  <span className="text-xs bg-dark-600 px-1.5 py-0.5 rounded text-blue-400">{c.inbound_count} in</span>
                  <span className="text-xs bg-dark-600 px-1.5 py-0.5 rounded text-green-400">{c.outbound_count} out</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: Thread view */}
      <div className="col-span-8 bg-dark-800 rounded-lg flex flex-col overflow-hidden">
        {selectedId && contact ? (
          <>
            {/* Header */}
            <div className="p-3 border-b border-dark-600">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-white">{contact.name}</h3>
                  <p className="text-xs text-gray-400">{contact.role} · {contact.company} · {contact.phone}</p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div ref={threadRef} className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[55vh]">
              {messages.map(m => (
                <div
                  key={m.id}
                  className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg px-3 py-2 ${
                      m.direction === 'outbound'
                        ? 'bg-accent/20 border border-accent/30'
                        : 'bg-dark-700 border border-dark-600'
                    }`}
                  >
                    <div className="text-sm text-white whitespace-pre-wrap">{m.content}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {m.direction === 'outbound' ? '↪ Us' : '↩ Them'} · {new Date(m.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Reply input */}
            <div className="p-3 border-t border-dark-600">
              <div className="flex gap-2">
                <input
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Type a reply or use AI..."
                  className="flex-1 bg-dark-700 border border-dark-500 text-white rounded-lg px-3 py-2 text-sm"
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendReply())}
                  disabled={sending}
                />
                <button
                  onClick={() => sendReply()}
                  disabled={sending || !replyText}
                  className="px-4 py-2 text-sm bg-accent hover:bg-accent-dark text-white rounded-lg font-medium disabled:opacity-50"
                >
                  {sending ? '...' : 'Send'}
                </button>
                <button
                  onClick={generateAIReply}
                  disabled={sending}
                  className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium disabled:opacity-50"
                  title="Generate AI reply"
                >
                  {aiGenerating ? '⏳' : '🤖 AI'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 text-sm">Select a conversation to view messages</p>
          </div>
        )}
      </div>
    </div>
  );
}
