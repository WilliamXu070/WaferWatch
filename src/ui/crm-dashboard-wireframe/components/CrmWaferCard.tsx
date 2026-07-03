import type { WireframeWaferCard } from "../types";

type CrmWaferCardProps = {
  card: WireframeWaferCard;
  isSelected?: boolean;
  statusClassName: string;
  selectedCardToneClassName?: string;
};

export function CrmWaferCard({
  card,
  isSelected = false,
  statusClassName,
  selectedCardToneClassName,
}: CrmWaferCardProps): React.JSX.Element {
  return (
    <article
      aria-label={`${card.waferCode} ${card.dieLabel} card`}
      className={`grid gap-1 rounded-lg border p-2.5 ${
        isSelected
          ? `${selectedCardToneClassName ?? "border-[#181816] bg-[#1f1f1d] text-[#f0f0ec]"}`
          : "border-[#d3d3cd] bg-white text-ww-ink"
      }`}
    >
      <p className="m-0 flex items-baseline gap-1.5 text-xs font-bold leading-snug">
        <span>{card.waferCode}</span>
        <span className={`${isSelected ? "text-[#b8b8b3]" : "text-[#70706a]"} text-[11px] font-medium`}>
          {card.dieLabel}
        </span>
      </p>
      <p className="m-0 text-[11px] text-inherit">
        <span className="font-semibold">Owner:</span> {card.owner}
      </p>
      {card.meta.map((row) => (
        <p
          key={`${card.id}-${row.label}-${row.value}`}
          className="m-0 flex justify-between gap-2 text-[11px] leading-relaxed"
        >
          <span>{row.label}</span>
          <span className="font-semibold">{row.value}</span>
        </p>
      ))}
      <p className="m-0 text-[11px] text-inherit">
        <span className="font-semibold">Location:</span> {card.location}
      </p>
      <p className="m-0 text-[11px] text-inherit">
        <span className="font-semibold">Handler:</span> {card.handler}
      </p>
      <p className="m-0 text-[11px] text-inherit">
        <span className="font-semibold">Due:</span> {card.dueLabel}
      </p>
      <span
        role="status"
        aria-live="polite"
        className={`mt-1 justify-self-start rounded-full border px-2 py-[1px] text-[10px] font-semibold ${statusClassName}`}
      >
        {card.status}
      </span>
    </article>
  );
}
