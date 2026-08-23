export function withRuntimeCapabilities<T extends object>(
  session: T,
  developerControlsEnabled: boolean,
): T & { developerControlsEnabled: boolean } {
  return { ...session, developerControlsEnabled };
}
