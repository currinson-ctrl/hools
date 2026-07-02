import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hools Blog — Cola de revisión",
  description: "Agregador de noticias de afición, desplazamientos y moda casual para hoolsbrand.com",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
