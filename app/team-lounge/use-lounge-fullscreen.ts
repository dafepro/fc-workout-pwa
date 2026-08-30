"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useLoungeFullscreen<T extends HTMLElement>() {
  const containerRef = useRef<T>(null);
  const nativeActive = useRef(false);
  const [active, setActive] = useState(false);
  const bindContainer = useCallback((container: T | null) => {
    containerRef.current = container;
  }, []);

  const exit = useCallback(async () => {
    const container = containerRef.current;
    if (container && document.fullscreenElement === container) {
      try {
        await document.exitFullscreen();
      } catch {
        // The viewport fallback still exits even if the browser refuses.
      }
    }
    nativeActive.current = false;
    setActive(false);
  }, []);

  const enter = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    setActive(true);
    if (document.fullscreenElement === container) {
      nativeActive.current = true;
      return;
    }
    if (typeof container.requestFullscreen !== "function") return;
    try {
      await container.requestFullscreen({ navigationUI: "hide" });
      nativeActive.current = document.fullscreenElement === container;
    } catch {
      // Keep the CSS viewport fallback for browsers that reject this API.
    }
  }, []);

  useEffect(() => {
    function syncNativeState() {
      if (document.fullscreenElement === containerRef.current) {
        nativeActive.current = true;
        setActive(true);
      } else if (nativeActive.current) {
        nativeActive.current = false;
        setActive(false);
      }
    }
    document.addEventListener("fullscreenchange", syncNativeState);
    return () =>
      document.removeEventListener("fullscreenchange", syncNativeState);
  }, []);

  useEffect(() => {
    if (!active) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeFallbackOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !document.fullscreenElement) void exit();
    }
    window.addEventListener("keydown", closeFallbackOnEscape);
    return () => {
      window.removeEventListener("keydown", closeFallbackOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [active, exit]);

  useEffect(
    () => () => {
      if (document.fullscreenElement === containerRef.current) {
        void document.exitFullscreen().catch(() => undefined);
      }
    },
    [],
  );

  return { active, bindContainer, enter, exit };
}
