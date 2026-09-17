import * as THREE from "three";
const AVATAR_LAYER = 7;
const TERRAIN_LAYER = 8;

/** Register originals: mask rendering uses the current skinning and world transforms. */
export function createCharacterOcclusion() {
  const meshes = new Set<THREE.Mesh>();
  return {
    update(root: THREE.Object3D) {
      for (const mesh of meshes) mesh.layers.disable(AVATAR_LAYER);
      meshes.clear();
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || object.userData.comicOutline)
          return;
        for (let p: THREE.Object3D | null = object; p; p = p.parent)
          if (p.userData.comicSkip) return;
        object.layers.enable(AVATAR_LAYER);
        meshes.add(object);
      });
    },
    dispose() {
      for (const mesh of meshes) mesh.layers.disable(AVATAR_LAYER);
      meshes.clear();
    },
  };
}
export function markSilhouetteOccluder(root: THREE.Object3D) {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) object.layers.enable(TERRAIN_LAYER);
  });
}

/** Flatten nearest avatar surfaces, then shade each terrain-hidden pixel once. */
export function installCharacterSilhouette(scene: THREE.Scene) {
  const makeTarget = () =>
    new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
    });
  const avatar = makeTarget(),
    terrain = makeTarget();
  const mask = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    toneMapped: false,
  });
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      avatarDepth: { value: avatar.depthTexture },
      terrainDepth: { value: terrain.depthTexture },
      texel: { value: new THREE.Vector2() },
      bias: { value: 0.0001 },
      fill: { value: new THREE.Color("#708189") },
      rim: { value: new THREE.Color("#f4ebd5") },
    },
    vertexShader: `varying vec2 vUv;
      void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: `varying vec2 vUv;
      uniform sampler2D avatarDepth,terrainDepth;
      uniform vec2 texel; uniform float bias; uniform vec3 fill,rim;
      void main(){
        float body=texture2D(avatarDepth,vUv).r;
        float terrain=texture2D(terrainDepth,vUv).r;
        if(body>=.99999 || terrain+bias>=body) discard;
        float edge=0.;
        for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++){
          float neighbor=texture2D(avatarDepth,vUv+vec2(float(x),float(y))*texel).r;
          edge=max(edge,step(.99999,neighbor));
        }
        gl_FragColor=vec4(mix(fill,rim,edge),mix(.42,.8,edge));
        #include <colorspace_fragment>
      }`,
  });
  const composite = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  composite.add(quad);
  const screenCamera = new THREE.Camera();
  const size = new THREE.Vector2(),
    clear = new THREE.Color();
  const viewport = new THREE.Vector4(),
    scissor = new THREE.Vector4();
  const previous = scene.onAfterRender;
  let rendering = false;
  scene.onAfterRender = (...args) => {
    const [renderer, , camera] = args;
    if (rendering) return;
    previous.apply(scene, args);
    rendering = true;
    const target = renderer.getRenderTarget();
    const oldMask = camera.layers.mask,
      oldOverride = scene.overrideMaterial;
    const background = scene.background,
      autoClear = renderer.autoClear;
    const alpha = renderer.getClearAlpha(),
      scissorTest = renderer.getScissorTest();
    renderer.getClearColor(clear);
    renderer.getViewport(viewport);
    renderer.getScissor(scissor);
    const infoAutoReset = renderer.info.autoReset;
    try {
      renderer.info.autoReset = false;
      renderer.getDrawingBufferSize(size);
      if (avatar.width !== size.x || avatar.height !== size.y) {
        avatar.setSize(size.x, size.y);
        terrain.setSize(size.x, size.y);
      }
      material.uniforms.texel.value.set(1.5 / size.x, 1.5 / size.y);
      const depthCamera = camera as THREE.OrthographicCamera;
      material.uniforms.bias.value =
        0.015 / (depthCamera.far - depthCamera.near);
      renderer.autoClear = true;
      renderer.setScissorTest(false);
      renderer.setClearColor(0x000000, 0);
      scene.background = null;
      scene.overrideMaterial = mask;
      camera.layers.set(AVATAR_LAYER);
      renderer.setRenderTarget(avatar);
      renderer.render(scene, camera);
      camera.layers.set(TERRAIN_LAYER);
      renderer.setRenderTarget(terrain);
      renderer.render(scene, camera);
      renderer.setRenderTarget(target);
      renderer.setViewport(viewport);
      renderer.setScissor(scissor);
      renderer.setScissorTest(scissorTest);
      renderer.autoClear = false;
      renderer.render(composite, screenCamera);
    } finally {
      camera.layers.mask = oldMask;
      scene.overrideMaterial = oldOverride;
      scene.background = background;
      renderer.autoClear = autoClear;
      renderer.info.autoReset = infoAutoReset;
      renderer.setRenderTarget(target);
      renderer.setViewport(viewport);
      renderer.setScissor(scissor);
      renderer.setScissorTest(scissorTest);
      renderer.setClearColor(clear, alpha);
      rendering = false;
    }
  };
  return () => {
    scene.onAfterRender = previous;
    avatar.dispose();
    terrain.dispose();
    mask.dispose();
    material.dispose();
    quad.geometry.dispose();
  };
}
