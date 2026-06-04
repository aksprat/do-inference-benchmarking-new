import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0b1324",
        panel: "#0f1b33",
        edge: "#1e2d4d",
        accent: "#0069ff",
        accent2: "#00c2ff",
        ok: "#22c55e",
        warn: "#f59e0b",
        bad: "#ef4444",
        muted: "#8aa0c2",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
