import React from 'react';

export interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const menuItems = [
    { id: 'scraping', label: 'Scraping Control', icon: '⚡' },
    { id: 'basic', label: 'Basic Data', icon: '📁' },
    { id: 'links', label: 'Project Links', icon: '🔗' },
    { id: 'cleaned', label: 'Cleaned Data', icon: '✨' },
    { id: 'database', label: 'API & Database', icon: '🗄️' },
  ];

  return (
    <aside 
      style={{
        width: '260px',
        minWidth: '260px',
        backgroundColor: '#0f172a',
        color: '#ffffff',
        height: '100vh',
        padding: '1.25rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box'
      }}
    >
      <div style={{ fontSize: '1.15rem', fontWeight: 'bold', paddingBottom: '1rem', marginBottom: '1rem', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>🏢</span> RERA Dashboard
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              border: 'none',
              textAlign: 'left',
              backgroundColor: activeTab === item.id ? '#2563eb' : 'transparent',
              color: activeTab === item.id ? '#ffffff' : '#94a3b8',
              transition: 'all 0.15s ease'
            }}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;