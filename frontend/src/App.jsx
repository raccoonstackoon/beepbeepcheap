import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ItemDetail from './pages/ItemDetail';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

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
      </Routes>
    </BrowserRouter>
  );
}

export default App;
