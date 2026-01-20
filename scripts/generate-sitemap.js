const fs = require("fs");

const cities = require("./cities-texas.json");

const BASE_URL = "https://junkscout.io";
const TODAY = new Date().toISOString().split("T")[0];

let urls = [];

// homepage
urls.push(`
  <url>
    <loc>${BASE_URL}/</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
`);

// texas index
urls.push(`
  <url>
    <loc>${BASE_URL}/texas/</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
`);

// city pages
cities.forEach(city => {
  urls.push(`
  <url>
    <loc>${BASE_URL}/texas/${city.slug}/</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
`);
});

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("")}
</urlset>`;

fs.writeFileSync("sitemap.xml", sitemap.trim());
console.log("✅ sitemap.xml generated");
