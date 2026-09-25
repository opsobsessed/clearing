import "./globals.css";
export const metadata = { title: "Clearing", description: "Money in hand, what's due, and what's left to clear." };
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Work+Sans:wght@600;700&family=JetBrains+Mono:wght@500;600&family=Kalam:wght@400;700&display=swap" rel="stylesheet" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="theme-color" content="#4F6367" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
