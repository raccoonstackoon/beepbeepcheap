import { useState, useEffect } from 'react';
import { MoreHorizontal, Share, MoreVertical, Plus } from 'lucide-react';
import './InstallPrompt.css';

function isIos() {
  return /iP(hone|ad|od)/.test(navigator.userAgent);
}

/** Real Mobile Safari (not Chrome/Firefox/Edge on iOS) — share sheet flow differs */
function isIosSafari() {
  const ua = navigator.userAgent;
  const ios = /iP(hone|ad|od)/.test(ua);
  const webkitSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
  return ios && webkitSafari;
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
}

/** Safari on iPhone: menu ⋯ → Share → More → Add to Home Screen */
const SAFARI_STEPS = [
  {
    body: (
      <>
        Tap the <strong>⋯</strong> (three-dots) button at the <strong>bottom right</strong>
      </>
    ),
    hint: (
      <>
        <MoreHorizontal size={20} aria-hidden />
        <span>Opens Safari’s menu</span>
      </>
    ),
  },
  {
    body: (
      <>
        Tap <strong>Share</strong>
      </>
    ),
    hint: (
      <>
        <Share size={20} aria-hidden />
        <span>In that menu</span>
      </>
    ),
  },
  {
    body: (
      <>
        Tap <strong>More</strong> — or <strong>View more</strong> if that’s what you see
      </>
    ),
    hint: (
      <>
        <MoreVertical size={20} aria-hidden />
        <span>So “Add to Home Screen” can appear</span>
      </>
    ),
  },
  {
    body: (
      <>
        Tap <strong>Add to Home Screen</strong>, then confirm with <strong>Add</strong>
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

  const safariFlow = isIosSafari();

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

  const openHow = () => {
    setInstructionStep(0);
    setShowHow(true);
  };

  const closeHow = () => {
    setShowHow(false);
    setInstructionStep(0);
  };

  if (!visible) return null;

  return (
    <div className="install-gate">
      <div className={`install-gate-content ${showHow ? 'install-gate-content--wide' : ''}`}>
        {!showHow ? (
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
        ) : safariFlow ? (
          <div className="install-gate-how install-gate-how--card fade-in">
            <div className="install-gate-card">
              <h2 className="install-gate-how-title">Add in Safari</h2>
              <p className="install-gate-how-sub">
                Step {instructionStep + 1} of {SAFARI_STEPS.length}
              </p>

              <div className="install-steps">
                {SAFARI_STEPS.map((step, i) => (
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
                {instructionStep < SAFARI_STEPS.length - 1 ? (
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
        ) : (
          <div className="install-gate-how install-gate-how--card fade-in">
            <div className="install-gate-card">
              <h2 className="install-gate-how-title">Use Safari</h2>
              <p className="install-generic-text">
                To add beepbeep to your home screen with the guided steps, open this page in{' '}
                <strong>Safari</strong> (Apple’s blue compass app), then come back here.
              </p>
              <button type="button" className="btn-install btn-install-primary btn-install-lg" onClick={closeHow}>
                OK
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
