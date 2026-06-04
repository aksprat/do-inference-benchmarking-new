import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DO Inference Benchmark",
  description:
    "Latency, throughput and concurrency benchmarks for models on the DigitalOcean Serverless Inference engine.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-mono antialiased">{children}</body>
    </html>
  );
}
