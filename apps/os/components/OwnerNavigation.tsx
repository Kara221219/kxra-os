import Link from "next/link";
import { ownerNavigation } from "../../../packages/workspace/owner-navigation";
import OwnerMenuDisclosure from "./OwnerMenuDisclosure";

export default function OwnerNavigation({
  active,
  documentNavigation = false,
}: {
  active: string;
  documentNavigation?: boolean;
}) {
  function links(items: (typeof ownerNavigation)[number]["links"]) {
    return items.map(([name, path]) => {
      // Enter/leave this authority-sensitive surface with a new document, not
      // a reusable Next RSC history entry. All other owner routes stay unchanged.
      const nativeEntry = documentNavigation || path === "customer-directory";
      const NavigationLink = nativeEntry || path === "enquiries" ? "a" : Link;
      const href = path.startsWith("/")
        ? path
        : "/os" + (path ? "/" + path : "");
      return (
        <NavigationLink
          key={path}
          href={href}
          aria-current={active === path ? "page" : undefined}
        >
          {name}
        </NavigationLink>
      );
    });
  }
  return (
    <OwnerMenuDisclosure>
      {ownerNavigation.map((group) =>
        group.primary ? (
          <section key={group.title} aria-label={group.title}>
            <p className="owner-navigation-label">{group.title}</p>
            {links(group.links)}
          </section>
        ) : (
          <details
            key={group.title}
            open={group.links.some(([, path]) => path === active)}
          >
            <summary>{group.title}</summary>
            <div>{links(group.links)}</div>
          </details>
        ),
      )}
    </OwnerMenuDisclosure>
  );
}
