import Link from "next/link";
import { ownerNavigation } from "../../../packages/workspace/owner-navigation";
import OwnerMenuDisclosure from "./OwnerMenuDisclosure";

export default function OwnerNavigation({ active }: { active: string }) {
  function links(items: (typeof ownerNavigation)[number]["links"]) {
    return items.map(([name, path]) => (
      <Link
        key={path}
        href={"/os" + (path ? "/" + path : "")}
        aria-current={active === path ? "page" : undefined}
      >
        {name}
      </Link>
    ));
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
