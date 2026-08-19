import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

const SITE = "https://fontfinderai.salarypitcher.com";

export default defineConfig({
  site: SITE,
  trailingSlash: "ignore",
  output: "static",
  compressHTML: true,
  build: {
    inlineStylesheets: "auto",
  },
  integrations: [
    sitemap({
      changefreq: "weekly",
      priority: 0.7,
      lastmod: new Date(),
      filter: (page) => page !== `${SITE}/404`,
    }),
  ],
});
