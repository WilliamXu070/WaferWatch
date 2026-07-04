import { DetailCard } from "./DetailCard";

export function ParametersTableCard() {
  const columns = ["Pulse 1", "Pulse 2", "Pulse 3", "Pulse 4", "Pulse 5", "Pulse 6", "Pulse 7", "Pulse 8", "Pulse 9", "Pulse 10", "Unit"];
  const rows = [
    ["Poling voltage", "510", "500", "490", "480", "470", "460", "450", "440", "450", "460", "V"],
    ["Poling temperature", "100", "100", "100", "100", "100", "100", "100", "100", "100", "100", "C"],
    ["Poling time", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "min"],
    ["# of pulses", "1", "1", "1", "10", "10", "10", "10", "10", "10", "10", ""],
    ["Post-pulse voltage", "300", "300", "300", "300", "300", "300", "300", "300", "300", "300", "V"],
    ["Post-pulse width", "250", "250", "250", "250", "250", "250", "250", "250", "250", "250", "us"]
  ];

  return (
    <DetailCard title="Fabrication parameters" className="lg:col-span-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-[#e7e7dc] text-[#8a887b]">
              <th className="py-2 pr-4 font-semibold">Parameter</th>
              {columns.map((column) => (
                <th key={column} className={["px-3 py-2 font-semibold", column === "Pulse 8" ? "bg-[#edf6e8] text-[#151512]" : ""].join(" ")}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]} className="border-b border-[#efefe6] last:border-0">
                {row.map((cell, index) => (
                  <td
                    key={`${row[0]}-${index}`}
                    className={[
                      "py-2 pr-4 font-medium text-[#4a483f]",
                      index === 9 ? "bg-[#edf6e8] font-semibold text-[#4f7a43]" : "",
                      index > 0 ? "px-3" : ""
                    ].join(" ")}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DetailCard>
  );
}
