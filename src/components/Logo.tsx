interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 24, className = "" }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      fill="none"
    >
      <defs>
        <radialGradient id="logoBgGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="logoGradCyan" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
        <linearGradient id="logoGradPurple" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
        <linearGradient id="logoGradWhite" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
        <filter id="logoGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      
      {/* Ambient glow */}
      <circle cx="256" cy="256" r="220" fill="url(#logoBgGlow)" />
      
      {/* Outer rings */}
      <circle
        cx="256"
        cy="256"
        r="180"
        fill="none"
        stroke="url(#logoGradCyan)"
        strokeWidth="4"
        strokeOpacity="0.2"
        strokeDasharray="40 180 80 40"
        transform="rotate(-45 256 256)"
      />
      <circle
        cx="256"
        cy="256"
        r="180"
        fill="none"
        stroke="url(#logoGradPurple)"
        strokeWidth="4"
        strokeOpacity="0.2"
        strokeDasharray="100 60 40 120"
        transform="rotate(120 256 256)"
      />

      {/* Outgoing Request path (Cyan) */}
      <path
        d="M 180 220 C 180 150, 332 150, 332 220 C 332 260, 290 280, 256 300 C 210 327, 180 340, 180 400"
        fill="none"
        stroke="url(#logoGradCyan)"
        strokeWidth="32"
        strokeLinecap="round"
        filter="url(#logoGlow)"
      />
      
      {/* Incoming Response path (Purple) */}
      <path
        d="M 332 292 C 332 362, 180 362, 180 292 C 180 252, 222 232, 256 212 C 302 185, 332 172, 332 112"
        fill="none"
        stroke="url(#logoGradPurple)"
        strokeWidth="32"
        strokeLinecap="round"
        filter="url(#logoGlow)"
      />

      {/* Request arrowhead */}
      <path d="M 320 240 L 348 215 L 348 255 Z" fill="#ffffff" filter="url(#logoGlow)" />
      
      {/* Response arrowhead */}
      <path d="M 192 272 L 164 297 L 164 257 Z" fill="#ffffff" filter="url(#logoGlow)" />

      {/* Central data connection core */}
      <circle cx="256" cy="256" r="16" fill="url(#logoGradWhite)" filter="url(#logoGlow)" />
      <circle cx="256" cy="256" r="8" fill="#ffffff" />
    </svg>
  );
}
