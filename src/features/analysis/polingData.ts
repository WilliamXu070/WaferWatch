export type PolingChip = "Chip 1" | "Chip 2";

export type PolingPulseWidth = 10 | 100 | 200;

export type PolingRecord = {
  id: string;
  chip: PolingChip;
  slide: number;
  voltage: number;
  pulses: number;
  pulseWidthMs: PolingPulseWidth;
  postPulseVoltage: number;
  postPulseWidthMs: number;
  imagePath: string;
  flag?: string;
};

function conditions(
  chip: PolingChip,
  slide: number,
  voltage: number,
  pulseCounts: readonly number[],
  pulseWidthMs: PolingPulseWidth,
  firstImage: number,
  flag?: string
): PolingRecord[] {
  return pulseCounts.map((pulses, index) => ({
    id: `${chip === "Chip 1" ? "C1" : "C2"}-S${String(slide).padStart(2, "0")}-V${voltage}-P${pulses}-W${pulseWidthMs}`,
    chip,
    slide,
    voltage,
    pulses,
    pulseWidthMs,
    postPulseVoltage: 300,
    postPulseWidthMs: 250,
    imagePath: `/analysis/poling/image${firstImage + index}.JPG`,
    flag
  }));
}

export const POLING_RECORDS: readonly PolingRecord[] = [
  ...conditions("Chip 1", 2, 520, [1], 100, 1),
  ...conditions("Chip 1", 2, 510, [1], 100, 2),
  ...conditions("Chip 1", 2, 500, [1], 100, 3),
  ...conditions("Chip 1", 2, 490, [1], 100, 4),
  ...conditions("Chip 1", 2, 480, [1], 100, 5),
  ...conditions("Chip 1", 2, 470, [1], 100, 6),
  ...conditions("Chip 1", 2, 460, [1], 100, 7),
  ...conditions("Chip 1", 2, 450, [1], 100, 8),
  ...conditions("Chip 1", 4, 510, [1], 200, 9),
  ...conditions("Chip 1", 4, 500, [1], 200, 10),
  ...conditions("Chip 1", 4, 490, [1], 200, 11),
  ...conditions("Chip 1", 4, 480, [1], 200, 12),
  ...conditions("Chip 1", 4, 470, [1], 200, 13),
  ...conditions("Chip 1", 4, 460, [1], 200, 14),
  ...conditions("Chip 1", 4, 450, [1], 200, 15),
  ...conditions("Chip 1", 5, 510, [5, 10, 15, 20, 25, 30], 10, 16),
  ...conditions("Chip 1", 7, 500, [5, 10, 15, 20, 25, 30, 35, 40], 10, 22),
  ...conditions("Chip 1", 8, 490, [5, 10, 15, 20, 25, 30, 35], 10, 30),
  ...conditions("Chip 1", 10, 480, [5, 10, 15, 20, 25, 30, 35, 40], 10, 37),
  ...conditions("Chip 2", 12, 480, [50, 100, 200], 10, 45),
  ...conditions("Chip 2", 13, 470, [5, 20, 50, 100, 200], 10, 48),
  ...conditions("Chip 2", 14, 460, [5, 20, 50, 100], 10, 53),
  ...conditions("Chip 2", 15, 450, [5, 20, 50, 100, 200], 10, 57),
  ...conditions("Chip 2", 16, 440, [5, 20, 50, 100, 200], 10, 62),
  ...conditions("Chip 2", 17, 430, [5, 20, 50, 100, 200], 10, 67),
  ...conditions(
    "Chip 2",
    18,
    480,
    [50, 100, 200],
    10,
    45,
    "Uses the same embedded images as slide 12; verify duplicate versus replicate."
  )
];

export const POLING_CHIP_COLORS: Record<PolingChip, string> = {
  "Chip 1": "#087e8b",
  "Chip 2": "#d97706"
};
