import type { MetadataRoute } from "next";

/** Lets people add Closeby to their home screen and open it full screen, like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Closeby — watch together",
    short_name: "Closeby",
    description: "Video call and watch YouTube, films or the web together, in sync.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#000000",
    theme_color: "#000000",
    categories: ["entertainment", "social"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
