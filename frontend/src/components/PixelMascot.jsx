import './PixelMascot.css';

export function Hyrax({ variant = 'smiling', className = '', useGif = false, gifSrc = null }) {
  // If using a gif, render an img tag instead of SVG
  if (useGif && gifSrc) {
    return (
      <div className={`pixel-mascot hyrax hyrax-${variant} ${className} hyrax-gif`}>
        <img src={gifSrc} alt="Hyrax" className="mascot-gif" />
      </div>
    );
  }

  return (
    <div className={`pixel-mascot hyrax hyrax-${variant} ${className}`}>
      <svg width="64" height="64" viewBox="0 0 64 64" className="mascot-svg">
        {/* Body */}
        <rect x="16" y="32" width="32" height="24" fill="#D4A574" stroke="#1A1A2E" strokeWidth="2"/>
        {/* Head */}
        <rect x="20" y="16" width="24" height="20" fill="#E8C99B" stroke="#1A1A2E" strokeWidth="2"/>
        {/* Ears */}
        <rect x="18" y="12" width="8" height="10" fill="#C99A6A" stroke="#1A1A2E" strokeWidth="2"/>
        <rect x="38" y="12" width="8" height="10" fill="#C99A6A" stroke="#1A1A2E" strokeWidth="2"/>
        {/* Eyes */}
        {variant === 'blinking' ? (
          <>
            <line x1="24" y1="26" x2="30" y2="26" stroke="#1A1A2E" strokeWidth="2"/>
            <line x1="34" y1="26" x2="40" y2="26" stroke="#1A1A2E" strokeWidth="2"/>
          </>
        ) : (
          <>
            <circle cx="27" cy="26" r="3" fill="#1A1A2E"/>
            <circle cx="37" cy="26" r="3" fill="#1A1A2E"/>
          </>
        )}
        {/* Nose */}
        <rect x="30" y="30" width="4" height="4" fill="#1A1A2E"/>
        {/* Mouth - smiling */}
        <path d="M 28 34 Q 32 38 36 34" stroke="#1A1A2E" strokeWidth="2" fill="none"/>
        {/* Paws */}
        <rect x="18" y="50" width="8" height="6" fill="#C99A6A" stroke="#1A1A2E" strokeWidth="2"/>
        <rect x="38" y="50" width="8" height="6" fill="#C99A6A" stroke="#1A1A2E" strokeWidth="2"/>
      </svg>
    </div>
  );
}

export function Raccoon({ variant = 'waving', className = '', useGif = false, gifSrc = null }) {
  // If using a gif/image, render an img tag instead of SVG
  if (useGif && gifSrc) {
    return (
      <div className={`pixel-mascot raccoon raccoon-${variant} ${className} raccoon-gif`}>
        <img src={gifSrc} alt="Raccoon" className="mascot-gif" />
      </div>
    );
  }

  return (
    <div className={`pixel-mascot raccoon raccoon-${variant} ${className}`}>
      <svg width="64" height="64" viewBox="0 0 64 64" className="mascot-svg">
        {/* Body */}
        <rect x="16" y="32" width="32" height="24" fill="#5A5A5A" stroke="#1A1A2E" strokeWidth="2"/>
        {/* Head */}
        <rect x="20" y="16" width="24" height="20" fill="#7A7A7A" stroke="#1A1A2E" strokeWidth="2"/>
        {/* Mask */}
        <rect x="22" y="20" width="20" height="12" fill="#1A1A2E"/>
        <rect x="24" y="22" width="16" height="8" fill="#7A7A7A"/>
        {/* Ears */}
        <rect x="18" y="12" width="8" height="10" fill="#5A5A5A" stroke="#1A1A2E" strokeWidth="2"/>
        <rect x="38" y="12" width="8" height="10" fill="#5A5A5A" stroke="#1A1A2E" strokeWidth="2"/>
        {/* Eyes */}
        <circle cx="28" cy="28" r="2" fill="#FFD700"/>
        <circle cx="36" cy="28" r="2" fill="#FFD700"/>
        {/* Nose */}
        <rect x="30" y="30" width="4" height="3" fill="#FFB6C1"/>
        {/* Mouth */}
        <path d="M 30 33 Q 32 36 34 33" stroke="#1A1A2E" strokeWidth="2" fill="none"/>
        {/* Tail */}
        <rect x="44" y="40" width="12" height="6" fill="#5A5A5A" stroke="#1A1A2E" strokeWidth="2" className="raccoon-tail"/>
        <rect x="48" y="38" width="4" height="4" fill="#1A1A2E"/>
        <rect x="52" y="36" width="4" height="4" fill="#1A1A2E"/>
        {/* Paws */}
        <rect x="18" y="50" width="8" height="6" fill="#5A5A5A" stroke="#1A1A2E" strokeWidth="2"/>
        <rect x="38" y="50" width="8" height="6" fill="#5A5A5A" stroke="#1A1A2E" strokeWidth="2"/>
        {/* Waving paw */}
        {variant === 'waving' && (
          <g className="waving-paw">
            <rect x="48" y="20" width="8" height="6" fill="#5A5A5A" stroke="#1A1A2E" strokeWidth="2" transform="rotate(-20 52 23)"/>
          </g>
        )}
      </svg>
    </div>
  );
}

