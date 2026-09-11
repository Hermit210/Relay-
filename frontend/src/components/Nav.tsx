import { NavLink } from "react-router-dom";
import { Terminal } from "lucide-react";

const LINKS = [
  { to: "/", label: "home" },
  { to: "/demo", label: "live demo" },
  { to: "/how-it-works", label: "how it works" },
  { to: "/safety", label: "safety" },
];

export function Nav() {
  return (
    <nav className="border-b border-line px-6 py-3 flex items-center gap-8 sticky top-0 bg-bg/95 backdrop-blur z-10">
      <div className="flex items-center gap-2 text-ink">
        <Terminal size={16} strokeWidth={1.5} />
        <span className="text-sm">relay</span>
      </div>
      <div className="flex gap-6 text-xs">
        {LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === "/"}
            className={({ isActive }) =>
              `pb-1 border-b transition-colors ${
                isActive ? "text-ink border-structural" : "text-muted border-transparent hover:text-ink"
              }`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
