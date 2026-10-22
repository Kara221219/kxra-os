import type { MetadataRoute } from "next";
import { productPages } from "../lib/reference-content";
import { appKeys } from "../lib/app-examples";
import { helpArticles } from "../lib/help-content";
import { partnerPages } from "../lib/partner-content";
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "",
    "/product",
    ...Object.keys(productPages).map((s) => "/product/" + s),
    "/bring-your-own-agent",
    "/apps",
    ...appKeys.map((s) => "/apps/" + s),
    "/solutions",
    "/use-cases",
    "/integrations",
    "/help",
    ...helpArticles.map((a) => "/help/" + a.slug),
    "/partner",
    "/partner/apply",
    ...Object.keys(partnerPages).map((s) => "/partner/" + s),
    "/pricing",
    "/business-sprints",
    "/custom-projects",
    "/platform",
    "/about",
    "/approach",
    "/contact",
  ].map((route) => ({
    url: "https://kxra-group.com" + route,
    changeFrequency: "monthly",
    priority: route === "" ? 1 : route.split("/").length === 2 ? 0.8 : 0.6,
  }));
}
