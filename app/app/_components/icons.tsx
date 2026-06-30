/**
 * Shared line icons for the internal app, recreated from the Claude Design
 * prototype. All use `currentColor` so color is controlled by CSS.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2" y="2.5" width="14" height="10" rx="2.5" />
      <path d="M5.5 12.5 L5.5 15.5 L9 12.5" />
      <line x1="5.5" y1="6" x2="12.5" y2="6" />
      <line x1="5.5" y1="8.7" x2="10.5" y2="8.7" />
    </Svg>
  );
}

export function DataIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2" y="2" width="6" height="6" rx="1" />
      <rect x="10" y="2" width="6" height="6" rx="1" />
      <rect x="2" y="10" width="6" height="6" rx="1" />
      <rect x="10" y="10" width="6" height="6" rx="1" />
    </Svg>
  );
}

export function ReportIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 2 h6 l4 4 v10 H4 Z" />
      <line x1="6.5" y1="9" x2="11.5" y2="9" />
      <line x1="6.5" y1="11.7" x2="11.5" y2="11.7" />
      <line x1="6.5" y1="6.3" x2="9" y2="6.3" />
    </Svg>
  );
}

export function AdminIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <line x1="3" y1="5" x2="15" y2="5" />
      <rect x="10" y="3" width="3" height="4" rx="1" />
      <line x1="3" y1="13" x2="15" y2="13" />
      <rect x="5" y="11" width="3" height="4" rx="1" />
    </Svg>
  );
}

export function ChevronUp(props: IconProps) {
  return (
    <Svg strokeWidth={1.6} {...props}>
      <path d="M5 11 L9 7 L13 11" />
    </Svg>
  );
}

export function ChevronLeft(props: IconProps) {
  return (
    <Svg strokeWidth={1.8} {...props}>
      <path d="M11 3 L5 9 L11 15" />
    </Svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Svg strokeWidth={1.8} {...props}>
      <path d="M9 2 L15 5 V9 C15 13 12 15.5 9 16.5 C6 15.5 3 13 3 9 V5 Z" />
    </Svg>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <Svg strokeWidth={1.6} {...props}>
      <path d="M7 3 H4 a1 1 0 0 0 -1 1 v10 a1 1 0 0 0 1 1 h3" />
      <path d="M11 12 L15 9 L11 6" />
      <line x1="15" y1="9" x2="7" y2="9" />
    </Svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Svg strokeWidth={1.6} {...props}>
      <circle cx="8" cy="8" r="5" />
      <line x1="11.7" y1="11.7" x2="15.5" y2="15.5" />
    </Svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Svg strokeWidth={1.6} {...props}>
      <path d="M2 9 L16 3 L11 16 L9 10 Z" />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg strokeWidth={1.6} {...props}>
      <path d="M9 2 v14 M2 9 h14" />
    </Svg>
  );
}

export function BotIcon(props: IconProps) {
  return (
    <Svg strokeWidth={1.4} {...props}>
      <rect x="5" y="5" width="8" height="8" rx="1.5" />
      <line x1="9" y1="2" x2="9" y2="5" />
      <line x1="9" y1="13" x2="9" y2="16" />
      <line x1="2" y1="9" x2="5" y2="9" />
      <line x1="13" y1="9" x2="16" y2="9" />
      <line x1="3.2" y1="3.2" x2="5.3" y2="5.3" />
      <line x1="12.7" y1="12.7" x2="14.8" y2="14.8" />
      <line x1="14.8" y1="3.2" x2="12.7" y2="5.3" />
      <line x1="5.3" y1="12.7" x2="3.2" y2="14.8" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg strokeWidth={2} {...props}>
      <path d="M3 9.5 L7 13.5 L15 4.5" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg strokeWidth={1.8} {...props}>
      <line x1="4" y1="4" x2="14" y2="14" />
      <line x1="14" y1="4" x2="4" y2="14" />
    </Svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Svg strokeWidth={1.6} {...props}>
      <line x1="3" y1="5" x2="15" y2="5" />
      <line x1="3" y1="9" x2="15" y2="9" />
      <line x1="3" y1="13" x2="15" y2="13" />
    </Svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Svg strokeWidth={1.6} {...props}>
      <path d="M9 2 v9 M5.5 7.5 L9 11 L12.5 7.5" />
      <path d="M3 13 v2 h12 v-2" />
    </Svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Svg strokeWidth={1.6} {...props}>
      <rect x="6" y="5" width="9" height="10" rx="1.5" />
      <path d="M3 12.5 V4.5 A1.5 1.5 0 0 1 4.5 3 H12" />
    </Svg>
  );
}

export function CommentIcon(props: IconProps) {
  return (
    <Svg strokeWidth={1.6} {...props}>
      <path d="M3 4 h12 v8 H7 L4 15 V12 H3 Z" />
    </Svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <Svg strokeWidth={1.6} {...props}>
      <path d="M15 9 a6 6 0 1 1 -1.8 -4.3" />
      <path d="M15 2 v3 h-3" />
    </Svg>
  );
}
