// Inline SVG icon set (ui-ux-pro-max checklist: no emojis as icons).
// Stroke style, 24x24 viewBox, currentColor.

const PATHS: Record<string, React.ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z" />,
  trophy: (
    <>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0Z" />
      <path d="M7 6H4a1 1 0 0 0-1 1c0 2.5 2 4 4 4M17 6h3a1 1 0 0 1 1 1c0 2.5-2 4-4 4" />
    </>
  ),
  medal: (
    <>
      <circle cx="12" cy="14" r="5" />
      <path d="M8.5 9.5 6 3h4l2 4 2-4h4l-2.5 6.5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M16.5 15.2c2.3.3 4 1.8 4.7 4.3" />
    </>
  ),
  bell: (
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" />
      <path d="M10 19a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c1-4 4-6 7.5-6s6.5 2 7.5 6" />
    </>
  ),
  swords: (
    <>
      <path d="m4 4 9.5 9.5M4 4v3M4 4h3M20 4l-9.5 9.5M20 4v3M20 4h-3" />
      <path d="m7.5 13.5-3 7 7-3M16.5 13.5l3 7-7-3" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4M4 20h16" />
      <path d="M8.5 16v-5M13 16V8M17.5 16v-3" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 5.8v5.4c0 4.3 2.9 7.4 7 9 4.1-1.6 7-4.7 7-9V5.8Z" />
      <path d="m9 11.5 2.2 2.2L15.5 9" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m4.5 12.5 5 5 10-11" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  back: <path d="M14.5 5 8 12l6.5 7" />,
  mega: (
    <>
      <path d="M4 10v5h3l8 5V5L7 10Z" />
      <path d="M17.5 8.5a4 4 0 0 1 0 7M7 15v4.5" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3.5L9.5 5.5h5L16.5 8H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13.5" r="3.2" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5 2.5 20h19Z" />
      <path d="M12 9.5V14M12 16.8v.4" />
    </>
  ),
  pencil: <path d="m14.5 5.5 4 4L8 20l-5 1 1-5Z" />,
};

export type IconName = keyof typeof PATHS;

export default function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {PATHS[name]}
    </svg>
  );
}
