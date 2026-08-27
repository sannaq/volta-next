import "./globals.css";
import { brand, brandCssVars } from "@/lib/brand.config";

export const metadata = {
  title: `${brand.name} — 암호화폐 거래소`,
  description: brand.tagline,
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={brandCssVars()}>{children}</body>
    </html>
  );
}
