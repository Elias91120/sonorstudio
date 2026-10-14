import type { ReactNode, SVGProps } from 'react';

function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconPlay = () => (
  <Icon>
    <path d="M5 3.2v9.6l7.6-4.8z" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconPause = () => (
  <Icon>
    <rect x="4" y="3.5" width="2.6" height="9" rx="0.6" fill="currentColor" stroke="none" />
    <rect x="9.4" y="3.5" width="2.6" height="9" rx="0.6" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconStop = () => (
  <Icon>
    <rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconPlus = () => (
  <Icon>
    <path d="M8 3.5v9M3.5 8h9" />
  </Icon>
);

export const IconClose = () => (
  <Icon>
    <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
  </Icon>
);

export const IconMaximize = () => (
  <Icon>
    <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" />
  </Icon>
);

export const IconPlaylist = () => (
  <Icon>
    <rect x="1.8" y="2.5" width="6" height="3" rx="0.8" />
    <rect x="5.5" y="6.5" width="8.7" height="3" rx="0.8" />
    <rect x="3" y="10.5" width="5" height="3" rx="0.8" />
  </Icon>
);

export const IconRack = () => (
  <Icon>
    <rect x="1.8" y="3" width="2.6" height="4" rx="0.6" />
    <rect x="5.3" y="3" width="2.6" height="4" rx="0.6" fill="currentColor" />
    <rect x="8.8" y="3" width="2.6" height="4" rx="0.6" />
    <rect x="12.3" y="3" width="2" height="4" rx="0.6" fill="currentColor" />
    <rect x="1.8" y="9" width="2.6" height="4" rx="0.6" fill="currentColor" />
    <rect x="5.3" y="9" width="2.6" height="4" rx="0.6" />
    <rect x="8.8" y="9" width="2.6" height="4" rx="0.6" fill="currentColor" />
    <rect x="12.3" y="9" width="2" height="4" rx="0.6" />
  </Icon>
);

export const IconPiano = () => (
  <Icon>
    <rect x="2" y="2.5" width="12" height="11" rx="1.2" />
    <path d="M6 9.5v4M10 9.5v4" />
    <path d="M5 2.5v7M7 2.5v7M9 2.5v7M11 2.5v7" strokeWidth="2.2" />
  </Icon>
);

export const IconBrowser = () => (
  <Icon>
    <path d="M2 4.5h3l1 1.2h8v7.3H2z" />
    <path d="M5 9h6" />
  </Icon>
);

export const IconMixer = () => (
  <Icon>
    <path d="M4 2.5v11M8 2.5v11M12 2.5v11" />
    <rect x="2.6" y="8.5" width="2.8" height="2" rx="0.5" fill="currentColor" />
    <rect x="6.6" y="4.5" width="2.8" height="2" rx="0.5" fill="currentColor" />
    <rect x="10.6" y="10" width="2.8" height="2" rx="0.5" fill="currentColor" />
  </Icon>
);

export const IconKeyboard = () => (
  <Icon>
    <rect x="1.5" y="4" width="13" height="8.5" rx="1.5" />
    <path d="M4 6.8h.01M6.7 6.8h.01M9.3 6.8h.01M12 6.8h.01M5 10h6" />
  </Icon>
);

/** A 5-pin DIN socket: pins on an arc over the center, key notch at the bottom. */
export const IconMidi = () => (
  <Icon>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M4.6 8.6h.01M5.6 5.6h.01M8 4.5h.01M10.4 5.6h.01M11.4 8.6h.01" strokeWidth="1.8" />
    <path d="M7 13.2h2" />
  </Icon>
);

export const IconPencil = () => (
  <Icon>
    <path d="M3 13l.8-3.2 6.9-6.9a1.6 1.6 0 0 1 2.3 2.3L6.1 12.1z" />
    <path d="M9.6 4l2.3 2.3" />
  </Icon>
);

export const IconBrush = () => (
  <Icon>
    <path d="M13.5 2.5c-2.6 1.4-5 3.6-6.4 5.5l1 1c1.9-1.4 4.1-3.8 5.4-6.5z" />
    <path d="M7 9c-1.6 0-2.6 1-2.8 2.4-.1 1-.7 1.6-1.7 1.8 2.3.9 5.6.3 5.6-2.6z" />
  </Icon>
);

export const IconEraser = () => (
  <Icon>
    <path d="M6 13.2h7.5" />
    <path d="M2.8 9.7l6.6-6.6a1.4 1.4 0 0 1 2 0l2 2a1.4 1.4 0 0 1 0 2L7.8 12.7a1.6 1.6 0 0 1-2.2 0z" />
    <path d="M6.2 6.3l3.9 3.9" />
  </Icon>
);

export const IconSelect = () => (
  <Icon>
    <rect x="2.5" y="2.5" width="11" height="11" rx="1" strokeDasharray="2.2 2" />
  </Icon>
);

export const IconZoomIn = () => (
  <Icon>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.4 10.4l3.3 3.3M5 7h4M7 5v4" />
  </Icon>
);

export const IconZoomOut = () => (
  <Icon>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.4 10.4l3.3 3.3M5 7h4" />
  </Icon>
);

export const IconChevron = ({ open }: { open: boolean }) => (
  <Icon style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform 120ms' }}>
    <path d="M6 4l4 4-4 4" />
  </Icon>
);

export const IconUp = () => (
  <Icon>
    <path d="M4.5 9.5L8 6l3.5 3.5" />
  </Icon>
);

export const IconDown = () => (
  <Icon>
    <path d="M4.5 6.5L8 10l3.5-3.5" />
  </Icon>
);

export const IconWave = () => (
  <Icon>
    <path d="M1.5 8h1.8l1.4-3.5 2 7.5 2-9.5 1.9 8.5 1.4-3h2.5" />
  </Icon>
);

export const IconKeys = () => (
  <Icon>
    <rect x="2" y="3" width="12" height="10" rx="1.2" />
    <path d="M5.5 3v5.5M8 3v5.5M10.5 3v5.5" strokeWidth="2" />
  </Icon>
);

export const IconFollow = () => (
  <Icon>
    <path d="M6 2.5v11" />
    <path d="M3.5 2.5h5L6 5z" fill="currentColor" />
    <path d="M9.5 8h4M11.8 6l2 2-2 2" />
  </Icon>
);

export const IconGhost = () => (
  <Icon>
    <rect x="2" y="3" width="8" height="3.5" rx="0.8" strokeDasharray="1.6 1.4" />
    <rect x="6" y="9.5" width="8" height="3.5" rx="0.8" fill="currentColor" />
  </Icon>
);

export const IconMore = () => (
  <Icon>
    <path d="M4 8h.01M8 8h.01M12 8h.01" strokeWidth="2.2" />
  </Icon>
);
