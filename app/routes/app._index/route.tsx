import { useEffect, useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  Text,
  Autocomplete,
  Icon,
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "app/shopify.server";

// ----------------------
// Types
// ----------------------
interface Collection {
  id: string;
  title: string;
}

interface CollectionEdge {
  cursor: string;
  node: Collection;
}

interface CollectionsResponse {
  data: {
    collections: {
      edges: CollectionEdge[];
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
    };
  };
}

interface Product {
  id: string;
  title: string;
}

interface BestSellersResponse {
  data: {
    collection: {
      products: {
        edges: Array<{ node: Product }>;
      };
    };
  };
}

// ----------------------
// Loader: fetch ALL collections with pagination
// ----------------------
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  let hasNextPage = true;
  let endCursor: string | null = null;
  let collections: Collection[] = [];

  while (hasNextPage) {
    const response = await admin.graphql(
      `#graphql
        query Collections($after: String) {
          collections(first: 50, after: $after) {
            edges {
              cursor
              node {
                id
                title
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      { variables: { after: endCursor } }
    );

    const data: CollectionsResponse = await response.json();
    const page = data.data.collections;

    collections = [...collections, ...page.edges.map((e: CollectionEdge) => e.node)];
    hasNextPage = page.pageInfo.hasNextPage;
    endCursor = page.pageInfo.endCursor;
  }

  return json({ collections });
};

// ----------------------
// Helper: update best sellers for a single collection
// ----------------------
async function updateCollectionBestSellers(admin: any, collectionId: string): Promise<Product[]> {
  const bestSellingResponse = await admin.graphql(
    `#graphql
      query BestSellers($id: ID!) {
        collection(id: $id) {
          products(first: 10, sortKey: BEST_SELLING) {
            edges {
              node {
                id
                title
              }
            }
          }
        }
      }
    `,
    { variables: { id: collectionId } }
  );

  const bestSellingJson: BestSellersResponse = await bestSellingResponse.json();
  const products = bestSellingJson.data.collection.products.edges.map((e) => ({
    id: e.node.id,
    title: e.node.title,
  })) || [];

  // Save to metafield
  await admin.graphql(
    `#graphql
      mutation SetMetafield($ownerId: ID!, $value: String!) {
        metafieldsSet(metafields: [
          {
            namespace: "custom"
            key: "best_selling"
            type: "list.product_reference"
            ownerId: $ownerId
            value: $value
          }
        ]) {
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        ownerId: collectionId,
        value: JSON.stringify(products.map((p) => p.id)),
      },
    }
  );

  return products;
}

// ----------------------
// Action: update one OR all collections
// ----------------------
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const collectionId = formData.get("collectionId") as string;

  let updated: Record<string, Product[]> = {};

  if (collectionId === "ALL") {
    // Get all collections again
    let hasNextPage = true;
    let endCursor: string | null = null;
    let collections: Collection[] = [];
    while (hasNextPage) {
      const response = await admin.graphql(
        `#graphql
          query Collections($after: String) {
            collections(first: 50, after: $after) {
              edges {
                cursor
                node {
                  id
                  title
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        `,
        { variables: { after: endCursor } }
      );
      const data: CollectionsResponse = await response.json();
      const page = data.data.collections;
      collections = [...collections, ...page.edges.map((e: CollectionEdge) => e.node)];
      hasNextPage = page.pageInfo.hasNextPage;
      endCursor = page.pageInfo.endCursor;
    }

    // Update each collection
    for (const c of collections) {
      const products = await updateCollectionBestSellers(admin, c.id);
      updated[c.title] = products;
    }
  } else {
    const products = await updateCollectionBestSellers(admin, collectionId);
    updated["single"] = products;
  }

  return json({ success: true, updated });
};

// ----------------------
// Component
// ----------------------
export default function Index() {
  const { collections } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [selectedCollection, setSelectedCollection] = useState<string>("");
  const [inputValue, setInputValue] = useState("");
  const [options, setOptions] = useState(
    collections.map((c: Collection) => ({ value: c.id, label: c.title }))
  );

  // Filter options as user types
  useEffect(() => {
    if (inputValue === "") {
      setOptions(collections.map((c: Collection) => ({ value: c.id, label: c.title })));
      return;
    }
    const filtered = collections.filter((c: Collection) =>
      c.title.toLowerCase().includes(inputValue.toLowerCase())
    );
    setOptions(filtered.map((c: Collection) => ({ value: c.id, label: c.title })));
  }, [inputValue, collections]);

  // Toast after success
  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Metafield(s) updated with top 10 best sellers");
    }
  }, [fetcher.data, shopify]);

  return (
    <Page>
      <TitleBar title="Best Selling Updater" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Search for a collection
              </Text>
              <Autocomplete
                options={options}
                selected={selectedCollection ? [selectedCollection] : []}
                onSelect={(selected: string[]) => {
                  setSelectedCollection(selected[0]);
                  const match = collections.find(
                    (c: Collection) => c.id === selected[0]
                  );
                  if (match) setInputValue(match.title);
                }}
                textField={
                  <Autocomplete.TextField
                    prefix={<Icon source={SearchIcon} />}
                    value={inputValue}
                    onChange={setInputValue}
                    label="Collection"
                    placeholder="Search collections"
                  />
                }
              />
              {/* Show selected collection feedback */}
              {selectedCollection && (
                <Text as="p" variant="bodyMd" tone="subdued">
                  Selected collection:{" "}
                  <strong>
                    {
                      collections.find((c: Collection) => c.id === selectedCollection)
                        ?.title
                    }
                  </strong>
                </Text>
              )}

              {/* Update single collection */}
              <fetcher.Form method="post">
                <input
                  type="hidden"
                  name="collectionId"
                  value={selectedCollection}
                />
                <Button
                  submit
                  disabled={!selectedCollection}
                  loading={fetcher.state !== "idle"}
                >
                  Update Best Sellers
                </Button>
              </fetcher.Form>

              {/* Update all collections */}
              <fetcher.Form
                method="post"
                onSubmit={(e) => {
                  if (!window.confirm("Are you sure you want to update ALL collections? This cannot be reversed")) {
                    e.preventDefault();
                  }
                }}
              >
                <div style={{display: "flex", justifyContent: "end"}}>
                   <input type="hidden" name="collectionId" value="ALL" />
                
                <Button
                  submit
                  tone="critical"
                  loading={fetcher.state !== "idle"}
                >
                  Update ALL Collections
                </Button>
                </div>
              </fetcher.Form>

              {/* Show updated products */}
              {fetcher.data?.updated && (
                <div>
                  <Text as="h3" variant="headingMd">
                    Updated products:
                  </Text>
                  {Object.entries(fetcher.data.updated).map(([col, products]) => (
                    <div key={col}>
                      {col !== "single" && (
                        <Text as="h4" variant="headingSm">
                          {col}
                        </Text>
                      )}
                      <ul>
                        {(products as Product[]).map((p) => (
                          <li key={p.id}>{p.title}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}