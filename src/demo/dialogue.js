/**
 * Conversations.
 *
 * Who stands where, what they look like and what the signs say is level data
 * (`public/levels/*.json`, see docs/contracts/LEVEL_EDITOR.md). This module holds the behaviour:
 *  - `CONVERSATIONS`: Emberfall's hand-written conversations, referenced by a level NPC's
 *    `script` id (ObjectCatalog.NPC_SCRIPTS), plus the combat `drillmaster` and `shopkeeper`
 *    (Cinderwatch Pass);
 *  - `levelConversation(obj)`: the conversation of any other NPC, built from its plain `dialogue`
 *    pages plus a built-in `action` (rest / shop / music);
 *  - `conversationFor(obj)`: picks one of the two.
 *
 * A conversation is `async (ctx, obj) => void` (obj: the level NPC object). ctx:
 *   say(lines, opts?)  → Promise<choiceIndex|undefined>  (opens the DialogBox as this NPC)
 *   toast(text), sfx(name), visits (times talked to before), game (the Game instance), npc
 * Markup: `{word}` is shown in gold.
 */

import { ownValue } from '../engine/utils/own.js';

/**
 * @import { DialogLine } from '../engine/ui/DialogBox.js'
 * @import { Game } from './Game.js'
 * @import { Npc } from './Npc.js'
 * @import { LevelObjectOf, DialoguePage } from '../engine/level/types.js'
 */

/**
 * What a conversation gets (built by `Game._interact`).
 * @typedef {object} ConversationContext
 * @property {(lines: string | (string | DialogLine)[],
 *   opts?: { speaker?: string }) => Promise<number|undefined>} say
 *   opens the DialogBox as this NPC → the chosen choice index (undefined: no choice)
 * @property {(text: string) => void} toast   a HUD toast
 * @property {(name: string) => void} sfx     an AudioSystem sound effect
 * @property {number} visits                  times talked to before
 * @property {Game} game
 * @property {Npc} npc
 */

/**
 * A level NPC's conversation (`conversationFor`): resolves when it is over.
 * @typedef {(ctx: ConversationContext) => Promise<void>} Conversation
 */

/**
 * Emberfall's hand-written conversations, by script id.
 * @type {Record<string, (ctx: ConversationContext,
 *   obj: LevelObjectOf<'npc'>) => Promise<void>>}
 */
