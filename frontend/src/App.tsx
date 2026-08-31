import { useState } from 'react';
import { AppLayout } from './components/layout/AppLayout';

import ScrapingPage from './pages/ScrapingPage';
import BasicDataPage from './pages/BasicDataPage';
import LinksPage from './pages/LinksPage';
import CleanedDataPage from './pages/CleanedDataPage';
import DatabasePage from './pages/DatabasePage';

export function App() {
  const [activeTab, setActiveTab] = useState('scraping');

  const renderContent = () => {
    switch (activeTab) {
      case 'scraping':
        return <ScrapingPage />;
      case 'basic':
        return <BasicDataPage />;
      case 'links':
        return <LinksPage />;
      case 'cleaned':
        return <CleanedDataPage />;
      case 'database':
        return <DatabasePage />;
      default:
        return <ScrapingPage />;
    }
  };

  return (
    <AppLayout activeTab={activeTab} setActiveTab={setActiveTab}>
      {renderContent()}
    </AppLayout>
  );
}

export default App;