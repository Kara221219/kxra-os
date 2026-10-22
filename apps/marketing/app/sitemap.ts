import type { MetadataRoute } from "next";
import { productPages } from "../lib/reference-content";
import { appKeys } from "../lib/app-examples";
import { helpArticles } from "../lib/help-content";
import { partnerPages } from "../lib/partner-content";
import { solutionKeys } from "../lib/solution-content";
import { integrationKeys } from "../lib/integration-content";
import { articleKeys } from "../lib/editorial-content";
import { resourceGuides } from "../lib/resource-guides";
import { useCases } from "../lib/use-case-content";
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "",
    "/product",
    ...Object.keys(productPages).map((s) => "/product/" + s),
    "/bring-your-own-agent",
    "/apps",
    ...appKeys.map((s) => "/apps/" + s),
    "/solutions",
    ...solutionKeys.map((key) => "/solutions/" + key),
    "/use-cases",
    ...Object.keys(useCases).map((key) => "/use-cases/" + key),
    "/integrations",
    ...integrationKeys.map((key) => "/integrations/" + key),
    "/resources",
    ...Object.keys(resourceGuides).map((key) => "/resources/" + key),
    "/blog",
    ...articleKeys.map((key) => "/blog/" + key),
    "/alternatives",
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
