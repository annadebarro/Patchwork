export default function PatchLogo({ className }) {
  return (
    <svg className={className} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Patchwork logo">
      <rect x="4" y="4" width="24" height="24" fill="#e9c8aa" />
      <rect x="36" y="4" width="24" height="24" fill="#c7d3b3" />
      <rect x="4" y="36" width="24" height="24" fill="#a8c8e9" />
      <rect x="36" y="36" width="24" height="24" fill="#f4e1a1" />
      <rect x="24" y="24" width="16" height="16" fill="#d9b2d9" />
      <path d="M4 32h56M32 4v56" stroke="#4a4a4a" strokeWidth="2" />
      <path d="M24 24l16 16M40 24L24 40" stroke="#4a4a4a" strokeWidth="2" />
    </svg>
  );
}
