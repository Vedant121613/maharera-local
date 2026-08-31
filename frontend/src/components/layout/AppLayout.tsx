import React from 'react';
import type { ReactNode } from 'react';
import Sidebar from './Sidebar';

export interface AppLayoutProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  children?: ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ activeTab, setActiveTab, children }) => {
  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#f3f4f6' }}>
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflowY: 'auto', padding: '2rem' }}>
        {children}
      </div>
    </div>
  );
};

export default AppLayout;