import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PortPass Bahamas",
    short_name: "PortPass",
    description: "Sports sessions, weddings, venues and events in The Bahamas — found and booked in one place.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfaf6",
    theme_color: "#14303d",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
