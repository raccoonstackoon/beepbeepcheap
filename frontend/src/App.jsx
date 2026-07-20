import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ItemDetail from './pages/ItemDetail';
import Rewards from './pages/Rewards';
import Login from './pages/Login';
import NotificationContainer from './components/NotificationContainer';
import InstallPrompt from './components/InstallPrompt';
import './App.css';
import { getApiBase, apiFetch } from './apiConfig.js';

const API_BASE = getApiBase();

function App() {
  const [items, setItems] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = async () => {
    try {
      const res = await apiFetch(API_BASE, '/items');
      if (!res.ok) throw new Error(`Items request failed (${res.status})`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch items:', error);
      setItems([]);
    }
  };

  const fetchAlerts = async () => {
    try {
      const res = await apiFetch(API_BASE, '/alerts/unread');
      if (!res.ok) throw new Error(`Alerts request failed (${res.status})`);
      const data = await res.json();
      setAlerts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
      setAlerts([]);
    }
  };

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchItems(), fetchAlerts()]);
      setLoading(false);
    };
    init();

    // Re-fetch data whenever the user returns to the app (tab switch, home screen, phone unlock)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchItems();
        fetchAlerts();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
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
      
      {/* PWA install prompt for mobile users */}
      <InstallPrompt />
      
      <Routes>
        <Route path="/login" element={<Login onLoginSuccess={refreshData} />} />
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
