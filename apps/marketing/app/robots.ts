import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://kxra-group.com/sitemap.xml",
    host: "https://kxra-group.com",
  };
}
