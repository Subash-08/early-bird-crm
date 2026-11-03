import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EarlyBird Travel CRM",
    short_name: "EarlyBird",
    description: "Enquiries, quotations, bookings and trip operations for travel teams.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f8f7",
    theme_color: "#12637d",
    orientation: "any",
    categories: ["business", "travel", "productivity"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