export const CONVERSATIONS = {
  async elder({ say, visits }) {
    if (visits === 0) {
      await say([
        'Ah, a traveler. Welcome to {Emberfall}, child. Mind the cobbles — they are older than I am, and twice as stubborn.',
        'Our founders followed this river up from the lowlands four hundred years ago. At dusk the falls catch the last of the sun and glow like embers in a hearth.',
        'Hence the name. We are not an imaginative people, but we are an honest one.',
        'If your feet are weary, the {Ember & Oak} has a bed and a bowl of stew. Rosalind keeps the hearth warm and the gossip warmer.',
      ]);
    } else if (visits % 2 === 1) {
      await say([
        'Thirsty? The well is free to all. Its water comes down from {Windmill Hill}, and in all my years it has never once run dry.',
        'Climb the stair by the inn some evening. The whole valley turns to gold up there.',
      ]);
    } else {
      await say([
        'Still here? Good. A village is only as warm as the company that lingers in it.',
      ]);
    }
  },

  async innkeeper({ say, game }) {
    const choice = await say([
      'Welcome to the {Ember & Oak}! Warm beds, hot stew, and only a modest amount of snoring from the loft.',
      // the non-committal answer comes first, so mashing through the text never skips the day
      { text: 'Will you rest until morning?', choices: ['Not yet', 'Rest until morning'] },
    ]);
    if (choice === 1) {
      await game.restUntilMorning();
      await say(['Good morning, sleepyhead! Breakfast is on the table, and the rooster has been shouting about it for an hour.']);
    } else {
      await say(['Take your time, dear. The fire will keep.']);
    }
  },

  async merchant({ say, toast, sfx, game }) {
    const choice = await say([
      'Step right up! The finest produce this side of the river — and the only produce this side of the river, but let us not dwell on that.',
      { text: 'An apple, fresh from the valley orchards? For a new face in {Emberfall}, it is on the house.', choices: ['Just looking', 'Take an apple'] },
    ]);
    if (choice === 1) {
      game.inventory.apples = (game.inventory.apples ?? 0) + 1;
      sfx('chime');
      toast(`Obtained: Crisp Apple${game.inventory.apples > 1 ? ` ×${game.inventory.apples}` : ''}`);
      await say(['A fine choice! Crisp as a winter morning and twice as sweet. Come back tomorrow — I will have pears. Probably.']);
    } else {
      await say(['Looking is free! ...For now.']);
    }
  },

  async guard({ say, visits }) {
    if (visits === 0) {
      await say([
        'Halt! State your— ah. Forgive me, traveler. Force of habit.',
        'Nothing has crossed this bridge in years but ducks and gossip, and I have yet to arrest either.',
        'The grove beyond turns to amber this time of year. Keep to the path after dark — the river is gentle, but she is deeper than she looks.',
      ]);
    } else {
      await say(['All quiet on the bridge. Just the way I like it. ...Mostly.']);
    }
  },

  async farmer({ say }) {
    await say([
      'Hm? Oh, don\'t mind me. Just asking the turnips how they are getting on.',
      'Soil\'s been kind this year. Rain came when we asked for it and kept away when we didn\'t. Can\'t ask fairer than that.',
      'If you see my granddaughter, tell her the chickens have filed a formal complaint.',
    ]);
  },

  async child({ say, visits }) {
    if (visits % 2 === 0) {
      await say([
        'Shh! I\'m sneaking up on {Duchess}. She\'s the plump one. She\'s also the fastest, which is not fair at all.',
        'Grandpa says if I catch her, I get to name the next batch of eggs!',
      ]);
    } else {
      await say(['...Hey, you\'re tall. Could you be a fence? You just have to stand really, really still.']);
    }
  },

  // Branches on Wren's own story first (the soundtrack is usually already playing when you
  // meet him), and only silences it when the player asks.
  async bard({ say, toast, game, visits }) {
    const playing = game.audio.musicPlaying;
    if (visits === 0) {
      await say([
        'A listener! Sit, sit. The fire is warm and my lute is — mostly — in tune.',
        playing
          ? 'You have been hearing me since the square, I expect. This one is called {Emberfall Evening}. I wrote it on that very bench, the night the falls turned gold.'
          : 'This one is called {Emberfall Evening}. I wrote it on that very bench, the night the falls turned gold.',
      ]);
      if (!playing) {
        game.setMusic(true);
        toast('♪ Emberfall Evening');
      }
    } else if (playing) {
      const choice = await say([{ text: 'Another verse, or shall I rest my fingers by the fire?', choices: ['Keep playing', 'Rest a while'] }]);
      if (choice === 1) {
        await say(['No offence taken. Even a bard\'s fingers need a rest by the fire.']);
        game.setMusic(false);
        toast('The music fades…');
      } else {
        await say(['Then another verse it is! This part is my favourite — the river joins in.']);
      }
    } else {
      await say(['Quiet suits a fire, but a song suits it better. Here — from the top.']);
      game.setMusic(true);
      toast('♪ Emberfall Evening');
    }
  },

  async scholar({ say, visits }) {
    if (visits === 0) {
      await say([
        'Oh! A visitor on the hill. I am cataloguing how the light moves over this valley. Would you believe it is different every hour?',
        'Press {T} and watch the day turn — dawn, noon, golden hour, dusk and night. I have documented each one. Twice.',
        '{R} summons the weather: rain, then snow, then clear skies again. Do not ask me how. Scholarship has its limits.',
        '{P} hides everything but the view. {Q} and {E} turn the world around you, and {Z} and {X} — or the wheel — bring it closer or push it away.',
        'And should you wish to see my working notes, {~} opens them. {H} will remind you of all this, should you forget.',
      ]);
    } else {
      await say([
        'Remember: {T} for the hour, {R} for the weather, {P} for the view, {H} for help. The rest is patience.',
        'Golden hour is my favourite. The shadows grow long and everything looks like it remembers something.',
      ]);
    }
  },

  /**
   * The combat drillmaster (COMBAT.md §6.12): explains the controls (keyboard or pad keys by the
   * last device used), asks for a full 3-hit combo on a dummy and one dodge, rewards 2 draughts
   * once both are done, and speaks two post-victory pages once the boss has fallen. On a peaceful
   * level the NPC's own dialogue pages play instead.
   */
  async drillmaster(ctx, obj) {
    const { say, game, toast, sfx, visits } = ctx;
    const combat = game.combat;
    if (!combat) {
      await levelConversation(obj ?? {})(ctx);
      return;
    }
    if (combat.bossDefeated) {
      await say([
        'You felled {Cinderheart}. I watched the glow go out of the caldera from the palisade — the whole camp cheered loud enough to wake the dummies.',
        'The pass has not been this quiet since my grandmother held this post. Rest by the fire tonight, soldier. You have earned the first watch off.',
      ]);
      return;
    }
    const pad = game.engine?.input?.lastDevice === 'gamepad';
    const K = pad
      ? { move: 'the left stick', attack: 'X', dodge: 'B', skills: 'LT with X, Y or B', draught: 'Y', lock: 'a click of the right stick', confirm: 'A' }
      : { move: 'WASD', attack: 'J (or the left mouse button)', dodge: 'K (or the right mouse button)', skills: 'U, I and O (or 1–3)', draught: 'C', lock: 'L', confirm: 'Space' };
    const t = combat.tutorial;
    if (t.combo && t.dodge && !t.rewarded) {
      const given = combat.rewardTutorial();
      if (given > 0) {
        sfx('chime');
        toast(`Obtained: Healing Draught ×${given}`);
      }
      await say([
        'Now that is a sword arm! A full combo and a clean roll — the dummies will be telling stories about you.',
        given > 0
          ? 'Take these {Healing Draughts}. Drink one with {' + K.draught + '} when the world starts to spin. Bram sells more at the stall.'
          : 'I had draughts for you, but your satchel is full. Bram sells more at the stall when you need them.',
        'The glade beyond the gate is crawling with slimes. Mind the goblins — they circle before they strike.',
      ]);
      return;
    }
    if (t.rewarded) {
      await say(['Remember: strike, roll, strike again. And rest at a {waystone} before you take on anything with a crown of fire.']);
      return;
    }
    if (visits === 0) {
      await say([
        'Hold there, traveler. Nobody leaves this camp with a sword they cannot swing. I am {Captain Maren}, and the dummies are my recruits.',
        `Strike with {${K.attack}} — press it again as the blade comes back and you chain three cuts, the last one a thrust that knocks foes flat.`,
        `Roll with {${K.dodge}} while you move: for a heartbeat nothing can touch you. Roll just as a blow lands and the world slows for you.`,
        `Your skills are on {${K.skills}}, your draughts on {${K.draught}}, and {${K.lock}} fixes your eyes on one foe.`,
        'Show me a full three-cut combo on a dummy, and one good roll. Then come back to me.',
      ]);
      return;
    }
    const left = [];
    if (!t.combo) left.push(`a full three-cut combo on a dummy ({${K.attack}} three times)`);
    if (!t.dodge) left.push(`one roll ({${K.dodge}})`);
    await say([`Still waiting on ${left.join(' and ')}. The dummies are patient. I am less so.`]);
  },

  /**
   * A combat shopkeeper (the gold sink): on a combat level its dialogue pages (the first visit;
   * later visits its last page only, with "Tell me again" in the menu for the others — Odo's boss
   * hints stay reachable after a fall), then the combat shop's menu as a dialogue choice —
   * "Nothing more" first (mashing confirm never buys), then every ware not sold out with its gain
   * and price, marked when the gold does not reach (`combat.shopOffers()`, rules.js SHOP_WARES) —
   * repeated after each purchase until the player picks "Nothing more". The menu line shows the
   * gold, ATK and DEF, a bought upgrade's toast the change ("ATK 20 → 22"). Like resting, the shop
   * is shut while foes are engaged. On a peaceful level the NPC's own dialogue and action play.
   */
  async shopkeeper(ctx, obj) {
    const { say, game, toast, sfx, visits } = ctx;
    const combat = game.combat;
    if (!combat?.shopOffers) {
      await levelConversation(obj ?? {})(ctx);
      return;
    }
    if (combat.engaged) {
      sfx('cancel');
      await say(['Not with foes at your heels! Lose them first, then we can talk trade.']);
      return;
    }
    const pages = dialoguePages(obj?.dialogue).filter((d) => typeof d === 'string');
    const intro = visits === 0 ? pages : pages.slice(-1);
    const again = visits > 0 && pages.length > 1 ? 'Tell me again' : null;
    const pc = combat.pc;
    const STAT = { attack: ['ATK', () => pc.atk], def: ['DEF', () => pc.def], maxHp: ['Max HP', () => pc.hpMax], maxMp: ['Max MP', () => pc.mpMax] };
    let bought = 0;
    for (let n = 0; n < 16; n++) {
      const offers = combat.shopOffers().filter((o) => !o.sold);
      /** @type {(string | DialogLine)[]} */
      const lines = n === 0 ? [...intro] : [];
      const choices = ['Nothing more', ...offers.map((o) => `${o.name} (${o.gain}) — ${o.price} gold${o.reason === 'gold' ? ' (not enough)' : ''}`)];
      if (again) choices.push(again);
      lines.push({
        text: `${n === 0 ? 'What will it be?' : 'Anything else?'} You carry {${pc.gold} gold} · ATK ${pc.atk} · DEF ${pc.def}.`,
        choices,
      });
      const choice = await say(lines);
      if (again && choice === choices.length - 1) {
        await say(pages.slice(0, -1));
        continue;
      }
      if (typeof choice !== 'number' || choice <= 0 || !offers[choice - 1]) break;
      const o = offers[choice - 1];
      const stat = o.upgrade ? STAT[o.upgrade] : null;
      const before = stat ? stat[1]() : 0;
      const r = combat.buy(o.name);
      if (r.ok) {
        bought++;
        sfx('chime');
        toast(o.upgrade ? `Obtained: ${o.name} — ${stat ? `${stat[0]} ${before} → ${stat[1]()}` : o.gain}` : `Obtained: ${o.name}`);
      } else {
        sfx('cancel');
        toast(r.reason === 'gold' ? 'Not enough gold' : r.reason === 'full' ? 'You cannot carry more' : 'Not for sale');
      }
    }
    await say([bought > 0 ? 'A pleasure doing business. Mind the fire up there.' : 'Suit yourself. The cart is not going anywhere.']);
  },
};

