import { parseAvatarCatalog } from "../catalog";
import { AvatarAssembler } from "./AvatarAssembler";
import type {
  AvatarCatalogLoader,
  AvatarPresentationLoader,
  AvatarPresentationSource,
  LoadedAvatar,
} from "./types";

export class AvatarLibraryLoader implements AvatarPresentationLoader {
  constructor(
    private readonly catalogs: AvatarCatalogLoader,
    private readonly assembler: AvatarAssembler,
  ) {}

  async load(source: AvatarPresentationSource): Promise<LoadedAvatar> {
    const catalog = await this.catalogs.load(source.catalogURL);
    return this.assembler.assemble(catalog, source.loadout);
  }
}

export class HttpAvatarCatalogLoader implements AvatarCatalogLoader {
  private readonly cached = new Map<
    string,
    Promise<ReturnType<typeof parseAvatarCatalog>>
  >();

  load(url: string): Promise<ReturnType<typeof parseAvatarCatalog>> {
    let pending = this.cached.get(url);
    if (!pending) {
      pending = fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error("avatar catalog request failed");
          return response.json();
        })
        .then(parseAvatarCatalog);
      this.cached.set(url, pending);
      pending.catch(() => this.cached.delete(url));
    }
    return pending;
  }
}
