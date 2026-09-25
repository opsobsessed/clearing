// Lets Clearing be installed to the phone's home screen ("Add to Home Screen") and open full-screen
// like an app, so logging a spend is one tap from the home screen instead of a browser tab.
export default function manifest() {
  return {
    name: "Clearing",
    short_name: "Clearing",
    description: "Money in hand, what's due, and what's left to clear.",
    start_url: "/",
    display: "standalone",
    background_color: "#F5F1EA",
    theme_color: "#1F4D46",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  };
}
