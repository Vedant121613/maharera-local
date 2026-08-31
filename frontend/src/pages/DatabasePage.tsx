import React, { useState } from 'react';

export const DatabasePage: React.FC = () => {
  const [apiUrl, setApiUrl] = useState<string>('http://localhost:5000');
  const [dbHost, setDbHost] = useState<string>('localhost');
  const [dbPort, setDbPort] = useState<string>('5432');
  const [dbName, setDbName] = useState<string>('maharera_db');
  const [dbUser, setDbUser] = useState<string>('postgres');
  const [dbPassword, setDbPassword] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const handleTestConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus('idle');
    setMessage(null);

    const cleanUrl = apiUrl.replace(/\/$/, '');

    try {
      const res = await fetch(`${cleanUrl}/api/health`);
      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
      setStatus('success');
      setMessage('Successfully connected to API server!');
    } catch (err: unknown) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Server connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ width: '100%', maxWidth: '1000px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: 0 }}>
          Database & Server Configuration
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
          Configure API endpoints and PostgreSQL server credentials directly from UI.
        </p>
      </div>

      <form
        onSubmit={handleTestConnection}
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          padding: '1.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem'
        }}
      >
        <div style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#374151', margin: 0 }}>
            1. Backend API Endpoint
          </h2>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#4b5563', marginBottom: '0.35rem' }}>
            API Target Base URL
          </label>
          <input
            type="url"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="http://localhost:5000"
            required
            style={{
              width: '100%',
              padding: '0.6rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.9rem',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: '0.75rem', marginTop: '0.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#374151', margin: 0 }}>
            2. Database Connection Credentials
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#4b5563', marginBottom: '0.35rem' }}>
              Host Name
            </label>
            <input
              type="text"
              value={dbHost}
              onChange={(e) => setDbHost(e.target.value)}
              placeholder="localhost"
              style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.9rem', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#4b5563', marginBottom: '0.35rem' }}>
              Port
            </label>
            <input
              type="text"
              value={dbPort}
              onChange={(e) => setDbPort(e.target.value)}
              placeholder="5432"
              style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.9rem', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#4b5563', marginBottom: '0.35rem' }}>
              Database Name
            </label>
            <input
              type="text"
              value={dbName}
              onChange={(e) => setDbName(e.target.value)}
              placeholder="maharera_db"
              style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.9rem', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#4b5563', marginBottom: '0.35rem' }}>
              User
            </label>
            <input
              type="text"
              value={dbUser}
              onChange={(e) => setDbUser(e.target.value)}
              placeholder="postgres"
              style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.9rem', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#4b5563', marginBottom: '0.35rem' }}>
              Password
            </label>
            <input
              type="password"
              value={dbPassword}
              onChange={(e) => setDbPassword(e.target.value)}
              placeholder="••••••••"
              style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.9rem', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div style={{ marginTop: '0.5rem' }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '0.65rem 1.25rem',
              backgroundColor: loading ? '#9ca3af' : '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
              transition: 'background 0.2s'
            }}
          >
            {loading ? 'Testing Connection...' : 'Save & Connect Database'}
          </button>
        </div>
      </form>

      {message && (
        <div
          style={{
            marginTop: '1.25rem',
            padding: '1rem',
            borderRadius: '8px',
            backgroundColor: status === 'success' ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${status === 'success' ? '#bbf7d0' : '#fecaca'}`,
            color: status === 'success' ? '#166534' : '#991b1b',
            fontSize: '0.9rem'
          }}
        >
          <strong>{status === 'success' ? ' Connected: ' : ' Error: '}</strong>
          {message}
        </div>
      )}
    </div>
  );
};

export default DatabasePage;