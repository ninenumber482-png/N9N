import { Link } from "react-router-dom";

export default function BackLink({ to = "/dashboard", children }) {
  return (
    <Link to={to} className="mb-1 inline-flex items-center gap-1 text-zinc-500 transition hover:text-white">
      <span>←</span><span className="text-xs font-semibold">{children}</span>
    </Link>
  );
}
