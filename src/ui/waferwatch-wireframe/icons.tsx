import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24"
};

export function WaferLogoIcon(props: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4" />
      <g fill="currentColor">
        {Array.from({ length: 5 }).map((_, row) =>
          Array.from({ length: 5 }).map((_, col) => {
            const cx = 5 + col * 3.5;
            const cy = 5 + row * 3.5;
            const dx = cx - 12;
            const dy = cy - 12;
            if (dx * dx + dy * dy > 60) return null;
            return <circle key={`${row}-${col}`} cx={cx} cy={cy} r="0.9" />;
          })
        )}
      </g>
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg width="16" height="16" {...base} aria-hidden {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  );
}

export function SortIcon(props: IconProps) {
  return (
    <svg width="16" height="16" {...base} aria-hidden {...props}>
      <path d="M4 7h16M6 12h12M9 17h6" />
    </svg>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <svg width="16" height="16" {...base} aria-hidden {...props}>
      <path d="M5 6h14M8 12h8M10 18h4" />
      <circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="14" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="11" cy="18" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <svg width="16" height="16" {...base} aria-hidden {...props}>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg width="16" height="16" {...base} aria-hidden {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function GridIcon(props: IconProps) {
  return (
    <svg width="18" height="18" {...base} aria-hidden {...props}>
      <rect x="4" y="4" width="6" height="6" rx="1.4" />
      <rect x="14" y="4" width="6" height="6" rx="1.4" />
      <rect x="4" y="14" width="6" height="6" rx="1.4" />
      <rect x="14" y="14" width="6" height="6" rx="1.4" />
    </svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg width="18" height="18" {...base} aria-hidden {...props}>
      <rect x="4" y="5" width="16" height="15" rx="2.4" />
      <path d="M4 9h16M8 3v4M16 3v4" />
    </svg>
  );
}

export function FlowIcon(props: IconProps) {
  return (
    <svg width="18" height="18" {...base} aria-hidden {...props}>
      <circle cx="7" cy="6" r="2.2" />
      <circle cx="17" cy="12" r="2.2" />
      <circle cx="7" cy="18" r="2.2" />
      <path d="M9 7.2c4 1 6 2 6.2 4M9 16.8c4-1 6-2 6.2-4" />
    </svg>
  );
}

export function WaferStatusIcon(props: IconProps) {
  return (
    <svg width="18" height="18" {...base} aria-hidden {...props}>
      <rect x="4" y="5" width="7" height="6" rx="1.2" />
      <rect x="13" y="5" width="7" height="6" rx="1.2" />
      <rect x="4" y="13" width="7" height="6" rx="1.2" />
      <rect x="13" y="13" width="7" height="6" rx="1.2" />
    </svg>
  );
}

export function HelpIcon(props: IconProps) {
  return (
    <svg width="18" height="18" {...base} aria-hidden {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8" />
      <circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg width="16" height="16" {...base} aria-hidden {...props}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg width="16" height="16" {...base} aria-hidden {...props}>
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg width="16" height="16" {...base} aria-hidden {...props}>
      <path d="M4 12h16M14 6l6 6-6 6" />
    </svg>
  );
}

export function ActivityIcon(props: IconProps) {
  return (
    <svg width="18" height="18" {...base} aria-hidden {...props}>
      <path d="M3 12h4l2.5-6 5 12L17 12h4" />
    </svg>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <svg width="18" height="18" {...base} aria-hidden {...props}>
      <path d="M12 4 2.8 20h18.4L12 4Z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg width="14" height="14" {...base} aria-hidden {...props}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function CalendarPinIcon(props: IconProps) {
  return (
    <svg width="14" height="14" {...base} aria-hidden {...props}>
      <rect x="4" y="5" width="16" height="15" rx="2.4" />
      <path d="M4 9h16M8 3v4M16 3v4" />
    </svg>
  );
}

export function DotsIcon(props: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

export function StartIcon(props: IconProps) {
  return (
    <svg width="18" height="18" {...base} aria-hidden {...props}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M10 8.5 16 12l-6 3.5v-7Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function StepFileIcon(props: IconProps) {
  return (
    <svg width="18" height="18" {...base} aria-hidden {...props}>
      <path d="M6 3h8l4 4v14H6V3Z" />
      <path d="M14 3v4h4M9 12h6M9 16h4" />
    </svg>
  );
}

export function DropletIcon(props: IconProps) {
  return (
    <svg width="18" height="18" {...base} aria-hidden {...props}>
      <path d="M12 3.5c3 3.6 5 6.3 5 9a5 5 0 0 1-10 0c0-2.7 2-5.4 5-9Z" />
    </svg>
  );
}

export function EtchIcon(props: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      {Array.from({ length: 4 }).map((_, r) =>
        Array.from({ length: 4 }).map((_, c) => (
          <circle key={`${r}-${c}`} cx={6 + c * 4} cy={6 + r * 4} r="1" />
        ))
      )}
    </svg>
  );
}

export function CharacterizationIcon(props: IconProps) {
  return (
    <svg width="18" height="18" {...base} aria-hidden {...props}>
      <path d="M3 15c3-6 5-6 7 0s4 6 7 0" />
    </svg>
  );
}

export function TotalStepsIcon(props: IconProps) {
  return (
    <svg width="16" height="16" {...base} aria-hidden {...props}>
      <path d="M12 3v11m0 0-3.5-3.5M12 14l3.5-3.5" />
      <path d="M4 20h16" />
    </svg>
  );
}

export function TargetIcon(props: IconProps) {
  return (
    <svg width="16" height="16" {...base} aria-hidden {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <svg width="16" height="16" {...base} aria-hidden {...props}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="m8.5 12 2.4 2.4 4.6-4.8" />
    </svg>
  );
}

export function HandoffIcon(props: IconProps) {
  return (
    <svg width="16" height="16" {...base} aria-hidden {...props}>
      <path d="M4 8h13l-2.5-2.5M20 16H7l2.5 2.5" />
    </svg>
  );
}

export function StackIcon(props: IconProps) {
  return (
    <svg width="16" height="16" {...base} aria-hidden {...props}>
      <path d="m12 4 8 4-8 4-8-4 8-4Z" />
      <path d="m4 12 8 4 8-4M4 16l8 4 8-4" />
    </svg>
  );
}

export function BuildingIcon(props: IconProps) {
  return (
    <svg width="18" height="18" {...base} aria-hidden {...props}>
      <path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" />
      <path d="M15 9h2a2 2 0 0 1 2 2v10M3 21h18M8 7h2M8 11h2M8 15h2" />
    </svg>
  );
}

export function TowerIcon(props: IconProps) {
  return (
    <svg width="18" height="18" {...base} aria-hidden {...props}>
      <path d="M9 21 12 3l3 18M7 21h10M10 12h4M9.2 16h5.6" />
    </svg>
  );
}
