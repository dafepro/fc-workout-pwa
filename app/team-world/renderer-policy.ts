/** The campus cannot sustain shared play on known software WebGL renderers. */
export function worldGraphicsAvailable() {
  const gl = document.createElement("canvas").getContext("webgl2", {
    powerPreference: "low-power",
  });
  if (!gl) return false;
  try {
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(
      gl.getParameter(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
    );
    return !/SwiftShader|llvmpipe|softpipe|software rasterizer/i.test(renderer);
  } finally {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
