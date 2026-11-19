// Sol Bay: the Bay Patrol helicopter. When the heat hits 3 stars, the
// harbour patrol sends a chopper up: it circles over the player and pins
// them with a searchlight. It never shoots and never busts anyone — it is
// pressure and spectacle, the thing that makes a 3-star chase feel like a
// chase. Its look is Sol Bay's own: white hull, bay-blue stripe, "Bay
// Patrol" on the radio, not anyone else's air unit.
import { CONFIG } from './config.js';

const HELI_MIN_WANTED = 3;
const HELI_HEIGHT = 38; // metres above the ground
const HELI_ORBIT_RADIUS = 20;
const HELI_ORBIT_SPEED = 0.22; // radians per second

export class HelicopterSystem {
  constructor(game) {
    this.game = game;
    this.active = false;
    this._angle = 0;
    this.group = new THREE.Group();
    this.group.name = 'bay-patrol-heli';
    this.group.visible = false;
    if (game.scene) game.scene.add(this.group);
    this._buildMesh();
  }

  _buildMesh() {
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.4, metalness: 0.3 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x1d5fa8, roughness: 0.5, metalness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a2733, roughness: 0.2, metalness: 0.6 });
    const grey = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.7, metalness: 0.4 });

    // Main hull: a rounded box, nose forward (-Z).
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.5, 3.6), white);
    hull.position.y = 0;
    hull.castShadow = true;
    this.group.add(hull);
    // Glass cabin (front).
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 1.2), dark);
    cabin.position.set(0, 0.15, -1.5);
    this.group.add(cabin);
    // Bay-blue stripe along the hull.
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.35, 3.0), blue);
    stripe.position.set(0, -0.25, 0.2);
    this.group.add(stripe);
    // Tail boom + tail fin.
    const boom = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3.4), white);
    boom.position.set(0, 0.25, 3.2);
    boom.castShadow = true;
    this.group.add(boom);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, 0.9), blue);
    fin.position.set(0, 0.7, 4.7);
    this.group.add(fin);
    // Tail rotor (small, vertical, spins around X).
    this._tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 0.18), grey);
    this._tailRotor.position.set(0.32, 0.5, 4.6);
    this.group.add(this._tailRotor);
    // Main rotor mast + two-blade rotor (spins around Y).
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8), grey);
    mast.position.y = 1.05;
    this.group.add(mast);
    this._rotor = new THREE.Group();
    const bladeGeo = new THREE.BoxGeometry(9.5, 0.08, 0.45);
    const blade1 = new THREE.Mesh(bladeGeo, grey);
    const blade2 = new THREE.Mesh(bladeGeo, grey);
    blade2.rotation.y = Math.PI / 2;
    this._rotor.add(blade1, blade2);
    this._rotor.position.y = 1.45;
    this.group.add(this._rotor);
    // Skids.
    for (const x of [-0.85, 0.85]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.0), grey);
      skid.position.set(x, -1.05, 0);
      this.group.add(skid);
    }
    // Searchlight beam: a cone, apex at the heli, base on the ground.
    // ConeGeometry puts the apex at +Y and the base at -Y, so a cone of
    // height H centred H/2 below the heli reads as a beam shining down.
    this._beam = new THREE.Mesh(
      new THREE.ConeGeometry(4.5, HELI_HEIGHT, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfff6c0, transparent: true, opacity: 0.14,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    this._beam.position.y = -HELI_HEIGHT / 2;
    this.group.add(this._beam);
    // A real spotlight so the beam leaves a pool of light on the street.
    this._spot = new THREE.SpotLight(0xfff2c0, 120, 90, 0.42, 0.7, 1.1);
    this._spot.position.set(0, 0, 0);
    this._spotTarget = new THREE.Object3D();
    if (this.game.scene) this.game.scene.add(this._spotTarget);
    this._spot.target = this._spotTarget;
    this.group.add(this._spot);
    // Searchlight housing under the nose.
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff6c0 }),
    );
    lamp.position.set(0, -0.85, -1.2);
    this.group.add(lamp);
  }

  /** Spawn the chopper above the player (used by the wanted system). */
  _spawn() {
    const p = this.game.player && this.game.player.position;
    if (!p) return;
    this._angle = Math.atan2(p.x, p.z) + Math.PI / 2;
    this.group.position.set(p.x + Math.sin(this._angle) * HELI_ORBIT_RADIUS, HELI_HEIGHT, p.z + Math.cos(this._angle) * HELI_ORBIT_RADIUS);
    this.group.visible = true;
    this.active = true;
  }

  /** Remove the chopper from the sky. */
  _despawn() {
    this.group.visible = false;
    this.active = false;
  }

  /** Force the chopper into the sky (screenshot staging uses this). */
  ensure() {
    if (!this.active) this._spawn();
    return this.active;
  }

  /** Place the chopper at an exact spot, at natural scale (staging only). */
  placeForShot(x, z, height) {
    this.ensure();
    this._pinned = true;
    this.group.position.set(x, height || HELI_HEIGHT, z);
    // Face the player so the nose and the beam read in the frame.
    const p = this.game.player && this.game.player.position;
    if (p) {
      this.group.lookAt(p.x, this.group.position.y, p.z);
      // lookAt points +Z at the target; the heli nose is -Z, so turn around.
      this.group.rotateY(Math.PI);
    }
  }

  update(dt) {
    const state = this.game.state;
    if (!state || state.paused || state.endState) return;
    const wanted = state.wanted || 0;
    if (wanted >= HELI_MIN_WANTED && !this.active) this._spawn();
    if (wanted < HELI_MIN_WANTED && this.active) this._despawn();
    if (!this.active) return;

    const p = this.game.player && this.game.player.position;
    if (!p) return;
    // A staged shot pins the chopper in place — the orbit would drag it out
    // of the frame the next tick. Rotors keep spinning, beam stays aimed.
    if (!this._pinned) {
      // Slow orbit over the player, holding height.
      this._angle += HELI_ORBIT_SPEED * dt;
      const x = p.x + Math.sin(this._angle) * HELI_ORBIT_RADIUS;
      const z = p.z + Math.cos(this._angle) * HELI_ORBIT_RADIUS;
      this.group.position.set(x, HELI_HEIGHT, z);
      this.group.lookAt(p.x, HELI_HEIGHT, p.z);
      this.group.rotateY(Math.PI);
    }
    // Rotors spin; the beam stays aimed at the player.
    if (this._rotor) this._rotor.rotation.y += dt * 22;
    if (this._tailRotor) this._tailRotor.rotation.x += dt * 30;
    if (this._spotTarget) this._spotTarget.position.set(p.x, 0, p.z);
  }

  reset() {
    this._despawn();
    this._pinned = false;
    this._angle = 0;
  }
}
