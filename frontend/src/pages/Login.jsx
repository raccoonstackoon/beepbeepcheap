import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiBase } from '../apiConfig';
import hyraxImage from '../assets/hyrax.png';
import raccoonImage from '../assets/raccoon.png';
import './Login.css';

function Login({ onLoginSuccess }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fallingMascots, setFallingMascots] = useState([]);
  const apiBase = getApiBase();

  const handleGoogleSignIn = async (response) => {
    setLoading(true);
    setError('');

    try {
      const guestUserId = localStorage.getItem('beepbeep_user_id');
      const result = await fetch(`${apiBase}/auth/oauth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: response.credential, guestUserId }),
      });

      if (!result.ok) {
        throw new Error('Login failed');
      }

      const data = await result.json();
      localStorage.setItem('beepbeep_jwt', data.token);
      localStorage.setItem('beepbeep_user_id', data.user.id);

      if (onLoginSuccess) onLoginSuccess(data.user);
      navigate('/');
    } catch (err) {
      console.error('Google login error:', err);
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (window.google) {
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: handleGoogleSignIn,
      });
      window.google.accounts.id.renderButton(
        document.getElementById('google-signin-container'),
        { theme: 'outline', size: 'large', width: 300, text: 'signin_with', shape: 'rectangular' }
      );
    }
  }, []);


  // Create falling mascots
  useEffect(() => {
    const createFallingMascot = () => {
      const mascotType = Math.random() > 0.5 ? 'hyrax' : 'raccoon';
      const leftPosition = Math.random() * 100;
      const delay = Math.random() * 2;
      const duration = 3 + Math.random() * 2;
      const size = 60 + Math.random() * 50;

      const mascot = {
        id: Date.now() + Math.random(),
        type: mascotType,
        left: leftPosition,
        delay,
        duration,
        size
      };

      setFallingMascots(prev => [...prev, mascot]);

      setTimeout(() => {
        setFallingMascots(prev => prev.filter(m => m.id !== mascot.id));
      }, (delay + duration) * 1000);
    };

    const interval = setInterval(() => {
      if (Math.random() > 0.3) {
        createFallingMascot();
      }
    }, 2000 + Math.random() * 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="login-container">
      {/* Falling Mascots */}
      {fallingMascots.map(mascot => (
        <div
          key={mascot.id}
          className="falling-mascot"
          style={{
            left: `${mascot.left}%`,
            animationDelay: `${mascot.delay}s`,
            animationDuration: `${mascot.duration}s`,
            width: `${mascot.size}px`,
            height: `${mascot.size}px`
          }}
        >
          <img
            src={mascot.type === 'hyrax' ? hyraxImage : raccoonImage}
            alt={mascot.type}
            className="falling-mascot-img"
          />
        </div>
      ))}

      <div className="login-card">
        <div className="login-header">
          <img src={hyraxImage} alt="hyrax" className="login-logo-image" />
        </div>

        <div className="login-content">
          <h2>Eat the Price Dip</h2>

          {error && <div className="error-message">{error}</div>}

          <div className="login-buttons">
            <div id="google-signin-container" className="google-signin-container"></div>
          </div>

          <div className="login-divider">or continue as guest</div>

          <button
            onClick={() => navigate('/')}
            className="guest-button"
          >
            Guest Mode
          </button>

          <p className="login-note">
            Data won't save or sync. Sign in to keep your list.
          </p>
        </div>

      </div>
    </div>
  );
}

export default Login;
