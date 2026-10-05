import * as THREE from 'three';
import { Sprite3D, createCharacterSheet, CHARACTER_PRESETS, damp, clamp } from '../engine/index.js';
import { CHARACTER_SPRITE_OPTS, IDLE_SPEED } from './config.js';

/**
 * @import { AudioSystem } from '../engine/audio/AudioSystem.js'
 * @import { CameraRig } from '../engine/core/CameraRig.js'
 * @import { Particles } from '../engine/fx/Particles.js'
 * @import { TileMap } from '../engine/world/TileMap.js'
 * @import { Input } from '../engine/core/Input.js'
 */

const WALK_SPEED = 3.2;
const RUN_SPEED = 5.6;
const RADIUS = 0.3;

const DIR_VECTORS = {
  down: new THREE.Vector3(0, 0, 1),
  up: new THREE.Vector3(0, 0, -1),
  left: new THREE.Vector3(-1, 0, 0),
  right: new THREE.Vector3(1, 0, 0),
};

/**
 * The traveler: camera-relative movement (CameraRig.getMoveBasis), walk / run, 4-direction facing
 * from the screen-space movement direction, TileMap collisions + smooth height following (stairs,
 * bridge decks), footstep sfx on the contact frames and dust bursts while running.
 *
 * On combat levels (`combat: true`, COMBAT.md §9.7) the traveler carries a sword and the combat
 * sheet (18 columns) on the hit-flash sprite program, and the combat core drives it: while
 * `action` is set the combat core owns the sprite (poses through `setFrame`) and `update` only
 * follows the ground; `faceOverride` turns the sprite toward a lock-on target while walking
 * (strafing); `moveOverride` (tests) replaces the input's move vector with a world-space one;
 * `speedMul` scales walk / run; `moveBy` is every combat displacement (lunges, rolls, knockback,
 * separation). On peaceful levels none of this is used and the player is exactly today's.
 */
