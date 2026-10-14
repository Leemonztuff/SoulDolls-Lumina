/**
 * UI strings, namespace 'creature' (docs/specs/I18N.md §2, docs/specs/PIXEL_UI.md §8): the species
 * names, the move names and the type words by id (from `defs.js`, the one English source), the
 * roster panel's chrome and the battle's capture lines. Registered by the feature when it starts
 * (`registerCreatureStrings`), never at import, so a peaceful level — one without creatures — never
 * holds the table (plan §5, §15).
 *
 * Import-free and Node-safe (the i18n checker imports it): it imports only the import-free
 * `I18n.js` and the pure data of `defs.js`. Keys are ids: `creature.species.<id>`,
 * `creature.move.<id>`, `creature.type.<id>`, `creature.roster.*`, `creature.ui.*`.
 *
 * English identities stay in `defs.js`; the Japanese and Chinese follow the glossary
 * (docs/specs/I18N_GLOSSARY.md §3.2, §3.13: くさ / ほのお / みず, 草 / 火 / 水).
 */
import { registerStrings, hasStrings, t } from '../../engine/i18n/I18n.js';
import { CREATURE_DEFS, MOVE_DEFS, MOVE_TYPE_IDS } from './defs.js';

/** The English type words by move type (the three species types plus 'neutral'). */
const TYPE_EN = { grass: 'Grass', fire: 'Fire', water: 'Water', neutral: 'Neutral' };

/** The English keys derived from the data (one source: `defs.js`). @returns {Record<string, string>} */
function dataEnglish() {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [id, d] of Object.entries(CREATURE_DEFS)) out[`species.${id}`] = d.name;
  for (const [id, m] of Object.entries(MOVE_DEFS)) out[`move.${id}`] = m.name;
  for (const id of MOVE_TYPE_IDS) out[`type.${id}`] = TYPE_EN[id];
  return out;
}

/**
 * `species.<id>` for one language, in `creature.species` key order (`CREATURE_DEFS` order).
 * @param {Record<string, string>} names
 * @param {boolean} includeTypes
 * @param {Record<string, string>} typeNames
 * @returns {Record<string, string>}
 */
function namesFor(names, includeTypes, typeNames) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [id, v] of Object.entries(names)) out[`species.${id}`] = v;
  if (includeTypes) for (const [id, v] of Object.entries(typeNames)) out[`type.${id}`] = v;
  return out;
}

/** @type {Record<string, string>} */
const SPECIES_JA = {
  leafling: 'リーフリング', emberling: 'エンバーリング', rippling: 'リップリング',
  mossling: 'モスリング', sparrowling: 'スパロウリング', stoneling: 'ストーンリング',
  voltling: 'ボルトリング', slitherling: 'スリザーリング', buzzling: 'バズリング',
  shadeling: 'シェードリング', frostling: 'フロストリング', aurorling: 'オーロラリング',
};
/** @type {Record<string, string>} */
const SPECIES_ZH = {
  leafling: '叶灵', emberling: '烬灵', rippling: '涟漪灵',
  mossling: '苔藓灵', sparrowling: '雀灵', stoneling: '石灵',
  voltling: '电灵', slitherling: '蛇灵', buzzling: '嗡灵',
  shadeling: '影灵', frostling: '霜灵', aurorling: '极光灵',
};
/** @type {Record<string, string>} */
const MOVE_JA = {
  nudge: 'つつく', peck: 'ついばむ', spark: 'スパーク', leafcut: 'リーフカッター',
  emberpuff: 'エンバーパフ', splashjet: 'スプラッシュジェット', gust: 'かぜおこし', cinderroll: 'シンダーロール',
};
/** @type {Record<string, string>} */
const MOVE_ZH = {
  nudge: '轻推', peck: '啄击', spark: '电火花', leafcut: '叶刃',
  emberpuff: '余烬喷吐', splashjet: '水花喷射', gust: '起风', cinderroll: '烬石翻滚',
};
/** @type {Record<string, string>} */
const TYPE_JA = { grass: 'くさ', fire: 'ほのお', water: 'みず', neutral: 'ノーマル' };
/** @type {Record<string, string>} */
const TYPE_ZH = { grass: '草', fire: '火', water: '水', neutral: '一般' };

