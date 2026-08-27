import type { NextConfig } from "next";
import { pageExtensionsFor, resolveBuildProfile } from "./build/build-profile";

const nextConfig: NextConfig = {
  pageExtensions: pageExtensionsFor(
    resolveBuildProfile(process.env.ZOOMIGO_BUILD_PROFILE),
  ),
};

export default nextConfig;
