export interface Campaign {
  id: string;
  name: string;
  audience: string;
  voice_style: string;
  inbox_config: string; // JSON string of {host, port, user, password}
  created_at: string;
}

export interface InboundEmail {
  id: string;
  campaign_id: string;
  from_name: string;
  from_email: string;
  subject: string;
  body: string;
  raw: string;
  received_at: string;
  status: 'new' | 'processed' | 'called' | 'failed';
}

export interface Contact {
  id: string;
  email_id: string;
  name: string | null;
  role: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  extracted_at: string;
}

export interface Script {
  id: string;
  contact_id: string;
  campaign_id: string;
  content: string;
  generated_at: string;
}

export interface Call {
  id: string;
  contact_id: string;
  script_id: string;
  campaign_id: string;
  twilio_sid: string | null;
  status: 'pending' | 'calling' | 'connected' | 'completed' | 'failed';
  started_at: string | null;
  ended_at: string | null;
  duration: number | null;
  transcript_url: string | null;
}

export interface Transcript {
  id: string;
  call_id: string;
  content: string;
  summary: string;
  created_at: string;
}

export interface DashboardStats {
  total_emails: number;
  active_calls: number;
  success_rate: number;
  avg_duration: number;
  recent_emails: InboundEmail[];
  active_call_list: Call[];
  recent_calls: Call[];
  recent_transcripts: Transcript[];
}

export interface ActivityEvent {
  type: 'email_received' | 'contact_extracted' | 'call_started' | 'call_completed' | 'call_failed';
  data: any;
  timestamp: string;
}
