import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

// Lädt & cached glTF-Modelle (echte animierte Charaktere).
// Modelle sind meshopt-komprimiert (2,16 MB -> ~0,55 MB) -> Decoder nötig.
export class Assets {
  constructor() {
    this.loader = new GLTFLoader();
    this.loader.setMeshoptDecoder(MeshoptDecoder);
    this.gltf = {};
  }

  load(key, url, onProgress) {
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          this.gltf[key] = gltf;
          resolve(gltf);
        },
        (xhr) => {
          if (onProgress && xhr.total > 0) onProgress(Math.min(1, xhr.loaded / xhr.total));
        },
        (err) => reject(err)
      );
    });
  }

  async loadAll(onProgress) {
    const list = [['hero', 'models/Soldier.glb']];
    let done = 0;
    for (const [key, url] of list) {
      try {
        // Byte-genauer Fortschritt innerhalb der Datei + Anteil an der Gesamtliste
        await this.load(key, url, (f) => onProgress && onProgress((done + f) / list.length));
      } catch (e) {
        console.warn('Konnte Modell nicht laden:', key, e);
      }
      done++;
      if (onProgress) onProgress(done / list.length);
    }
  }

  // Extrahiert aus einem geladenen glTF eine instanzierbare Quelle:
  // normalisiert auf Höhe 1 (Füße bei y=0, in x/z zentriert), nach +Z ausgerichtet.
  // Rückgabe: { geometry, material } oder null.
  extractInstanceSource(key, { yawOffset = 0, tint = null } = {}) {
    const gltf = this.gltf[key];
    if (!gltf) return null;

    // Mesh mit den meisten Vertices = Hauptkörper
    let best = null;
    let bestN = 0;
    gltf.scene.traverse((o) => {
      if ((o.isMesh || o.isSkinnedMesh) && o.geometry?.attributes?.position) {
        const n = o.geometry.attributes.position.count;
        if (n > bestN) {
          bestN = n;
          best = o;
        }
      }
    });
    if (!best) return null;

    const geo = best.geometry.clone();
    geo.morphAttributes = {};
    geo.deleteAttribute('skinIndex');
    geo.deleteAttribute('skinWeight');

    // auf Höhe 1 normalisieren
    geo.computeBoundingBox();
    const size = new THREE.Vector3();
    geo.boundingBox.getSize(size);
    const s = 1 / (size.y || 1);
    geo.scale(s, s, s);
    if (yawOffset) geo.rotateY(yawOffset);

    // Füße auf y=0, in x/z zentrieren
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);

    let mat = Array.isArray(best.material) ? best.material[0] : best.material;
    mat = mat.clone();
    mat.side = THREE.FrontSide;
    mat.roughness = mat.roughness ?? 0.85;
    if (tint) mat.color = new THREE.Color(tint);

    return { geometry: geo, material: mat };
  }

  // Instanz des Helden-Modells: skaliert auf gewünschte Höhe, Füße auf y=0,
  // plus AnimationMixer mit benannten Clips.
  createHero(targetHeight = 1.9, tint = null) {
    const gltf = this.gltf.hero;
    // Klonen, damit mehrere Helden (Koop) möglich sind
    const root = skeletonClone(gltf.scene);

    // Schatten aktivieren
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false; // SkinnedMesh-Culling-Probleme vermeiden
        if (tint) {
          o.material = o.material.clone();
          o.material.color = new THREE.Color(tint);
        }
      }
    });

    // WICHTIG: nach SkeletonUtils.clone sind die World-Matrizen veraltet —
    // ohne Update liefert setFromObject eine fast leere Box -> riesiger Scale.
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scale = targetHeight / (size.y || 1);
    root.scale.setScalar(scale);

    // Füße auf y=0 setzen (Matrizen erneut aktualisieren)
    root.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(root);
    root.position.y -= box2.min.y;

    // In Wrapper-Gruppe, damit wir frei rotieren/positionieren können
    const group = new THREE.Group();
    group.add(root);

    const mixer = new THREE.AnimationMixer(root);
    const actions = {};
    for (const clip of gltf.animations) {
      actions[clip.name] = mixer.clipAction(clip);
    }

    return { group, mixer, actions, clipNames: gltf.animations.map((c) => c.name) };
  }
}
