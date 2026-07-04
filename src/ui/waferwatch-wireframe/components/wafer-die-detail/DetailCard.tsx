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
    <section className={["rounded-2xl border border-[#e8e8de] bg-white p-5 shadow-[0_14px_34px_-30px_rgba(30,29,22,0.34)]", className].join(" ")}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="text-[15px] font-semibold text-[#151512]">{title}</h3>
        {action ? (
          <button type="button" className="text-[12px] font-semibold text-[#6b7f57] hover:text-[#40522f]">
            {action}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}
