import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mav — Assets",
    short_name: "Mav",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#EEF4F9",
    theme_color: "#2FA8DF",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}