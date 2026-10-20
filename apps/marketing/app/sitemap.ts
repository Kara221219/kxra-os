import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "",
    "/business-sprints",
    "/custom-projects",
    "/platform",
    "/about",
    "/contact",
  ].map((route) => ({
    url: `https://kxra-group.com${route}`,
    changeFrequency: "monthly",
    priority: route === "" ? 1 : route === "/business-sprints" ? 0.9 : 0.6,
  }));
}
