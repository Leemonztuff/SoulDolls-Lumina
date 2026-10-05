// Type-check only (tsconfig.json, `npm run typecheck`); nothing here reaches a bundle.
// Module augmentation for src/demo: fields created lazily (`this._x ??= …`) or by another module
// (e.g. `npc.talk = …` in Game.js), which the class body cannot declare without a runtime change.

import type * as THREE from 'three';
import type { Collider } from '../engine/world/TileMap.js';
import type { Conversation } from './dialogue.js';
import './Critters.js';
import './Game.js';
import './Npc.js';
import './World.js';

declare module './Npc.js' {
  interface Npc {
    /**
     * The villager's conversation, set by `Game.init` right after construction
     * (`conversationFor(obj)`, dialogue.js).
     */
    talk?: Conversation;
    /** 'chase' villagers: reused list of the chickens near their patch (lazy). */
    _near?: { position: THREE.Vector3 }[];
  }
}

declare module './Critters.js' {
  interface Critters {
    /** Far-critter throttle: seconds accumulated per critter since its last update (lazy). */
    _acc?: Float32Array;
  }
}

declare module './Game.js' {
  interface Game {
    /** The view World.update ranks the light pool with: the camera focus and camera (lazy). */
    _worldView?: { focus: THREE.Vector3; camera: THREE.Camera };
  }
}

declare module './World.js' {
  interface World {
    /** Materials already registered as emissive (each once; lazy). */
    _emissiveSet?: Set<THREE.Material>;
    /** Reused collider query list of `_isFreeForFoliage` (lazy). */
    _freeTmp?: Collider[];
  }
}
