/**
 * The creature roster ("Critters Collection" plan §5, §10, §12): the battle party (`active`, up to
 * `MAX_ACTIVE`) and the storage box (`box`, up to `MAX_BOX`), and the one place the layer is
 * saved. The canonical blob lives in this browser at `localStorage['luminati.creatures']` (a
 * play-test / `&level=` start uses `….creatures.test`), mirrored into the running
 * `CampaignState.creatures` so it travels with the campaign save: on read the campaign's mirror
 * wins when it holds a roster, else the standalone key; on write both are updated; on clear both
 * are forgotten. A blob of a newer `SAVE_VERSION` is read but never written over.
 *
 * A loaded blob is untrusted: `fromJSON` validates every row through `Creature.fromJSON` (own.js
 * through `creatureDef` / `moveDef`), drops what cannot be read and the duplicate uids, and caps
 * each list. The mutable `CampaignState` is only ever given the plain blob (never this class), so
 * `CampaignState.js` keeps no creature import.
 *
 * @import { CreatureRosterData } from './types.js'
 * @import { CampaignState } from '../campaign/CampaignState.js'
 */
import { Creature, mintUid } from './Creature.js';

/** The schema version of the saved roster. */
export const SAVE_VERSION = 1;
/** The battle party size. */
export const MAX_ACTIVE = 6;
/** The storage box size. */
export const MAX_BOX = 240;
/** The longest instance id kept on load (an untrusted `uid`). */
const UID_MAX = 64;
const KEY = 'luminati.creatures';

/** @returns {v is Record<string, any>} */
const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

export class CreatureRoster {
  /**
   * An empty roster, its storage tied to `state` (the mirror) and to the play-test keys when
   * `test`. Call `load()` to bring in what is saved.
   * @param {{ state?: CampaignState|null, test?: boolean }} [opts]
   */
  constructor({ state = null, test = false } = {}) {
    /** The running campaign save its mirror travels with (or null: the standalone key alone). */
    this.state = state;
    /** Saved under the play-test key (`….test`), never over the real roster. */
    this.test = test;
    /** @type {Creature[]} the battle party */
    this.active = [];
    /** @type {Creature[]} the storage box */
    this.box = [];
    /** The version read (`load`): a newer one is never written over. */
    this.readVersion = SAVE_VERSION;
  }

  /** The browser-storage key of the roster (the play-test one with `test`). */
  static key({ test = false } = {}) {
    return test ? `${KEY}.test` : KEY;
  }

  /** The play-test / isolated key, which never touches the real roster. */
  static testKey() {
    return `${KEY}.test`;
  }

  /**
   * Is `data` a roster this engine reads — an object with an integer version of `SAVE_VERSION` or
   * newer? (An older one, or none, is not: a fresh roster begins and saves over it.)
   * @param {any} data
   * @returns {data is CreatureRosterData}
   */
  static readable(data) {
    return isPlain(data) && Number.isInteger(data.version) && data.version >= SAVE_VERSION;
  }

  /**
   * The saved roster of the campaign `state` (its mirror) else of this browser, or null (none, one
   * this engine does not read, or storage unavailable). The mirror wins when it holds a readable
   * roster; the standalone key is the fallback.
   * @param {CampaignState|null} [state]
   * @param {{ test?: boolean }} [opts]
   * @returns {CreatureRosterData|null}
   */
  static read(state = null, { test = false } = {}) {
    const mirror = state ? state.creatures : null;
    if (CreatureRoster.readable(mirror)) return mirror;
    let raw = null;
    try {
      raw = localStorage.getItem(CreatureRoster.key({ test }));
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      return CreatureRoster.readable(data) ? data : null;
    } catch {
      console.warn(`[Luminati] the saved creatures "${CreatureRoster.key({ test })}" could not be read`);
      return null;
    }
  }

