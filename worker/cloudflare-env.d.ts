// Keep Worker bindings available without adding Worker globals to Node/browser code.
declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}
