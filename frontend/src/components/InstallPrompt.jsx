import { useState, useEffect } from 'react';
import { Share, MoreVertical, Plus, BellRing } from 'lucide-react';
import './InstallPrompt.css';
import { enablePushNotifications, syncExistingPushSubscription } from '../pushNotifications.js';

function isIos() {
  return /iP(hone|ad|od)/.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
}

/** Generic steps — exact menus differ by browser; labels vary slightly on screen */
const INSTALL_STEPS = [
  {
    body: (
      <>
        Tap <strong>Share</strong>
      </>
    ),
    hint: (
      <>
        <Share size={20} aria-hidden />
        <span>Usually in the toolbar or browser menu</span>
      </>
    ),
  },
  {
    body: (
      <>
        Tap <strong>View more</strong> <span className="install-step-muted">(or similar)</span>
      </>
    ),
    hint: (
      <>
        <MoreVertical size={20} aria-hidden />
        <span>So you can see more actions</span>
      </>
    ),
  },
  {
    body: (
      <>
        Tap <strong>Add to Home Screen</strong>, then confirm if asked
      </>
    ),
    hint: (
      <>
        <Plus size={20} aria-hidden />
        <span>You’re all set</span>
      </>
    ),
  },
];

export default function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const [instructionStep, setInstructionStep] = useState(0);
  const [notificationPrompt, setNotificationPrompt] = useState(false);
  const [enablingNotifications, setEnablingNotifications] = useState(false);

  useEffect(() => {
    if (!isIos()) return;

    if (!isStandalone()) {
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }

    let cancelled = false;
    syncExistingPushSubscription().then((result) => {
      if (cancelled || result.status !== 'ready') return;
      if (localStorage.getItem('beepbeep-notification-prompt-dismissed') === '1') return;
      setNotificationPrompt(true);
      setVisible(true);
    }).catch((error) => console.error('Could not check notification setup:', error));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (isStandalone()) return;
    const handleVisibility = () => {
      if (isStandalone()) setVisible(false);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const openHow = () => {
    setInstructionStep(0);
    setShowHow(true);
  };

  const closeHow = () => {
    setShowHow(false);
    setInstructionStep(0);
  };

  const enableNotifications = async () => {
    setEnablingNotifications(true);
    try {
      const result = await enablePushNotifications();
      window.dispatchEvent(new CustomEvent('push-status-changed', { detail: result.status }));
      if (result.status === 'enabled' || result.status === 'denied') setVisible(false);
    } catch (error) {
      console.error('Could not enable price alerts:', error);
    } finally {
      setEnablingNotifications(false);
    }
  };

  const dismissNotifications = () => {
    localStorage.setItem('beepbeep-notification-prompt-dismissed', '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="install-gate">
      <div className={`install-gate-content ${showHow ? 'install-gate-content--wide' : ''}`}>
        {notificationPrompt ? (
          <div className="install-gate-ask fade-in">
            <BellRing size={54} aria-hidden />
            <h2 className="install-gate-title">Turn on price alerts</h2>
            <p className="install-gate-desc">
              Get a normal iPhone notification when one of your saved products gets cheaper—even when beepbeep is closed.
            </p>
            <button
              type="button"
              className="btn-install btn-install-primary btn-install-lg"
              onClick={enableNotifications}
              disabled={enablingNotifications}
            >
              {enablingNotifications ? 'Turning on…' : 'Turn on price alerts'}
            </button>
            <button type="button" className="btn-install btn-install-ghost" onClick={dismissNotifications}>
              Maybe later
            </button>
          </div>
        ) : !showHow ? (
          <div className="install-gate-ask fade-in">
            <img src="/icons/icon-192.png" alt="beepbeep" className="install-gate-icon" />
            <h2 className="install-gate-title">Add beepbeep to your home screen</h2>
            <p className="install-gate-desc">
              Works best as an app. Takes 10 seconds!
            </p>
            <button
              type="button"
              className="btn-install btn-install-primary btn-install-lg"
              onClick={openHow}
            >
              Sure!
            </button>
          </div>
        ) : (
          <div className="install-gate-how install-gate-how--card fade-in">
            <div className="install-gate-card">
              <h2 className="install-gate-how-title">How to add</h2>
              <p className="install-gate-how-sub">
                Step {instructionStep + 1} of {INSTALL_STEPS.length} — menus look a bit different in each browser
              </p>

              <div className="install-steps">
                {INSTALL_STEPS.map((step, i) => (
                  <div
                    key={i}
                    className={`install-step ${
                      i === instructionStep
                        ? 'install-step-active'
                        : i < instructionStep
                          ? 'install-step-done'
                          : ''
                    }`}
                  >
                    <div className="install-step-number" aria-hidden>
                      {i + 1}
                    </div>
                    <div className="install-step-content">
                      <p>{step.body}</p>
                      {i === instructionStep && (
                        <div className="install-step-icon-hint">{step.hint}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="install-step-nav">
                {instructionStep > 0 ? (
                  <button
                    type="button"
                    className="btn-install btn-install-ghost"
                    onClick={() => setInstructionStep((s) => s - 1)}
                  >
                    Back
                  </button>
                ) : (
                  <button type="button" className="btn-install btn-install-ghost" onClick={closeHow}>
                    Back
                  </button>
                )}
                {instructionStep < INSTALL_STEPS.length - 1 ? (
                  <button
                    type="button"
                    className="btn-install btn-install-primary"
                    onClick={() => setInstructionStep((s) => s + 1)}
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-install btn-install-primary"
                    onClick={closeHow}
                  >
                    Got it!
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
