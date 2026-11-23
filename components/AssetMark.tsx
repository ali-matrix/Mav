// Mav's own mark: a hardware chip with a cut corner (the register page).
// White in both themes so it cuts through the blue rail, like every suite mark.
export default function AssetMark({ size = 30 }: { size?: number }) {
  return (
    <svg className="mx-mark" width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor"
      strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Mav">
      <path d="M16 14a4 4 0 0 1 4-4h20l8 8v26a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4Z" />
      <path d="M24 5v5M32 5v5M24 54v5M32 54v5M10 24h6M10 32h6M48 36h6M48 44h6" strokeWidth={3.5} />
      <g fill="currentColor" stroke="none"><rect x="24" y="24" width="16" height="16" rx="3" /></g>
    </svg>
  );
}