import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

class NodeFileReader {
  result = null;
  onloadend = null;

  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    queueMicrotask(() => this.onloadend?.());
  }

  async readAsDataURL(blob) {
    const bytes = Buffer.from(await blob.arrayBuffer());
    this.result = `data:${blob.type};base64,${bytes.toString("base64")}`;
    queueMicrotask(() => this.onloadend?.());
  }
}

global.FileReader ??= NodeFileReader;

export async function exportGLB(scene, animations = []) {
  const data = await new GLTFExporter().parseAsync(scene, {
    animations,
    binary: true,
    onlyVisible: true,
    trs: true,
  });
  return new Uint8Array(data);
}
