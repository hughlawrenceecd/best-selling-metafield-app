// app/shopify.server.ts
import "@shopify/shopify-app/remix/adapters/node";
import {
  AppDistribution,
  DeliveryMethod,
  shopifyApp,
  LATEST_API_VERSION,
} from "@shopify/shopify-app-remix/server";
import { MemorySessionStorage } from "@shopify/shopify-app-session-storage-memory";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  apiVersion: LATEST_API_VERSION,
  scopes: process.env.SCOPES?.split(",") || ["read_products", "write_products", "read_collections", "write_collections"],
  appUrl: process.env.SHOPIFY_APP_URL!,
  authPath: "/auth",
  sessionStorage: new MemorySessionStorage(),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
});

export default shopify;
export const apiVersion = LATEST_API_VERSION;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;