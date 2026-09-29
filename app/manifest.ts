import type { MetadataRoute } from "next";

// The installable app's manifest (round 5, §6). start_url carries
// ?source=pwa so opens from the home screen are counted (pwa_open in
// lib/analytics.ts); the maskable icon is the same mark drawn smaller so
// Android's shapes never clip it.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "PortPass Bahamas",
    short_name: "PortPass",
    description: "Sports sessions, weddings, venues and events in The Bahamas — found and booked in one place.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#F5F6F8",
    theme_color: "#0D1B3D",
    lang: "en",
    categories: ["sports", "travel", "lifestyle"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512?purpose=maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
