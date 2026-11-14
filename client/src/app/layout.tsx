
import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import Navbar from "@/components/Navbar";
import { SkipToContent } from "@/components/SkipToContent";
import { Toaster } from "react-hot-toast";

export const metadata: Metadata = {
  title: "RailConnect - Modern Railway App",
  description: "Book train tickets easily",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="afterInteractive"
        />
        <ThemeProvider>
          <AuthProvider>
            <Toaster position="top-center" />
            <SkipToContent />
            <Navbar />
            <main id="main-content" className="min-h-screen">{children}</main>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
