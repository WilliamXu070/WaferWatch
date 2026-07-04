import type { ReactNode } from "react";

export function DetailCard({
  title,
  action,
  children,
  className = ""
}: {
  title: string;
  action?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={["border-b border-[#eeeeea] bg-white py-5", className].join(" ")}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="text-[15px] font-semibold text-[#111111]">{title}</h3>
        {action ? (
          <button type="button" className="text-[12px] font-semibold text-[#55554f] hover:text-[#111111]">
            {action}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}
