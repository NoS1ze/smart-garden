import { useState, useEffect } from 'react';
import { useToast } from './Toast';

interface NotificationChannel {
  id: string;
  channel_type: string;
  config: Record<string, string>;
  enabled: boolean;
  created_at: string;
}

const CHANNEL_TYPES = [
  { value: 'telegram', label: 'Telegram' },
  { value: 'discord', label: 'Discord' },
  { value: 'webhook', label: 'Custom Webhook' },
  { value: 'email', label: 'Email' },
];

const CONFIG_FIELDS: Record<string, { key: string; label: string; placeholder: string }[]> = {
  telegram: [
    { key: 'bot_token', label: 'Bot Token', placeholder: '123456:ABC-DEF1234...' },
    { key: 'chat_id', label: 'Chat ID', placeholder: '-1001234567890' },
  ],
  discord: [
    { key: 'webhook_url', label: 'Webhook URL', placeholder: 'https://discord.com/api/webhooks/...' },
  ],
  webhook: [
    { key: 'url', label: 'URL', placeholder: 'https://example.com/webhook' },
    { key: 'secret', label: 'Secret (optional)', placeholder: 'HMAC secret for signature' },
  ],
  email: [
    { key: 'address', label: 'Email Address', placeholder: 'you@example.com' },
  ],
};

export function NotificationManager() {
  const apiUrl = import.meta.env.VITE_API_URL;
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState('telegram');
  const [formConfig, setFormConfig] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const toast = useToast();

  async function fetchChannels() {
    const res = await fetch(`${apiUrl}/api/notification-channels`);
    if (res.ok) {
      const json = await res.json();
      setChannels(json.data);
    }
    setLoading(false);
  }

  useEffect(() => { fetchChannels(); }, []);

  async function createChannel() {
    const res = await fetch(`${apiUrl}/api/notification-channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_type: formType, config: formConfig }),
    });
    if (res.ok) {
      setShowForm(false);
      setFormConfig({});
      fetchChannels();
    }
  }

  async function toggleChannel(id: string, enabled: boolean) {
    await fetch(`${apiUrl}/api/notification-channels/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    fetchChannels();
  }

  async function deleteChannel(id: string) {
    await fetch(`${apiUrl}/api/notification-channels/${id}`, { method: 'DELETE' });
    fetchChannels();
  }

  async function testChannel(id: string) {
    setTesting(id);
    try {
      const res = await fetch(`${apiUrl}/api/notification-channels/${id}/test`, { method: 'POST' });
      if (res.ok) {
        toast.success('Test notification sent successfully!');
      } else {
        toast.error('Test notification failed.');
      }
    } catch {
      toast.error('Test notification failed.');
    }
    setTesting(null);
  }

  if (loading) return <div className="page-loading">Loading notifications...</div>;

  return (
    <div className="manager-page">
      <div className="manager-header">
        <h2>Notification Channels</h2>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add Channel'}
        </button>
      </div>

      {showForm && (
        <div className="manager-form">
          <div className="form-group">
            <label>Channel Type</label>
            <select value={formType} onChange={(e) => { setFormType(e.target.value); setFormConfig({}); }}>
              {CHANNEL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          {(CONFIG_FIELDS[formType] || []).map((field) => (
            <div key={field.key} className="form-group">
              <label>{field.label}</label>
              <input
                type="text"
                placeholder={field.placeholder}
                value={formConfig[field.key] || ''}
                onChange={(e) => setFormConfig({ ...formConfig, [field.key]: e.target.value })}
              />
            </div>
          ))}
          <button className="btn-primary" onClick={createChannel}>Save Channel</button>
        </div>
      )}

      <div className="manager-list">
        {channels.length === 0 && <p className="text-muted">No notification channels configured.</p>}
        {channels.map((ch) => (
          <div key={ch.id} className="manager-card">
            <div className="manager-card-header">
              <div>
                <span className="channel-type-badge">{ch.channel_type}</span>
                <span className="channel-config-preview">
                  {ch.channel_type === 'email' && ch.config.address}
                  {ch.channel_type === 'telegram' && `Chat: ${ch.config.chat_id}`}
                  {ch.channel_type === 'discord' && 'Discord Webhook'}
                  {ch.channel_type === 'webhook' && ch.config.url}
                </span>
              </div>
              <div className="channel-actions">
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={ch.enabled}
                    onChange={(e) => toggleChannel(ch.id, e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
                <button
                  className="btn-sm btn-secondary"
                  onClick={() => testChannel(ch.id)}
                  disabled={testing === ch.id}
                >
                  {testing === ch.id ? 'Sending...' : 'Test'}
                </button>
                <button className="btn-sm btn-danger" onClick={() => deleteChannel(ch.id)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