/**
 * The question a built-in action asks when the NPC's own dialogue doesn't end with a choice.
 * Like the hand-written conversations, the non-committal answer comes first: choosing any later
 * option runs the action (a designer's own closing page with one choice: that choice runs it).
 */
const ACTION_PROMPTS = {
  rest: { text: 'Will you rest until morning?', choices: ['Not yet', 'Rest until morning'] },
  // (a price only on combat levels, where the combat system sells the item for gold)
  shop: (item, price = null) => ({ text: `Would you like the ${item}?${price !== null ? ` (${price} gold)` : ''}`, choices: ['Just looking', 'Yes, please'] }),
  music: { text: 'Another song, or a little quiet?', choices: ['Keep playing', 'Some quiet'] },
};

/**
 * Normalise a level `dialogue` array (strings and { text, choices } pages) for the DialogBox.
 * A page with at least one non-blank choice is a choice page — also a single one, which the
 * editor writes as "Question? [Okay |]" (ObjectCatalog.parseDialogueText); blank choices are
 * dropped, as the editor's parser drops them.
 * @param {any} dialogue the level field as loaded (a page array; a single page is accepted too)
 * @returns {DialoguePage[]}
 */
function dialoguePages(dialogue) {
  const pages = [];
  for (const d of Array.isArray(dialogue) ? dialogue : [dialogue]) {
    if (typeof d === 'string') { if (d.trim()) pages.push(d); }
    else if (d && typeof d.text === 'string') {
      const choices = Array.isArray(d.choices) ? d.choices.map(String).filter((c) => c.trim()) : [];
      pages.push(choices.length ? { text: d.text, choices } : d.text);
    }
  }
  return pages;
}

