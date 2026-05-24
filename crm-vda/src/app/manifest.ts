import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mercado Nacional · VDA",
    short_name: "VDA",
    description: "Sistema de gestión comercial — Mercado Nacional · Viña de Aguirre",
    start_url: "/",
    display: "standalone",
    background_color: "#1A1612",
    theme_color: "#1A1612",
    orientation: "portrait",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