export class Player {
  /**
   * @param {{ tileMap: TileMap, rig: CameraRig, particles: Particles, audio: AudioSystem,
   *           spawn: {x:number, z:number, facing?:string}, combat?: boolean }} ctx
   */
  constructor({ tileMap, rig, particles, audio, spawn, combat = false }) {
    this.tileMap = tileMap;
    this.rig = rig;
    this.particles = particles;
    this.audio = audio;
    this.sheet = combat
      ? createCharacterSheet({ ...CHARACTER_PRESETS.traveler, preset: 'traveler', weapon: 'sword' }, { combat: true })
      : createCharacterSheet({ ...CHARACTER_PRESETS.traveler, preset: 'traveler' });
    this.sprite = new Sprite3D(this.sheet, combat
      ? { ...CHARACTER_SPRITE_OPTS, direction: spawn.facing ?? 'down', combatFx: true }
      : { ...CHARACTER_SPRITE_OPTS, direction: spawn.facing ?? 'down' });
    this.sprite.name = 'Player';
    this.position = this.sprite.position;
    this.position.set(spawn.x, tileMap.getHeight(spawn.x, spawn.z), spawn.z);
    /** World-space facing (unit XZ) — used to pick the interactable "in front". */
    this.facing = DIR_VECTORS[spawn.facing ?? 'down'].clone();
    this.speed = 0;
    this.running = false;
    /** When true, input is ignored (dialogs, fades, title). */
    this.frozen = false;
    this.radius = RADIUS;
    /** Combat action name while the combat core owns the sprite (null: locomotion). */
    this.action = null;
    /** {x, z} unit: the sprite faces it while walking / standing (lock-on strafe). */
    this.faceOverride = null;
    /** {x, z} world-space move vector replacing the input's (automation). */
    this.moveOverride = null;
    /** Walk / run speed multiplier (1 on peaceful levels). */
    this.speedMul = 1;
    this._move = { x: 0, z: 0 };
    this._dir = new THREE.Vector3();
    this._stepToggle = false;
    this._dustTimer = 0;
    this._basisDir = new THREE.Vector3();

    this.sprite.onFrameChange = (frame, anim) => {
      if (!anim) return;
      const running = anim.startsWith('run');
      if (!running && !anim.startsWith('walk')) return;
      if (frame !== 0 && frame !== 2) return; // contact frames
      this._stepToggle = !this._stepToggle;
      const ground = this._groundKind();
      const pitch = ground === 'wood' ? 1.25 : ground === 'stone' ? 1.1 : ground === 'sand' ? 0.85 : 1;
      this.audio?.playSfx('step', { volume: running ? 0.55 : 0.4, pitch: pitch * (this._stepToggle ? 1 : 0.94) });
      if (running) this.particles.burst('footstep', this.position, 4);
    };
    this.sprite.play('idle');

    // X-ray silhouette: a flat, pale copy of the sprite quad that only draws where the player is
    // hidden behind something (depthFunc GREATER), so houses and canopies never lose the player.
    // The texel colour is dropped (dark clothing would vanish against dark occluders) and the
    // cut-out uses the texel alpha only — three's alphaTest compares `opacity × alpha`, which would
    // discard every fragment whenever opacity < alphaTest.
    // It writes its own (player-side) depth: the depth-of-field reads the scene depth, and with the
    // occluder's depth left in place the figure was blurred along with the roof / canopy in front
    // of it into a shapeless pale blob. Drawn last (renderOrder 60, after water, god rays and
    // particles), so the written depth only feeds the DOF.
    this.silhouetteMaterial = new THREE.MeshBasicMaterial({
      map: this.sprite.texture,
      color: new THREE.Color('#d9ccff'),
      transparent: true,
      opacity: 0.55,
      depthWrite: true,
      depthFunc: THREE.GreaterDepth,
      fog: false,
    });
    // Pull every vertex 1.3 u toward the camera along its own view ray: the screen footprint is
    // unchanged, but only occluders clearly in front (walls, roofs, canopies — not the grass
    // tufts at the feet) reveal the silhouette.
    this.silhouetteMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n\tmvPosition.xyz *= max( 0.0, 1.0 - 1.3 / length( mvPosition.xyz ) );\n\tgl_Position = projectionMatrix * mvPosition;',
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        // pale tint, shaded a little by the texel's luminance so hair / face / clothes still read
        '#include <map_fragment>\n\tif ( sampledDiffuseColor.a < 0.5 ) discard;\n\tfloat silL = sqrt( dot( sampledDiffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) ) );\n\tdiffuseColor = vec4( diffuse * ( 0.42 + 0.8 * silL ), opacity );',
      );
    };
    this._silhouetteBase = this.silhouetteMaterial.color.clone();
    this.silhouetteMaterial.customProgramCacheKey = () => 'emberfall-player-silhouette-v2';
    this.silhouette = new THREE.Mesh(this.sprite.mesh.geometry, this.silhouetteMaterial);
    this.silhouette.name = 'Player.silhouette';
    this.silhouette.renderOrder = 60;
    this.silhouette.castShadow = false;
    this.silhouette.receiveShadow = false;
    this.sprite.mesh.add(this.silhouette);
  }

  /**
   * Brightness of the x-ray silhouette (1 = day). The game dims it after dark, where a pale
   * figure would glow brighter than the lanterns.
   * @param {number} k
   */
  setSilhouetteLevel(k) {
    this.silhouetteMaterial.color.copy(this._silhouetteBase).multiplyScalar(k);
  }

  /**
   * Show / hide the x-ray silhouette (hidden on the title screen). Only render states change,
   * never the program: it stays compiled (and warmed) either way.
   * @param {boolean} on
   */
  setSilhouetteEnabled(on) {
    this.silhouetteMaterial.colorWrite = !!on;
    this.silhouetteMaterial.depthWrite = !!on;
  }

  /** Surface under the player, for footstep colour. */
  _groundKind() {
    const tm = this.tileMap;
    const p = this.position;
    for (const r of tm.walkSurfaces) if (p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ) return 'wood';
    const t = tm.tileAt(Math.floor(p.x), Math.floor(p.z));
    if (!t) return 'grass';
    const top = t.type.top;
    if (top === 'cobblestone' || top === 'stone_tiles' || top === 'moss_stone') return 'stone';
    if (top === 'sand') return 'sand';
    return 'grass';
  }

  /** Face a world point (used when talking). */
  faceTowards(x, z) {
    const dx = x - this.position.x;
    const dz = z - this.position.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return;
    this.facing.set(dx / len, 0, dz / len);
    this.sprite.faceVector(dx, dz);
  }

  /** Instantly move to (x, z) (terrain height). */
  teleport(x, z) {
    this.position.set(x, this.tileMap.getHeight(x, z), z);
    this.speed = 0;
  }

  /**
   * Move by (dx, dz) through the terrain and colliders (`tileMap.move`, radius 0.3, max step
   * 0.55) — lunges, rolls, knockback and separation on combat levels.
   * @returns {number} the fraction of the requested distance achieved (0..1)
   */
  moveBy(dx, dz) {
    const len = Math.hypot(dx, dz);
    if (len < 1e-9) return 1;
    const p = this.position;
    const out = this.tileMap.move(p, dx, dz, RADIUS, 0.55, this._move);
    const moved = Math.hypot(out.x - p.x, out.z - p.z);
    p.x = out.x;
    p.z = out.z;
    return Math.min(1, moved / len);
  }

  /** @param {number} dt @param {Input} input */
  update(dt, input) {
    const tm = this.tileMap;
    const p = this.position;
    // a combat action owns the sprite: only follow the ground (no play / face / speed writes)
    if (this.action !== null) {
      this._followGround(dt);
      return;
    }
    let mx = 0;
    let my = 0;
    let run = false;
    let world = false;
    if (!this.frozen && input) {
      const mo = this.moveOverride;
      if (mo) {
        mx = mo.x;
        my = mo.z;
        world = true;
      } else {
        const mv = input.getMoveVector();
        mx = mv.x;
        my = mv.y;
      }
      run = input.action('run');
    }
    const mag = Math.min(1, Math.hypot(mx, my));
    const face = this.faceOverride;
    if (mag > 0.05) {
      const d = this._dir;
      if (world) d.set(mx, 0, my);
      else {
        // screen-space stick → world XZ via the camera's move basis
        const { forward, right } = this.rig.getMoveBasis();
        d.set(0, 0, 0).addScaledVector(right, mx).addScaledVector(forward, my);
      }
      d.y = 0;
      d.normalize();
      // a lock-on strafe (faceOverride) always walks: it plays the walk cycle (§6.9), and running
      // speed under a walk cycle slid the feet
      if (face) run = false;
      this.running = run;
      const speed = (run ? RUN_SPEED : WALK_SPEED) * mag * this.speedMul;
      const out = tm.move(p, d.x * speed * dt, d.z * speed * dt, RADIUS, 0.55, this._move);
      const moved = Math.hypot(out.x - p.x, out.z - p.z);
      p.x = out.x;
      p.z = out.z;
      this.speed = dt > 0 ? moved / dt : 0;
      if (face) {
        // lock-on: strafe facing the target, with the walk cycle
        this.facing.set(face.x, 0, face.z);
        this.sprite.faceVector(face.x, face.z);
      } else {
        this.facing.copy(d);
        this.sprite.faceVector(d.x, d.z);
      }
      // pushing against a wall: keep walking in place slowly rather than freezing mid-stride
      const anim = run ? 'run' : 'walk';
      this.sprite.play(anim);
      this.sprite.speed = clamp(0.55 + 0.45 * (this.speed / Math.max(0.01, speed)), 0.55, 1) * Math.max(0.6, mag);
    } else {
      this.speed = 0;
      this.running = false;
      this.sprite.play('idle');
      this.sprite.speed = IDLE_SPEED[0] + 0.04;
      if (face) this.facing.set(face.x, 0, face.z);
      // keep the screen-space facing in sync with the world facing when the camera orbits (Q/E),
      // so the character visibly faces what the interaction prompt refers to
      this.sprite.faceVector(this.facing.x, this.facing.z);
    }
    this._followGround(dt);
  }

  /** Smooth height following (stairs ramps, 0.5 ledges, bridge arches). */
  _followGround(dt) {
    const p = this.position;
    const gy = this.tileMap.getHeight(p.x, p.z);
    const k = gy > p.y ? damp(22, dt) : damp(16, dt);
    p.y += (gy - p.y) * k;
    if (Math.abs(gy - p.y) < 1e-3) p.y = gy;
  }

  dispose() {
    this.silhouetteMaterial.dispose();
    this.sprite.dispose();
    this.sheet.dispose?.();
  }
}
