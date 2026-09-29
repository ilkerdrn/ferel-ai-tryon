export const metadata = {
  title: "Ferel AI Try-On API",
  description: "Server-side fal.ai Virtual Try-On proxy"
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body style={{ fontFamily: "Arial, sans-serif", padding: 32 }}>
        {children}
      </body>
    </html>
  );
}
