/** Cloudflare Worker entry point for the vinext-starter template. */
import {
  handleImageOptimization,
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
} from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { pruneAnalytics } from "../lib/analytics/storage";
import {
  devServiceWorkerResponse,
  gateDevRequest,
  type DevGateEnv,
} from "./dev-gate";

interface Env extends DevGateEnv {
  ASSETS: Fetcher;
  ANALYTICS_DB?: D1Database;
  PRODUCT_ANALYTICS_ENABLED?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: {
          format: string;
          quality: number;
        }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const gateResponse = await gateDevRequest(request, env);
    if (gateResponse) return gateResponse;

    const serviceWorkerResponse = devServiceWorkerResponse(request, env);
    if (serviceWorkerResponse) return serviceWorkerResponse;

    const url = new URL(request.url);

    // Production adds no separate `/staff/*` edge rule. Its console gates on
    // staff sign-in, TOTP, and per-request authorization in the application.
    // The disposable dev deployment is different: gateDevRequest above covers
    // the complete host before any route reaches this point.
    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(
        request,
        {
          fetchAsset: (path) =>
            env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body)
              .transform(width > 0 ? { width } : {})
              .output({ format, quality });
            return result.response();
          },
        },
        allowedWidths,
      );
    }

    const response = await handler.fetch(request, env, ctx);
    if (env.DEV_ACCESS_ENABLED !== "true") return response;
    const headers = new Headers(response.headers);
    headers.set("cache-control", "private, no-store, max-age=0");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    if (env.PRODUCT_ANALYTICS_ENABLED === "true" && env.ANALYTICS_DB) {
      ctx.waitUntil(pruneAnalytics(env.ANALYTICS_DB));
    }
  },
};

export default worker;
