import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ItemDetail from './pages/ItemDetail';
import Rewards from './pages/Rewards';
import NotificationContainer from './components/NotificationContainer';
import './App.css';

// Dynamically determine API URL based on current host
// This allows the app to work on mobile (same network) without manual config
const getApiBase = () => {
  // If explicitly set via environment variable, use that
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // In production, API is on the same origin
  if (import.meta.env.PROD) {
    return '/api';
  }
  
  // In development, use the same hostname but port 3001
  // This works for both localhost AND when accessing from mobile via IP
  const currentHost = window.location.hostname;
  return `http://${currentHost}:3001/api`;
};

const API_BASE = getApiBase();

function App() {
  const [items, setItems] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = async () => {
    try {
      const res = await fetch(`${API_BASE}/items`);
      const data = await res.json();
      setItems(data);
    } catch (error) {
      console.error('Failed to fetch items:', error);
    }
  };

  const fetchAlerts = async () => {
    try {
      const res = await fetch(`${API_BASE}/alerts/unread`);
      const data = await res.json();
      setAlerts(data);
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    }
  };

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchItems(), fetchAlerts()]);
      setLoading(false);
    };
    init();
  }, []);

  const refreshData = () => {
    fetchItems();
    fetchAlerts();
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">🌙</div>
        <div className="loading-spinner"></div>
        <p>✨ beepbeep.cheap ✨</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      {/* Real-time notification toasts */}
      <NotificationContainer 
        apiBase={API_BASE} 
        onNewAlert={refreshData}
      />
      
      <Routes>
        <Route 
          path="/" 
          element={
            <Dashboard 
              items={items} 
              alerts={alerts} 
              onRefresh={refreshData}
              apiBase={API_BASE}
            />
          } 
        />
        <Route 
          path="/item/:id" 
          element={
            <ItemDetail 
              apiBase={API_BASE}
              onRefresh={refreshData}
            />
          } 
        />
        <Route 
          path="/rewards" 
          element={
            <Rewards 
              apiBase={API_BASE}
            />
          } 
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
