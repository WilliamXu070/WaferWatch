export function DieAppearanceTemplate({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-label="Die template preview"
      className={`h-full w-full ${className}`}
      fill="none"
      role="img"
      viewBox="0 0 180 140"
    >
      <path d="M31 16h96l22 22v86H31V16Z" fill="#f1f1ed" stroke="#96968e" strokeWidth="2" />
      <path d="M127 16v22h22" stroke="#96968e" strokeWidth="2" />
      <path d="M53 49h74M53 70h74M53 91h74M53 112h74M71 35v77M90 35v77M109 35v77" stroke="#c9c9c2" strokeWidth="1" />
      <rect x="66" y="61" width="48" height="30" rx="2" fill="#e1e1da" stroke="#777770" strokeWidth="1.5" />
      <path d="M74 76h32" stroke="#777770" strokeWidth="1.5" />
    </svg>
  );
}
