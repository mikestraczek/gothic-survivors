import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Vertex Animation Textures (VAT):
// Eine Animation wird CPU-seitig in eine Float-Textur gebacken (Spalte = Vertex,
// Zeile = Frame). Im Vertex-Shader liest jede Instanz anhand ihrer eigenen Zeit
// die Position aus der Textur -> animierte Modelle als InstancedMesh
// (hunderte Gegner, eine Draw-Call pro Typ). Mehrere Skinned-Meshes eines
// Modells werden zusammengefasst; Material-Farben werden als Vertex-Farben gebacken.

const _loader = new GLTFLoader();

export async function bakeVAT(url, { clip = null, frames = 24, height = 1.0, yawOffset = 0 } = {}) {
  const gltf = await _loader.loadAsync(url);

  const skinned = [];
  gltf.scene.traverse((o) => {
    if (o.isSkinnedMesh && o.geometry?.attributes?.position) skinned.push(o);
  });
  if (!skinned.length) throw new Error('kein SkinnedMesh in ' + url);

  const clipObj =
    (clip && gltf.animations.find((c) => c.name === clip)) ||
    gltf.animations.find((c) => /run|walk|move|fly/i.test(c.name)) ||
    gltf.animations[0];
  if (!clipObj) throw new Error('keine Animation in ' + url);

  gltf.scene.updateMatrixWorld(true);
  const mixer = new THREE.AnimationMixer(gltf.scene);
  mixer.clipAction(clipObj).play();
  const duration = clipObj.duration || 1;

  let total = 0;
  for (const m of skinned) total += m.geometry.attributes.position.count;
  // VAT-Textur ist `total` Pixel breit -> max. Texturgröße der GPU nicht überschreiten
  if (total > 16000) throw new Error('Modell hat zu viele Vertices für VAT (' + total + '): ' + url);

  const data = new Float32Array(total * frames * 4); // animierte Positionen
  const colors = new Float32Array(total * 3); // Vertex-Farben aus Materialien
  const uvs = new Float32Array(total * 2);
  let hasUV = false;
  let map = null;
  const indices = [];

  // statische Attribute (Farbe/UV/Index) einmal aufbauen
  {
    let off = 0;
    for (const m of skinned) {
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      const col = mat && mat.color ? mat.color : new THREE.Color(0xffffff);
      if (mat && mat.map && !map) map = mat.map;
      const cnt = m.geometry.attributes.position.count;
      const uv = m.geometry.attributes.uv;
      for (let i = 0; i < cnt; i++) {
        colors[(off + i) * 3] = col.r;
        colors[(off + i) * 3 + 1] = col.g;
        colors[(off + i) * 3 + 2] = col.b;
        if (uv) { hasUV = true; uvs[(off + i) * 2] = uv.getX(i); uvs[(off + i) * 2 + 1] = uv.getY(i); }
      }
      const idx = m.geometry.index;
      if (idx) for (let j = 0; j < idx.count; j++) indices.push(off + idx.getX(j));
      else for (let j = 0; j < cnt; j++) indices.push(off + j);
      off += cnt;
    }
  }

  // Frames backen
  const v = new THREE.Vector3();
  for (let f = 0; f < frames; f++) {
    mixer.setTime((f / frames) * duration);
    gltf.scene.updateMatrixWorld(true);
    let off = 0;
    for (const m of skinned) {
      m.skeleton.update();
      m.updateMatrixWorld(true);
      const xform = m.applyBoneTransform ? m.applyBoneTransform.bind(m) : m.boneTransform.bind(m);
      const pa = m.geometry.attributes.position;
      const cnt = pa.count;
      for (let i = 0; i < cnt; i++) {
        v.fromBufferAttribute(pa, i);
        xform(i, v);
        v.applyMatrix4(m.matrixWorld); // aufrechte Welt-Pose
        const o = (f * total + off + i) * 4;
        data[o] = v.x; data[o + 1] = v.y; data[o + 2] = v.z; data[o + 3] = 1;
      }
      off += cnt;
    }
    // Root-Motion entfernen: horizontalen Schwerpunkt dieser Pose abziehen (in-place)
    let sx = 0, sz = 0;
    for (let i = 0; i < total; i++) { const o = (f * total + i) * 4; sx += data[o]; sz += data[o + 2]; }
    const mx = sx / total, mz = sz / total;
    for (let i = 0; i < total; i++) { const o = (f * total + i) * 4; data[o] -= mx; data[o + 2] -= mz; }
  }

  // Normalisieren: BBox über alle Frames -> Höhe `height`, Füße y=0, x/z zentriert, + yawOffset
  let minx = Infinity, miny = Infinity, minz = Infinity, maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
  for (let i = 0; i < data.length; i += 4) {
    const x = data[i], y = data[i + 1], z = data[i + 2];
    if (x < minx) minx = x; if (x > maxx) maxx = x;
    if (y < miny) miny = y; if (y > maxy) maxy = y;
    if (z < minz) minz = z; if (z > maxz) maxz = z;
  }
  const sy = height / ((maxy - miny) || 1);
  const cx = (minx + maxx) / 2, cz = (minz + maxz) / 2;
  const cosY = Math.cos(yawOffset), sinY = Math.sin(yawOffset);
  for (let i = 0; i < data.length; i += 4) {
    let x = (data[i] - cx) * sy, y = (data[i + 1] - miny) * sy, z = (data[i + 2] - cz) * sy;
    if (yawOffset) { const nx = x * cosY + z * sinY; z = -x * sinY + z * cosY; x = nx; }
    data[i] = x; data[i + 1] = y; data[i + 2] = z;
  }

  const tex = new THREE.DataTexture(data, total, frames, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;

  // Basis-Geometrie (Ruhepose = Frame 0)
  const baseGeo = new THREE.BufferGeometry();
  const pos0 = new Float32Array(total * 3);
  for (let i = 0; i < total; i++) { const o = i * 4; pos0[i * 3] = data[o]; pos0[i * 3 + 1] = data[o + 1]; pos0[i * 3 + 2] = data[o + 2]; }
  baseGeo.setAttribute('position', new THREE.BufferAttribute(pos0, 3));
  baseGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (hasUV) baseGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  baseGeo.setIndex(indices);
  const vid = new Float32Array(total);
  for (let i = 0; i < total; i++) vid[i] = i;
  baseGeo.setAttribute('aVid', new THREE.BufferAttribute(vid, 1));
  baseGeo.computeVertexNormals();
  baseGeo.computeBoundingSphere();

  return { baseGeo, tex, frames, duration, count: total, map };
}

// Eigene Geometrie pro Typ: teilt statische Buffers, eigener aTime-Instanz-Buffer.
export function vatGeometry(vat, cap) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', vat.baseGeo.getAttribute('position'));
  g.setAttribute('normal', vat.baseGeo.getAttribute('normal'));
  g.setAttribute('color', vat.baseGeo.getAttribute('color'));
  if (vat.baseGeo.getAttribute('uv')) g.setAttribute('uv', vat.baseGeo.getAttribute('uv'));
  g.setAttribute('aVid', vat.baseGeo.getAttribute('aVid'));
  if (vat.baseGeo.index) g.setIndex(vat.baseGeo.index);
  g.setAttribute('aTime', new THREE.InstancedBufferAttribute(new Float32Array(cap), 1));
  g.boundingSphere = vat.baseGeo.boundingSphere;
  return g;
}

