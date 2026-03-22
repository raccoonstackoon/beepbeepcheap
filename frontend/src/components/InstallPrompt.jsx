import { useState, useEffect } from 'react';
import { Share } from 'lucide-react';
import './InstallPrompt.css';

function isIos() {
  return /iP(hone|ad|od)/.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
}

export default function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [showHow, setShowHow] = useState(false);

  useEffect(() => {
    if (!isIos() || isStandalone()) return;
    const timer = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (isStandalone()) setVisible(false);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  if (!visible) return null;

  return (
    <div className="install-gate">
      <div className="install-gate-content">
        {!showHow ? (
          <div className="install-gate-ask fade-in">
            <img src="/icons/icon-192.png" alt="beepbeep" className="install-gate-icon" />
            <h2 className="install-gate-title">Add beepbeep to your home screen</h2>
            <p className="install-gate-desc">
              Works best as an app. Takes 10 seconds!
            </p>
            <button
              className="btn-install btn-install-primary btn-install-lg"
              onClick={() => setShowHow(true)}
            >
              Sure!
            </button>
          </div>
        ) : (
          <div className="install-gate-how fade-in">
            <p className="install-gate-how-line">
              Tap <Share size={16} className="install-inline-icon" /> at the bottom, then <strong>"Add to Home Screen"</strong>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
