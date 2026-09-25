// The bare kite mark, drawn directly on the chrome. OWNER OVERRIDE 2026-07-22:
// the rail and setup now use the red-tile favicon (harness composition,
// #C93B31 background — see public/favicon.svg); this bare mark stays for any
// in-flow uses where a tile would be too heavy.
export default function Kite({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-175 -175 350 350" aria-hidden="true">
      <g transform="rotate(45)">
        <path d="M 0,-140 Q 54,-82 98,-14 Q 46,64 0,160 Q -46,64 -98,-14 Q -54,-82 0,-140 Z" fill="var(--red)" />
        <path d="M 0,-112 Q 5,16 0,128" fill="none" stroke="#fff" strokeWidth="16" strokeLinecap="round" />
        <path d="M -70,-10 Q 0,-28 70,-10" fill="none" stroke="#fff" strokeWidth="16" strokeLinecap="round" />
      </g>
    </svg>
  );
}
