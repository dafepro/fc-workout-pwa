import type { Metadata } from "next";

import { AvatarDemo } from "./AvatarDemo";

export const metadata: Metadata = {
  title: "3D Avatar Runtime Demo | Zoomigo",
  description:
    "A live engineering preview of Zoomigo's replacement 3D avatar runtime.",
};

const REFERENCE_ASSET = "/avatar/reference/zoomigo-reference.glb";
const MISSING_ASSET = "/avatar/reference/missing.glb";

export default async function AvatarDemoPage({
  searchParams,
}: {
  searchParams: Promise<{ failure?: string }>;
}) {
  const { failure } = await searchParams;
  return (
    <AvatarDemo
      assetURL={failure === "asset" ? MISSING_ASSET : REFERENCE_ASSET}
    />
  );
}
