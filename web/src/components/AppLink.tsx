import type { LinkComponentProps } from "@cloudflare/kumo/utils";
import { forwardRef } from "react";
import { Link } from "react-router-dom";

const EXTERNAL_URL = /^[a-z][a-z\d+.-]*:/i;

/** Routes Kumo links (Sidebar.MenuButton, LinkButton, …) through react-router. */
export const AppLink = forwardRef<HTMLAnchorElement, LinkComponentProps>(function AppLink(
  { href, to, ...props },
  ref
) {
  const target = to ?? href;
  if (target === undefined || EXTERNAL_URL.test(target)) {
    return <a ref={ref} href={target} {...props} />;
  }
  return <Link ref={ref} to={target} {...props} />;
});
