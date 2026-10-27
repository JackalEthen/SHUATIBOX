import type { SVGProps } from 'react';

export type IconName =
  | 'home'
  | 'library'
  | 'wrong'
  | 'search'
  | 'stats'
  | 'settings'
  | 'moon'
  | 'calendar'
  | 'clock'
  | 'book'
  | 'arrowRight'
  | 'chevronRight'
  | 'chevronDown'
  | 'check'
  | 'user'
  | 'chevronLeft'
  | 'star'
  | 'note'
  | 'alert'
  | 'expand'
  | 'x';

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
}

export function Icon({ name, ...props }: IconProps) {
  const base = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    ...props,
  };
  switch (name) {
    case 'home':
      return (
        <svg {...base}>
          <path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <path d="M9 21v-7h6v7" />
        </svg>
      );
    case 'library':
      return (
        <svg {...base}>
          <path d="m12 3 9 4.5-9 4.5-9-4.5z" />
          <path d="m3 12 9 4.5 9-4.5" />
          <path d="m3 16.5 9 4.5 9-4.5" />
        </svg>
      );
    case 'wrong':
      return (
        <svg {...base}>
          <path d="M12 3 3 7v6c0 5 4 7 9 8 5-1 9-3 9-8V7z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case 'search':
      return (
        <svg {...base}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case 'stats':
      return (
        <svg {...base}>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...base}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.14.37.36.7.64.96.3.27.68.42 1.07.44H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51.6z" />
        </svg>
      );
    case 'moon':
      return (
        <svg {...base}>
          <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.6 6.6 0 0 0 21 12.8z" />
        </svg>
      );
    case 'calendar':
      return (
        <svg {...base}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 11h18" />
        </svg>
      );
    case 'clock':
      return (
        <svg {...base}>
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 2M9 2h6" />
        </svg>
      );
    case 'book':
      return (
        <svg {...base}>
          <path d="M4 4h16v16H4z" />
          <path d="M8 9h8M8 13h5" />
        </svg>
      );
    case 'arrowRight':
      return (
        <svg {...base}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      );
    case 'chevronRight':
      return (
        <svg {...base}>
          <path d="m9 18 6-6-6-6" />
        </svg>
      );
    case 'user':
      return (
        <svg {...base}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
        </svg>
      );
    case 'chevronLeft':
      return (
        <svg {...base}>
          <path d="m15 6-6 6 6 6" />
        </svg>
      );
    case 'star':
      return (
        <svg {...base}>
          <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" />
        </svg>
      );
    case 'note':
      return (
        <svg {...base}>
          <path d="M4 4h16v16H4z" />
          <path d="M8 9h8M8 13h6" />
        </svg>
      );
    case 'alert':
      return (
        <svg {...base}>
          <path d="M12 9v4m0 4h.01" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
    case 'expand':
      return (
        <svg {...base}>
          <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
      );
    case 'x':
      return (
        <svg {...base}>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      );
    case 'chevronDown':
      return (
        <svg {...base}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      );
    case 'check':
      return (
        <svg {...base}>
          <path d="m5 12 5 5L20 7" />
        </svg>
      );
  }
}


