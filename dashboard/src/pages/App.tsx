import { Routes, Route } from 'react-router-dom';
import Layout from '../ui/Layout';
import MemoriesPage from './MemoriesPage';
import SourcesPage from './SourcesPage';
import SettingsPage from './SettingsPage';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<MemoriesPage />} />
        <Route path="/sources" element={<SourcesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Layout>
  );
}
