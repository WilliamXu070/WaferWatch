import type { ComponentType, SVGProps } from "react";
import {
  Activity,
  ArrowRight,
  Building2,
  CalendarDays,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CirclePlay,
  Clock3,
  Droplet,
  EllipsisVertical,
  FileText,
  GitBranch,
  Grid2X2,
  LayoutGrid,
  Layers3,
  ListFilter,
  Plus,
  Radar,
  Repeat2,
  Scan,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  TowerControl,
  TriangleAlert,
  UserRound
} from "lucide-react";

type IconProps = SVGProps<SVGSVGElement>;
type LucideComponent = ComponentType<IconProps>;

const makeIcon = (Icon: LucideComponent, size = 16, strokeWidth = 1.8) => {
  function WireframeIcon(props: IconProps) {
    return <Icon width={size} height={size} strokeWidth={strokeWidth} aria-hidden {...props} />;
  }

  return WireframeIcon;
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

export const SearchIcon = makeIcon(Search, 16);
export const SortIcon = makeIcon(ListFilter, 16);
export const FilterIcon = makeIcon(SlidersHorizontal, 16);
export const UserIcon = makeIcon(UserRound, 16);
export const PlusIcon = makeIcon(Plus, 16);
export const GridIcon = makeIcon(LayoutGrid, 18);
export const CalendarIcon = makeIcon(CalendarDays, 18);
export const FlowIcon = makeIcon(GitBranch, 18);
export const WaferStatusIcon = makeIcon(Grid2X2, 18);
export const HelpIcon = makeIcon(CircleHelp, 18);
export const ChevronRightIcon = makeIcon(ChevronRight, 16);
export const ChevronLeftIcon = makeIcon(ChevronLeft, 16);
export const ArrowRightIcon = makeIcon(ArrowRight, 16);
export const ActivityIcon = makeIcon(Activity, 18);
export const WarningIcon = makeIcon(TriangleAlert, 18);
export const ClockIcon = makeIcon(Clock3, 14);
export const CalendarPinIcon = makeIcon(CalendarCheck, 14);
export const DotsIcon = makeIcon(EllipsisVertical, 16);
export const StartIcon = makeIcon(CirclePlay, 18);
export const StepFileIcon = makeIcon(FileText, 18);
export const DropletIcon = makeIcon(Droplet, 18);
export const EtchIcon = makeIcon(Sparkles, 18);
export const CharacterizationIcon = makeIcon(Activity, 18);
export const TotalStepsIcon = makeIcon(Scan, 16);
export const TargetIcon = makeIcon(Target, 16);
export const CheckIcon = makeIcon(Check, 12, 2.4);
export const CheckCircleIcon = makeIcon(CheckCircle2, 16);
export const HandoffIcon = makeIcon(Repeat2, 16);
export const StackIcon = makeIcon(Layers3, 16);
export const BuildingIcon = makeIcon(Building2, 18);
export const TowerIcon = makeIcon(TowerControl, 18);
export const ScanIcon = makeIcon(Radar, 18);
