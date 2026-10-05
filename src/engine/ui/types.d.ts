// Type-check only (tsconfig.json, `npm run typecheck`); nothing here reaches a bundle.
// Module augmentation for src/engine/ui: fields created lazily (`this._x ??= …`) or by another
// module, which the class body cannot declare without a runtime change.
import 'lil-gui';

declare module 'lil-gui' {
  interface Controller {
    /**
     * DebugPanel.syncListening: set while the panel is hidden on a controller that was
     * `listen()`ing, so showing the panel again restarts exactly those controllers.
     */
    _luPaused?: boolean;
  }
}