/**
 * Conversation for a level NPC without a script: its `dialogue` pages, then its built-in action.
 *   rest  — offers to rest until morning (Game.restUntilMorning)
 *   shop  — offers an item (`item`, default "Crisp Apple"); taking it adds it to the inventory
 *   music — starts the music, or offers to stop it when it is already playing
 * If the dialogue itself ends with a choice, that choice decides the action (any option but the
 * first runs it — for music: plays it, i.e. starts it when silent and keeps it when it is
 * already playing, so "Shall I play you a song? [No thanks | Yes, play!]" never silences it);
 * otherwise the action asks its own question (music that is not playing simply starts; a playing
 * song gets "Another song, or a little quiet?", whose second answer stops it).
 * A closing page with a single choice ("Off to bed with you. [Good night |]") has no
 * non-committal answer: its only answer runs the action (rest / shop; music: plays it, as above).
 * @param {Partial<LevelObjectOf<'npc'>>} obj level npc object
 *   (the scripts' fallback may pass {})
 * @returns {Conversation}
 */
export function levelConversation(obj) {
  const pages = dialoguePages(obj.dialogue);
  const action = obj.action ?? 'none';
  const item = String(obj.item || 'Crisp Apple');
  const last = pages[pages.length - 1];
  const endsWithChoice = typeof last === 'object';
  // the first answer of the closing question that runs the action: the second one (the first is
  // the non-committal answer), or the only one of a one-choice closing page
  const firstYes = endsWithChoice && last.choices.length === 1 ? 0 : 1;
  return async ({ say, toast, sfx, game }) => {
    const playing = game.audio.musicPlaying;
    // combat levels sell combat items for gold (COMBAT.md §6.12); anything else is a gift
    const price = action === 'shop' ? game.combat?.priceOf(item) ?? null : null;
    const lines = [...pages];
    if (!endsWithChoice) {
      if (action === 'rest') lines.push(ACTION_PROMPTS.rest);
      else if (action === 'shop') lines.push(ACTION_PROMPTS.shop(item, price));
      else if (action === 'music' && playing) lines.push(ACTION_PROMPTS.music);
    }
    if (!lines.length) lines.push('…');
    const choice = await say(lines);
    const yes = typeof choice === 'number' && choice >= firstYes;
    if (action === 'rest' && yes) {
      await game.restUntilMorning();
    } else if (action === 'shop' && yes && price !== null) {
      const r = game.combat.buy(item);
      if (r.ok) {
        sfx('chime');
        toast(`Obtained: ${item}`);
      } else {
        sfx('cancel');
        toast(r.reason === 'gold' ? 'Not enough gold' : r.reason === 'full' ? 'You cannot carry more' : 'Not for sale');
      }
    } else if (action === 'shop' && yes) {
      const key = item.toLowerCase();
      game.inventory[key] = (game.inventory[key] ?? 0) + 1;
      sfx('chime');
      toast(`Obtained: ${item}${game.inventory[key] > 1 ? ` ×${game.inventory[key]}` : ''}`);
    } else if (action === 'music') {
      if (endsWithChoice) {
        // the designer's own question: a "yes" plays the music (a song already playing goes on)
        if (yes && !playing) {
          game.setMusic(true);
          toast('♪ Music');
        }
      } else if (!playing) {
        game.setMusic(true);
        toast('♪ Music');
      } else if (yes) {
        // the built-in "Another song, or a little quiet?" → "Some quiet"
        game.setMusic(false);
        toast('The music fades…');
      }
    }
  };
}

/**
 * The conversation of a level NPC: its hand-written script when `script` names one, otherwise
 * its plain dialogue + action.
 * @param {LevelObjectOf<'npc'>} obj level npc object
 * @returns {Conversation}
 */
export function conversationFor(obj) {
  const script = obj.script ? ownValue(CONVERSATIONS, obj.script) : null;
  if (obj.script && !script) console.warn(`[Lumina] NPC "${obj.id}": unknown script "${obj.script}"; using its dialogue.`);
  // scripts get the NPC object too (the drillmaster falls back to its dialogue on peaceful levels)
  return script ? (ctx) => script(ctx, obj) : levelConversation(obj);
}
