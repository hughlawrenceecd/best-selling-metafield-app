import { vitePlugin as remix } from "@remix-run/dev";
import { installGlobals } from "@remix-run/node";
import { defineConfig, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

installGlobals({ nativeFetch: true });

// Safe environment variable handling
const getHost = () => {
  // For build time, use fallback values
  if (typeof process === 'undefined' || !process.env) {
    return "localhost";
  }
  
  // Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
  if (
    process.env.HOST &&
    (!process.env.SHOPIFY_APP_URL ||
      process.env.SHOPIFY_APP_URL === process.env.HOST)
  ) {
    process.env.SHOPIFY_APP_URL = process.env.HOST;
    delete process.env.HOST;
  }

  return new URL(process.env.SHOPIFY_APP_URL || "http://localhost").hostname;
};

const host = getHost();

let hmrConfig;
if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 64999,
    clientPort: 64999,
  };
} else {
  // For production, disable HMR or use safe defaults
  hmrConfig = false; // Disable HMR in production
}

export default defineConfig({
  server: {
    allowedHosts: [host],
    cors: {
      preflightContinue: true,
    },
    port: Number(process.env.PORT || 3000),
    hmr: hmrConfig,
    fs: {
      allow: ["app", "node_modules"],
    },
  },
  plugins: [
    remix({
      ignoredRouteFiles: ["**/.*"],
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_lazyRouteDiscovery: true,
        v3_singleFetch: false,
        v3_routeConfig: true,
      },
    }),
    tsconfigPaths(),
  ],
  build: {
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    include: ["@shopify/app-bridge-react", "@shopify/polaris"],
  },
}) satisfies UserConfig;