  /**
   * Write `data` to the standalone key and mirror it into `state` (when given). A play-test roster
   * is mirrored into its state as well; the real key is untouched with `test`.
   * @param {CreatureRosterData} data
   * @param {CampaignState|null} [state]
   * @param {{ test?: boolean }} [opts]
   * @returns {boolean} false when storage refused it
   */
  static write(data, state = null, { test = false } = {}) {
    if (state) state.creatures = data;
    try {
      localStorage.setItem(CreatureRoster.key({ test }), JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Forget the roster (the standalone key and the `state` mirror).
   * @param {CampaignState|null} [state]
   * @param {{ test?: boolean }} [opts]
   */
  static clear(state = null, { test = false } = {}) {
    if (state) state.creatures = null;
    try {
      localStorage.removeItem(CreatureRoster.key({ test }));
    } catch { /* storage unavailable */ }
  }

  /**
   * The valid rows of a readable blob: every row through `Creature.fromJSON`, duplicate uids
   * dropped, each list capped.
   * @param {unknown} data
   * @returns {{ active: Creature[], box: Creature[] }}
   */
  static fromJSON(data) {
    const d = isPlain(data) ? data : {};
    /** @type {Set<string>} */
    const seen = new Set();
    /** @param {unknown} list @param {number} max @returns {Creature[]} */
    const read = (list, max) => {
      /** @type {Creature[]} */
      const out = [];
      if (!Array.isArray(list)) return out;
      for (const raw of list) {
        if (out.length >= max) break;
        const c = Creature.fromJSON(raw);
        if (!c || seen.has(c.uid)) continue;
        seen.add(c.uid);
        out.push(c);
      }
      return out;
    };
    return { active: read(d.active, MAX_ACTIVE), box: read(d.box, MAX_BOX) };
  }

  /** The party plus the box (the order is `toJSON`'s). @returns {Creature[]} */
  get all() {
    return [...this.active, ...this.box];
  }

  /** How many creatures the roster holds. */
  get count() {
    return this.active.length + this.box.length;
  }

  /** Is the box full (a caught creature then cannot be added)? */
  get boxFull() {
    return this.box.length >= MAX_BOX;
  }

  /**
   * Point the roster at another campaign save (a new journey replaces `state`).
   * @param {CampaignState|null} state
   */
  setState(state) {
    this.state = state;
  }

  /**
   * The creature of `uid`, in the party or the box, or null.
   * @param {unknown} uid
   * @returns {Creature|null}
   */
  find(uid) {
    if (typeof uid !== 'string' || !uid) return null;
    return this.active.find((c) => c.uid === uid) ?? this.box.find((c) => c.uid === uid) ?? null;
  }

  /**
   * Add a caught creature: to the party while it has room, else to the box (null when the box is
   * full too). A uid that already stands is re-minted so a save never holds two alike.
   * @param {Creature} creature
   * @returns {Creature|null}
   */
  add(creature) {
    if (!(creature instanceof Creature)) return null;
    if (this.active.includes(creature) || this.box.includes(creature)) return creature;
    if (!creature.uid || creature.uid.length > UID_MAX || this.find(creature.uid)) creature.uid = this._newUid();
    if (this.active.length < MAX_ACTIVE) {
      this.active.push(creature);
      return creature;
    }
    if (this.box.length >= MAX_BOX) return null;
    this.box.push(creature);
    return creature;
  }

  /**
   * Forget the creature of `uid` (from the party or the box).
   * @param {unknown} uid
   * @returns {boolean} false when no such creature
   */
  release(uid) {
    const a = this.active.findIndex((c) => c.uid === uid);
    if (a >= 0) {
      this.active.splice(a, 1);
      return true;
    }
    const b = this.box.findIndex((c) => c.uid === uid);
    if (b >= 0) {
      this.box.splice(b, 1);
      return true;
    }
    return false;
  }

  /**
   * Move a party creature to the box (false when it is not in the party or the box is full).
   * @param {unknown} uid
   * @returns {boolean}
   */
  toBox(uid) {
    const i = this.active.findIndex((c) => c.uid === uid);
    if (i < 0 || this.box.length >= MAX_BOX) return false;
    this.box.push(this.active.splice(i, 1)[0]);
    return true;
  }

  /**
   * Bring a boxed creature into the party: at `slot`, else the end. When the party is full, a
   * `slot` in range swaps the two (the displaced one goes to the box); otherwise false.
   * @param {unknown} uid
   * @param {number} [slot]
   * @returns {boolean}
   */
  toActive(uid, slot = -1) {
    const i = this.box.findIndex((c) => c.uid === uid);
    if (i < 0) return false;
    if (this.active.length < MAX_ACTIVE) {
      const c = this.box.splice(i, 1)[0];
      if (slot < 0 || slot >= this.active.length) this.active.push(c);
      else this.active.splice(slot, 0, c);
      return true;
    }
    if (slot < 0 || slot >= this.active.length) return false;
    const held = this.active[slot];
    this.active[slot] = this.box[i];
    this.box[i] = held;
    return true;
  }

  /** Heal the whole roster back to full. @returns {number} the HP restored in all */
  healAll() {
    let healed = 0;
    for (const c of this.all) healed += c.heal(c.maxHp);
    return healed;
  }

  /** The saved blob (contract `CreatureRosterData`). @returns {CreatureRosterData} */
  toJSON() {
    return {
      version: SAVE_VERSION,
      active: this.active.map((c) => c.toJSON()),
      box: this.box.map((c) => c.toJSON()),
    };
  }

  /** Bring in the saved roster (this campaign's mirror, else the standalone key). @returns {boolean} */
  load() {
    const data = CreatureRoster.read(this.state, { test: this.test });
    if (!data) return false;
    this.readVersion = data.version;
    const parsed = CreatureRoster.fromJSON(data);
    this.active = parsed.active;
    this.box = parsed.box;
    return true;
  }

  /**
   * Save the roster (the standalone key and the `state` mirror). A roster read from a newer version
   * is never written over.
   * @returns {boolean}
   */
  save() {
    if (this.readVersion > SAVE_VERSION) return false;
    return CreatureRoster.write(this.toJSON(), this.state, { test: this.test });
  }

  /** Empty the roster and forget it on disk (and in `state`). */
  clear() {
    this.active = [];
    this.box = [];
    CreatureRoster.clear(this.state, { test: this.test });
  }

  /** A fresh id no one in the roster wears. @returns {string} */
  _newUid() {
    /** @type {string} */
    let uid;
    do {
      uid = mintUid();
    } while (uid.length > UID_MAX || this.find(uid));
    return uid;
  }
}
