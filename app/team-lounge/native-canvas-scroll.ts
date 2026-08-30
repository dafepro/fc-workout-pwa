const nativeVerticalPan = "pan-y";

export function preserveNativeCanvasScroll(mount: HTMLElement) {
  const restore = () => {
    mount.querySelectorAll("canvas").forEach((canvas) => {
      if (canvas.style.touchAction !== nativeVerticalPan) {
        canvas.style.touchAction = nativeVerticalPan;
      }
    });
  };

  restore();
  const observer = new MutationObserver(restore);
  observer.observe(mount, {
    attributes: true,
    attributeFilter: ["style"],
    childList: true,
    subtree: true,
  });

  return () => observer.disconnect();
}
