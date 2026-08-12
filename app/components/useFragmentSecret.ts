"use client";

import { useEffect, useState } from "react";

/**
 * Reads a one-time secret out of the URL fragment and takes it out of the URL.
 *
 * The fragment is the one part of a URL a browser keeps to itself: a secret
 * carried there reaches no server, appears in no request log, and is in no
 * `Referer`. It is stripped from history before anything else runs, so a back
 * button or a shared screen cannot surface it either.
 *
 * Both handoffs into the product work this way -- the player QR credential and
 * the staff setup token -- and they share this hook so the stripping cannot be
 * fixed in one and missed in the other. Neither reads the query as a fallback:
 * honouring that shape would keep minting the exposure the fragment removes.
 *
 * `settled` is false until the secret has been read, which happens a tick after
 * mount rather than during the first render. Callers must render no form before
 * it turns true.
 */
export function useFragmentSecret(key: string): {
  secret: string;
  settled: boolean;
} {
  const [state, setState] = useState({ secret: "", settled: false });

  useEffect(() => {
    const fragment = new URLSearchParams(location.hash.slice(1));
    const secret = fragment.get(key) ?? "";
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    const settle = window.setTimeout(
      () => setState({ secret, settled: true }),
      0,
    );
    return () => window.clearTimeout(settle);
  }, [key]);

  return state;
}