// Material mit VAT-Vertex-Animation + Fresnel-Randglühen in der Typ-Farbe.
export function vatMaterial(vat, { tint = 0xffffff, glow = 0x884444, glowI = 0.3, rim = 0.75 } = {}) {
  const mat = new THREE.MeshStandardMaterial({
    map: vat.map || null,
    color: new THREE.Color(tint),
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    emissive: new THREE.Color(glow),
    emissiveIntensity: glowI,
  });
  const gc = new THREE.Color(glow);
  const r = (gc.r * rim).toFixed(3), g = (gc.g * rim).toFixed(3), b = (gc.b * rim).toFixed(3);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.vatTex = { value: vat.tex };
    sh.uniforms.vatFrames = { value: vat.frames };
    sh.uniforms.vatVerts = { value: vat.count };
    sh.uniforms.vatDur = { value: vat.duration };
    sh.vertexShader =
      'attribute float aVid;\nattribute float aTime;\nuniform sampler2D vatTex;\nuniform float vatFrames;\nuniform float vatVerts;\nuniform float vatDur;\n' +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        `float _t = mod(aTime, vatDur) / vatDur;
         float _fF = _t * (vatFrames - 1.0);
         float _f0 = floor(_fF);
         float _fr = _fF - _f0;
         float _col = (aVid + 0.5) / vatVerts;
         vec3 _p0 = texture2D(vatTex, vec2(_col, (_f0 + 0.5) / vatFrames)).xyz;
         vec3 _p1 = texture2D(vatTex, vec2(_col, (min(_f0 + 1.0, vatFrames - 1.0) + 0.5) / vatFrames)).xyz;
         vec3 transformed = mix(_p0, _p1, _fr);`
      );
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <dithering_fragment>',
      `float _rim = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), 2.5);
       gl_FragColor.rgb += vec3(${r}, ${g}, ${b}) * _rim;
       #include <dithering_fragment>`
    );
  };
  return mat;
}
