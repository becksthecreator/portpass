import type { MetadataRoute } from "next";

// The installable app's manifest (round 5, §6). start_url carries
// ?source=pwa so opens from the home screen are counted (pwa_open in
// lib/analytics.ts). The icons are the Prow app icons from
// PortPass-Logo-Files.zip (Harbour Signal); the maskable one keeps the
// mark inside Android's safe zone so no shape clips it.
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
    // Long-press the home-screen icon: straight to the Member Pass (brief 10).
    shortcuts: [{ name: "Member Pass", short_name: "Pass", url: "/pass?source=pwa", description: "Show your PortPass Member Pass at the counter" }],
    icons: [
      { src: "/brand/icons/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icons/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icons/app-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
