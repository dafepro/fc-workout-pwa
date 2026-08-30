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

export function relayAvatarPointerDown(
  canvas: HTMLCanvasElement,
  pointer: PointerEvent,
) {
  pointer.preventDefault();
  canvas.dispatchEvent(
    new PointerEvent("pointerdown", {
      pointerId: pointer.pointerId,
      pointerType: pointer.pointerType,
      isPrimary: pointer.isPrimary,
      button: pointer.button,
      buttons: pointer.buttons,
      clientX: pointer.clientX,
      clientY: pointer.clientY,
      width: pointer.width,
      height: pointer.height,
      pressure: pointer.pressure,
      tiltX: pointer.tiltX,
      tiltY: pointer.tiltY,
      twist: pointer.twist,
      bubbles: true,
      cancelable: true,
    }),
  );
}
