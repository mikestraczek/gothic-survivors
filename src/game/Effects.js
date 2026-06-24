import * as THREE from 'three';

// Pool-basiertes Effekt-System für „geile" Waffen-Visuals.
// Alles additiv + hell -> profitiert stark vom Bloom-Pass.
const SPARK_CAP = 500;

export class Effects {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);

    // Multiplayer: Effekt-Events aufzeichnen (Host) / abspielen (Client)
    this.record = false;
    this.events = [];

    // Boden-Warnzonen (folgen dem Gelände, normaler Tiefentest -> Held verdeckt sie)
    this.heightAt = null; // vom Game gesetzt: (x,z) => Geländehöhe
    this.zones = [];

    // ---- Funken (InstancedMesh) ----
    this.sparks = [];
    const sparkGeo = new THREE.TetrahedronGeometry(0.13, 0);
    const sparkMat = new THREE.MeshBasicMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sparkMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, SPARK_CAP);
    this.sparkMesh.frustumCulled = false;
    this.sparkMesh.count = 0;
    this.sparkMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SPARK_CAP * 3), 3);
    this.group.add(this.sparkMesh);
    this._sc = new THREE.Color();

    // ---- Mesh-Effekt-Pools (Ringe, Slashes, Explosionen, Blitze) ----
    this.fx = [];
    this.ringGeo = new THREE.RingGeometry(0.84, 1.0, 44);
    this.slashGeo = new THREE.RingGeometry(0.55, 1.0, 28, 1, 0, Math.PI * 1.25);
    this.boomGeo = new THREE.SphereGeometry(1, 18, 14);
    this.boltGeo = new THREE.CylinderGeometry(0.05, 0.32, 7.5, 6, 1, true);
    this.flashGeo = new THREE.SphereGeometry(0.7, 12, 10);
    this.teleGeo = new THREE.CircleGeometry(1, 30);
    this.teleRingGeo = new THREE.RingGeometry(0.88, 1.0, 40);
    // Kegel-Sektor (Frontalangriff), Halbwinkel 0.55 rad, zeigt entlang +X; flach in XZ gedreht
    this.coneGeo = new THREE.CircleGeometry(1, 26, -0.55, 1.1);
    this.coneGeo.rotateX(-Math.PI / 2);
  }

  _getFx(kind, geo, color, blending = THREE.AdditiveBlending, side = THREE.DoubleSide) {
    let e = this.fx.find((x) => !x.alive && x.kind === kind);
    if (!e) {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color, transparent: true, blending, side, depthWrite: false })
      );
      e = { mesh, alive: false, kind };
      this.fx.push(e);
      this.group.add(mesh);
    }
    e.mesh.material.color.set(color);
    e.mesh.material.opacity = 1;
    e.mesh.visible = true;
    e.alive = true;
    e.t = 0;
    return e;
  }

  drain() {
    const e = this.events;
    this.events = [];
    return e;
  }
  replay(list) {
    if (!list) return;
    const was = this.record;
    this.record = false;
    for (const e of list) {
      if (e.k === 'ring') this.ring(e.x, e.z, e.a, e.b);
      else if (e.k === 'explosion') this.explosion(e.x, e.z, e.a, e.b);
      else if (e.k === 'bolt') this.bolt(e.x, e.z, e.b);
      else if (e.k === 'slash') this.slash(e.x, e.z, e.a, 0, e.b);
      else if (e.k === 'sparks') this.sparksBurst(e.x, 0.9, e.z, e.a, e.b, 5);
      else if (e.k === 'tele') this.telegraph(e.x, e.z, e.a, e.b, e.c);
      else if (e.k === 'safe') this.telegraphSafe(e.x, e.z, e.a, e.b, e.c);
      else if (e.k === 'cone') this.telegraphCone(e.x, e.z, e.dx, e.dz, e.a, e.b, e.c);
    }
    this.record = was;
  }

  // ---------- öffentliche Spawner ----------
  sparksBurst(x, y, z, color, count = 8, speed = 6) {
    if (this.record) this.events.push({ k: 'sparks', x, z, a: color, b: count });
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      let sp = this.sparks.find((s) => !s.alive);
      if (!sp) {
        if (this.sparks.length >= SPARK_CAP) break;
        sp = {};
        this.sparks.push(sp);
      }
      const a = Math.random() * Math.PI * 2;
      const up = 2 + Math.random() * speed;
      const r = Math.random() * speed;
      sp.alive = true;
      sp.x = x;
      sp.y = y;
      sp.z = z;
      sp.vx = Math.cos(a) * r;
      sp.vz = Math.sin(a) * r;
      sp.vy = up;
      sp.life = 0.35 + Math.random() * 0.4;
      sp.maxLife = sp.life;
      sp.size = 0.6 + Math.random() * 0.8;
      sp.r = c.r;
      sp.g = c.g;
      sp.b = c.b;
    }
  }

  ring(x, z, maxR, color) {
    if (this.record) this.events.push({ k: 'ring', x, z, a: maxR, b: color });
    const e = this._getFx('ring', this.ringGeo, color);
    e.mesh.rotation.x = -Math.PI / 2;
    e.dur = 0.4;
    e.maxR = maxR;
    e.mesh.position.set(x, 0.35, z);
    e.mesh.scale.setScalar(maxR * 0.25);
    return e;
  }

  slash(x, z, r, angle, color = 0xfff0c0) {
    if (this.record) this.events.push({ k: 'slash', x, z, a: r, b: color });
    const e = this._getFx('slash', this.slashGeo, color);
    e.mesh.rotation.set(-Math.PI / 2, 0, -angle);
    e.dur = 0.28;
    e.maxR = r;
    e.spin = (Math.random() > 0.5 ? 1 : -1) * 9;
    e.mesh.position.set(x, 0.9, z);
    e.mesh.scale.setScalar(r);
    return e;
  }

  explosion(x, z, r, color = 0xffa030) {
    if (this.record) this.events.push({ k: 'explosion', x, z, a: r, b: color });
    const was = this.record;
    this.record = false; // innere Effekte nicht doppelt aufzeichnen
    // heller Kern (Sphere) + doppelter Stoßring + viele Funken
    const e = this._getFx('boom', this.boomGeo, 0xfff2c0);
    e.dur = 0.42;
    e.maxR = r;
    e.mesh.position.set(x, 0.9, z);
    e.mesh.scale.setScalar(r * 0.3);
    this.ring(x, z, r * 1.4, color);
    this.ring(x, z, r * 0.8, 0xffffff);
    this.sparksBurst(x, 0.8, z, 0xffd070, 22, r * 3.4);
    this.record = was;
  }

  bolt(x, z, color = 0xcfe6ff) {
    if (this.record) this.events.push({ k: 'bolt', x, z, a: 0, b: color });
    const wasB = this.record;
    this.record = false;
    // gezackte Lichtsäule (mehrere versetzte Segmente) + Aufblitz + Bodenring + Funken
    for (let i = 0; i < 3; i++) {
      const e = this._getFx('bolt', this.boltGeo, i === 0 ? 0xffffff : color);
      e.dur = 0.24;
      const ox = i === 0 ? 0 : (Math.random() - 0.5) * 0.9;
      const oz = i === 0 ? 0 : (Math.random() - 0.5) * 0.9;
      e.mesh.position.set(x + ox, 3.9 + i * 0.3, z + oz);
      e.mesh.rotation.z = (Math.random() - 0.5) * 0.5;
      e.mesh.scale.set(i === 0 ? 1.3 : 0.7, 1, i === 0 ? 1.3 : 0.7);
    }
    const f = this._getFx('flash', this.flashGeo, 0xffffff);
    f.dur = 0.22;
    f.mesh.position.set(x, 1.0, z);
    f.mesh.scale.setScalar(1.4);

    this.ring(x, z, 3.0, color);
    this.sparksBurst(x, 0.6, z, 0xbfe0ff, 14, 8);
    this.record = wasB;
  }

  // Geländeangepasste Boden-Zone (Fan): Mitte dim, Rand hell. Normaler Tiefentest -> Held verdeckt sie.
  _spawnZone(cx, cz, r, dur, fill, rim, a0, a1) {
    const segs = Math.max(8, Math.round(((a1 - a0) / (Math.PI * 2)) * 44));
    const h = this.heightAt || (() => 0);
    const n = segs + 2; // Rand (segs+1) + Mittelpunkt
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const cf = new THREE.Color(fill), cr = new THREE.Color(rim);
    pos[0] = cx; pos[1] = h(cx, cz) + 0.06; pos[2] = cz;
    col[0] = cf.r; col[1] = cf.g; col[2] = cf.b;
    for (let i = 0; i <= segs; i++) {
      const a = a0 + (a1 - a0) * (i / segs);
      const vx = cx + Math.cos(a) * r, vz = cz + Math.sin(a) * r;
      const o = (i + 1) * 3;
      pos[o] = vx; pos[o + 1] = h(vx, vz) + 0.06; pos[o + 2] = vz;
      col[o] = cr.r; col[o + 1] = cr.g; col[o + 2] = cr.b;
    }
    const idx = [];
    for (let i = 1; i <= segs; i++) idx.push(0, i, i + 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2;
    this.group.add(mesh);
    this.zones.push({ mesh, t: 0, dur });
  }

  // Warnzone (rot, Vollkreis)
  telegraph(x, z, r, dur, y = 0.2) {
    if (this.record) this.events.push({ k: 'tele', x, z, a: r, b: dur, c: y });
    this._spawnZone(x, z, r, dur, 0xa01010, 0xff5a28, 0, Math.PI * 2);
  }

  // Sichere Zone (grün, Vollkreis)
  telegraphSafe(x, z, r, dur, y = 0.2) {
    if (this.record) this.events.push({ k: 'safe', x, z, a: r, b: dur, c: y });
    this._spawnZone(x, z, r, dur, 0x16a836, 0x6cff8c, 0, Math.PI * 2);
  }

  // Frontaler Kegel-Warnbereich in Richtung (dx,dz)
  telegraphCone(x, z, dx, dz, range, dur, y = 0.2) {
    if (this.record) this.events.push({ k: 'cone', x, z, dx, dz, a: range, b: dur, c: y });
    const ang = Math.atan2(dz, dx);
    this._spawnZone(x, z, range, dur, 0xa01010, 0xff5a28, ang - 0.55, ang + 0.55);
  }

  // ---------- Update ----------
  update(dt) {
    // Boden-Warnzonen: pulsieren, zum Ende heller/schneller, dann entfernen
    if (this.zones.length) {
      for (let i = this.zones.length - 1; i >= 0; i--) {
        const zn = this.zones[i];
        zn.t += dt;
        const k = zn.t / zn.dur;
        if (k >= 1) {
          this.group.remove(zn.mesh);
          zn.mesh.geometry.dispose();
          zn.mesh.material.dispose();
          this.zones.splice(i, 1);
          continue;
        }
        zn.mesh.material.opacity = k > 0.7 ? 0.5 + 0.3 * Math.sin(zn.t * 30) : 0.34 + 0.16 * Math.sin(zn.t * 12);
      }
    }

    // Funken
    let idx = 0;
    for (const s of this.sparks) {
      if (!s.alive) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.alive = false;
        continue;
      }
      s.vy -= 14 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      if (s.y < 0.1) {
        s.y = 0.1;
        s.vy *= -0.3;
      }
      const k = s.life / s.maxLife;
      this._p.set(s.x, s.y, s.z);
      this._q.setFromAxisAngle(this._up, s.life * 20);
      this._s.setScalar(s.size * k);
      this._m.compose(this._p, this._q, this._s);
      this.sparkMesh.setMatrixAt(idx, this._m);
      this._sc.setRGB(s.r * k, s.g * k, s.b * k);
      this.sparkMesh.setColorAt(idx, this._sc);
      idx++;
    }
    this.sparkMesh.count = idx;
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    if (this.sparkMesh.instanceColor) this.sparkMesh.instanceColor.needsUpdate = true;

    // Mesh-Effekte
    for (const e of this.fx) {
      if (!e.alive) continue;
      e.t += dt;
      const k = e.t / e.dur;
      if (k >= 1) {
        e.alive = false;
        e.mesh.visible = false;
        continue;
      }
      const mat = e.mesh.material;
      if (e.kind === 'ring') {
        const sc = e.maxR * (0.25 + k * 0.95);
        e.mesh.scale.setScalar(sc);
        mat.opacity = 1 - k;
      } else if (e.kind === 'slash') {
        e.mesh.rotation.z += e.spin * dt;
        e.mesh.scale.setScalar(e.maxR * (0.7 + k * 0.5));
        mat.opacity = (1 - k) * 0.95;
      } else if (e.kind === 'boom') {
        const sc = e.maxR * (0.3 + k * 1.0);
        e.mesh.scale.setScalar(sc);
        mat.opacity = (1 - k) * 0.9;
      } else if (e.kind === 'bolt') {
        e.mesh.scale.x = e.mesh.scale.z = 1 + k * 0.6;
        mat.opacity = 1 - k;
      } else if (e.kind === 'flash') {
        e.mesh.scale.setScalar(1.2 + k * 2.5);
        mat.opacity = 1 - k;
      } else if (e.kind === 'tele' || e.kind === 'cone') {
        // pulsierende Gefahrenfläche; zum Ende hin schneller/heller
        mat.opacity = k > 0.7 ? 0.5 + 0.28 * Math.sin(e.t * 30) : 0.34 + 0.18 * Math.sin(e.t * 13);
      } else if (e.kind === 'telering') {
        e.mesh.scale.setScalar(e.maxR); // fester Radius (Grenze der Gefahrenzone)
        mat.opacity = k > 0.7 ? 0.85 + 0.15 * Math.sin(e.t * 34) : 0.7;
      }
    }
  }
}
