import { Link } from "react-router-dom";

export function BrandLink() {
  return (
    <Link to="/" className="flex items-center gap-2 text-kumo-default hover:opacity-90">
      <img src="/favicon.svg" alt="" aria-hidden="true" className="size-5" />
      <span className="text-sm font-semibold tracking-tight">botnote</span>
    </Link>
  );
}
