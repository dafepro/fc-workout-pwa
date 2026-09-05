import type { Metadata } from "next";

import catalogSource from "../../../public/avatar/catalog/avatar-catalog.engineering.json";
import { parseAvatarCatalog } from "../catalog";
import { AvatarDemo } from "./AvatarDemo";

export const metadata: Metadata = {
  title: "3D Avatar Runtime Demo | Zoomigo",
  description:
    "A live engineering preview of Zoomigo's replacement 3D avatar runtime.",
};

const ENGINEERING_CATALOG = "/avatar/catalog/avatar-catalog.engineering.json";
const MISSING_CATALOG = "/avatar/catalog/missing.json";
const catalog = parseAvatarCatalog(catalogSource);

export default async function AvatarDemoPage({
  searchParams,
}: {
  searchParams: Promise<{ failure?: string }>;
}) {
  const { failure } = await searchParams;
  return (
    <AvatarDemo
      catalog={catalog}
      catalogURL={failure === "asset" ? MISSING_CATALOG : ENGINEERING_CATALOG}
    />
  );
}
