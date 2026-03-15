import { useState, useEffect } from 'react';
import { X, Share, Plus } from 'lucide-react';
import './InstallPrompt.css';

function isIosSafari() {
  const ua = navigator.userAgent;
  const isIos = /iP(hone|ad|od)/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
  return isIos && isSafari;
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
}

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (isStandalone()) return;

    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      const threeDays = 3 * 24 * 60 * 60 * 1000;
      if (Date.now() - dismissedAt < threeDays) return;
    }

    const timer = setTimeout(() => setShow(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  if (!show) return null;

  const isIos = isIosSafari();

  return (
    <div className="install-prompt-overlay fade-in">
      <div className="install-prompt">
        <button className="install-prompt-close" onClick={handleDismiss} aria-label="Close">
          <X size={16} />
        </button>

        <div className="install-prompt-header">
          <img src="/icons/icon-192.png" alt="beepbeep" className="install-prompt-icon" />
          <div>
            <h3 className="install-prompt-title">Install beepbeep.cheap</h3>
            <p className="install-prompt-subtitle">Add to your home screen for the full app experience</p>
          </div>
        </div>

        {isIos ? (
          <div className="install-steps">
            <div className={`install-step ${step === 0 ? 'install-step-active' : step > 0 ? 'install-step-done' : ''}`}>
              <div className="install-step-number">1</div>
              <div className="install-step-content">
                <p>Tap the <strong>Share</strong> button in Safari's toolbar</p>
                <div className="install-step-icon-hint">
                  <Share size={20} />
                  <span>It looks like this (bottom of screen)</span>
                </div>
              </div>
            </div>
            <div className={`install-step ${step === 1 ? 'install-step-active' : step > 1 ? 'install-step-done' : ''}`}>
              <div className="install-step-number">2</div>
              <div className="install-step-content">
                <p>Scroll down and tap <strong>"Add to Home Screen"</strong></p>
                <div className="install-step-icon-hint">
                  <Plus size={20} />
                  <span>You may need to scroll in the share menu</span>
                </div>
              </div>
            </div>
            <div className={`install-step ${step === 2 ? 'install-step-active' : ''}`}>
              <div className="install-step-number">3</div>
              <div className="install-step-content">
                <p>Tap <strong>"Add"</strong> in the top right corner — done!</p>
              </div>
            </div>
            <div className="install-step-nav">
              {step > 0 && (
                <button className="btn-install btn-install-ghost" onClick={() => setStep(s => s - 1)}>Back</button>
              )}
              {step < 2 ? (
                <button className="btn-install btn-install-primary" onClick={() => setStep(s => s + 1)}>Next</button>
              ) : (
                <button className="btn-install btn-install-primary" onClick={handleDismiss}>Got it!</button>
              )}
            </div>
          </div>
        ) : (
          <div className="install-steps">
            <p className="install-generic-text">
              Open this page in <strong>Safari</strong> on your iPhone, then tap the Share button and select "Add to Home Screen" to install the app.
            </p>
            <button className="btn-install btn-install-primary" onClick={handleDismiss}>Got it!</button>
          </div>
        )}
      </div>
    </div>
  );
}
