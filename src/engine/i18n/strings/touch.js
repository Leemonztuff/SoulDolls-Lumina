/**
 * UI strings, namespace 'touch' (docs/specs/I18N.md §2): the on-screen touch controls'
 * accessible names (TouchControls.js). Owner: B-hud (docs/specs/PIXEL_UI.md §8). A core
 * namespace for pages with a UI: registered by the touch layer itself when it is created
 * (`registerTouchStrings()`), so a page without one never loads them; `t('touch.<key>')` works
 * everywhere once registered.
 *
 * Keys are ids, not English; each language a table of key → string. Button faces (A, B, the
 * arrows) stay Latin / drawn in every language and are not here — these are the aria labels.
 * Key names on keycaps and buttons are never translated when they are letters.
 */
/** @type {import('../I18n.js').StringTable} */
const table = {
  en: {
    move: 'Move',
    confirm: 'Confirm',
    cancel: 'Cancel',
    run: 'Run',
    camLeft: 'Rotate camera left',
    camRight: 'Rotate camera right',
    up: 'Move up',
    down: 'Move down',
    left: 'Move left',
    right: 'Move right',
  },
  ja: {
    move: '移動',
    confirm: '決定',
    cancel: 'キャンセル',
    run: 'ダッシュ',
    camLeft: 'カメラを左に回す',
    camRight: 'カメラを右に回す',
    up: '上に移動',
    down: '下に移動',
    left: '左に移動',
    right: '右に移動',
  },
  zh: {
    move: '移动',
    confirm: '确认',
    cancel: '取消',
    run: '奔跑',
    camLeft: '向左旋转镜头',
    camRight: '向右旋转镜头',
    up: '向上移动',
    down: '向下移动',
    left: '向左移动',
    right: '向右移动',
  },
};
export default table;
