import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata = {
  title: "SR Book Reader — ডিজিটাল বুক লাইব্রেরি",
  description:
    "আধুনিক বাংলা ও ইংরেজি ই-বুক রিডার — স্মার্ট বুকমার্কসহ পড়ুন আপনার প্রিয় বই, যেখানে থেমেছিলেন সেখান থেকেই আবার শুরু করুন।",
};

export default function RootLayout({ children }) {
  return (
    <html lang="bn" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased selection:bg-amber-500/30 selection:text-amber-200`}
      >
        {children}
      </body>
    </html>
  );
}