/** @type {import('../../engine/i18n/I18n.js').StringTable} */
const table = {
  en: {
    ...dataEnglish(),
    // the roster panel (§12)
    'roster.title': 'Roster',
    'roster.active': 'Party',
    'roster.box': 'Box',
    'roster.empty': 'Empty',
    'roster.emptyBox': 'Empty',
    'roster.swap': 'Swap',
    'roster.release': 'Release',
    'roster.releaseConfirm': 'Release {name}? This cannot be undone.',
    'roster.releaseTitle': 'Release creature?',
    'roster.swapTitle': 'Swap with Active',
    'roster.swapTo': 'Slot {s} — {name}',
    'roster.swapHint': 'Confirm / Cancel',
    'roster.emptySlot': 'Empty',
    'roster.cancel': 'Cancel',
    'roster.help': 'Choose a creature, then swap it with a party slot or release it.',
    'roster.level': 'Lv {n}',
    'roster.hp': 'HP {hp}/{max}',
    // the battle's capture action and toasts (§8)
    'ui.capture': 'Capture',
    'ui.noOrb': 'No orb',
    'ui.caught': '{name} was caught!',
    'ui.got': 'You got {name}!',
    'ui.fled': '{name} fled.',
    'ui.boxFull': 'The box is full.',
    'ui.noParty': 'You have no companion to fight with.',
    // the battle screen (phase 4b): the action menu, the field notes and the log
    'battle.fight': 'Fight',
    'battle.bag': 'Orbs',
    'battle.party': 'Party',
    'battle.run': 'Run',
    'battle.power': 'Power',
    'battle.type': 'Type',
    'battle.hintAction': 'Choose an action.',
    'battle.hintMove': 'Choose a move.',
    'battle.hintSwitch': 'Choose a creature.',
    'battle.used': '{name} used {move}!',
    'battle.miss': '{name}’s attack missed!',
    'battle.super': 'It’s super effective!',
    'battle.weak': 'It’s not very effective…',
    'battle.crit': 'A critical hit!',
    'battle.fainted': '{name} fainted!',
    'battle.go': 'Go, {name}!',
    'battle.foeIn': 'The wild {name} appeared!',
    'battle.throw': '{name} threw an orb!',
    'battle.brokeFree': '{name} broke free!',
    'battle.gotAway': 'Got away safely!',
    'battle.cantEscape': 'Couldn’t get away!',
    'battle.foeFled': 'The wild {name} fled!',
    'battle.xp': '{name} gained {n} EXP.',
    'battle.levelUp': '{name} grew to Lv {n}!',
    'battle.learned': '{name} learned {move}!',
  },
  ja: {
    ...namesFor(SPECIES_JA, true, TYPE_JA),
    ...MOVE_JA,
    'roster.title': 'ポケモンリスト',
    'roster.active': '手持ち',
    'roster.box': 'ボックス',
    'roster.empty': '空',
    'roster.emptyBox': '空',
    'roster.swap': '入れ替え',
    'roster.release': '逃がす',
    'roster.releaseConfirm': '{name}を逃がしますか？　この操作は取り消せません。',
    'roster.releaseTitle': '逃がしますか？',
    'roster.swapTitle': '手持ちと入れ替え',
    'roster.swapTo': 'スロット {s} — {name}',
    'roster.swapHint': '決定 / キャンセル',
    'roster.emptySlot': '空',
    'roster.cancel': 'キャンセル',
    'roster.help': 'ポケモンを選び、手持ちと入れ替えるか逃がします。',
    'roster.level': 'Lv {n}',
    'roster.hp': 'HP {hp}/{max}',
    'ui.capture': '捕まえる',
    'ui.noOrb': 'オーブがない',
    'ui.caught': '{name}を捕まえた！',
    'ui.got': '{name}を手に入れた！',
    'ui.fled': '{name}は逃げた。',
    'ui.boxFull': 'ボックスがいっぱいです。',
    'ui.noParty': '戦える仲間がいない。',
    'battle.fight': 'たたかう',
    'battle.bag': 'オーブ',
    'battle.party': 'ポケモン',
    'battle.run': 'にげる',
    'battle.power': '威力',
    'battle.type': 'タイプ',
    'battle.hintAction': 'こうどうをえらぶ',
    'battle.hintMove': 'わざをえらぶ',
    'battle.hintSwitch': 'ポケモンをえらぶ',
    'battle.used': '{name}の {move}！',
    'battle.miss': '{name}のこうげきははずれた！',
    'battle.super': 'こうかばつぐん！',
    'battle.weak': 'こうかいまひとつ…',
    'battle.crit': 'きゅうしょにあたった！',
    'battle.fainted': '{name}はたおれた！',
    'battle.go': 'ゆけっ、{name}！',
    'battle.foeIn': 'あらわれた！{name}！',
    'battle.throw': '{name}はオーブを投げた！',
    'battle.brokeFree': '{name}はにげだした！',
    'battle.gotAway': 'うまくにげきれた！',
    'battle.cantEscape': 'にげられなかった！',
  },
  zh: {
    ...namesFor(SPECIES_ZH, true, TYPE_ZH),
    ...MOVE_ZH,
    'roster.title': '宝可梦列表',
    'roster.active': '队伍',
    'roster.box': '储存箱',
    'roster.empty': '空',
    'roster.emptyBox': '空',
    'roster.swap': '交换',
    'roster.release': '放生',
    'roster.releaseConfirm': '要放生{name}吗？此操作无法撤销。',
    'roster.releaseTitle': '要放生吗？',
    'roster.swapTitle': '与队伍交换',
    'roster.swapTo': '槽位 {s} — {name}',
    'roster.swapHint': '确认 / 取消',
    'roster.emptySlot': '空',
    'roster.cancel': '取消',
    'roster.help': '选择一只宝可梦，将其与队伍交换或放生。',
    'roster.level': 'Lv {n}',
    'roster.hp': 'HP {hp}/{max}',
    'ui.capture': '捕捉',
    'ui.noOrb': '没有宝珠',
    'ui.caught': '捕捉到了{name}！',
    'ui.got': '得到了{name}！',
    'ui.fled': '{name}逃走了。',
    'ui.boxFull': '储存箱已满。',
    'ui.noParty': '没有能战斗的伙伴。',
    'battle.fight': '战斗',
    'battle.bag': '宝珠',
    'battle.party': '宝可梦',
    'battle.run': '逃跑',
    'battle.power': '威力',
    'battle.type': '属性',
    'battle.hintAction': '选择行动',
    'battle.hintMove': '选择技能',
    'battle.hintSwitch': '选择宝可梦',
    'battle.used': '{name}使用了{move}！',
    'battle.miss': '{name}的攻击没有命中！',
    'battle.super': '效果绝佳！',
    'battle.weak': '效果不理想…',
    'battle.crit': '击中要害！',
    'battle.fainted': '{name}倒下了！',
    'battle.go': '上吧，{name}！',
    'battle.foeIn': '野生的{name}出现了！',
    'battle.throw': '{name}扔出了一颗宝珠！',
    'battle.brokeFree': '{name}挣脱了！',
    'battle.gotAway': '成功逃脱了！',
    'battle.cantEscape': '逃跑失败！',
  },
};
export default table;

/**
 * Register the 'creature' namespace (idempotent: a namespace already there is left as it is). The
 * `CreatureSystem` calls it when creatures are enabled, so a level without creatures never loads
 * the table.
 * @param {{ force?: boolean }} [o] force: register it again (tests)
 */
export function registerCreatureStrings({ force = false } = {}) {
  if (force || !hasStrings('creature')) registerStrings('creature', table);
}

/**
 * `t('creature.<key>')`, else `fallback` when the key has no entry in any language (a species or
 * move a save brings that the tables do not know).
 * @param {string} key without the 'creature.' prefix
 * @param {string} fallback
 * @param {Record<string, any>} [vars]
 */
export function ct(key, fallback, vars) {
  const full = `creature.${key}`;
  const s = t(full, vars);
  return s === full ? fallback : s;
}
