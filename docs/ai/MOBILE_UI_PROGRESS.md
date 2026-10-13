# Mobile UI — Progress & Next Steps

## Done (committed)

- **Fase 0** — Auditoría real de input, UI kit, i18n, resize/DPR, persistencia.
- **Fase 1** — `DeviceMode` (layout auto/desktop/mobile, `?layout=` override, hot switch, `<html data-lu-layout>`), fila de opciones en el título (en/ja/zh), `_layoutOptions()` en Game.
- **Fase 2** — `TouchControls.js` + `touch.css`: capa `.lu-touch` (D-pad + cluster B/A/«/»/»»), virtual buttons en `Input.js` (`setVirtualButton`/`releaseTouchButtons`), `viewport-fit=cover`, oculta leyenda teclado en mobile. Verificado en browser checks `--strict` (mobile 852×393 y desktop 1280×720).
- **Fase 3** — Botones de combate **X (ataque)** y **L (lock)** visibles solo bajo `lu-root--combat`; cluster elevado 86px en combate para no solapar el skill bar; strings `touch.attack`/`touch.lock` (en/ja/zh); doc §10 `INPUT_AND_CONTROLS.md` actualizada. Verificado: cinderwatch-pass mobile (X/L + skill bar sin solape) y starfall-vale (sin X/L).

## Next steps (in order)

1. **HUD responsive completo** — vitals, minimapa, boss bar, cutscene letterbox y skill bar en mobile (tamaños/posiciones seguras con `safe-area-inset`).
2. **Textos a escala** — wrap/font-size de diálogos y menús en pantallas pequeñas; revisar CJK.
3. **Cutscene letterbox** — barras cinematográficas proporcionales en mobile.
4. **QA cruzado** — recapturar títulos + tour de contenido en mobile/desktop, en en/ja/zh, y revisar capturas (no solo exit code).

## Notas para retomar

- El skill bar de combate ya es tocable (`CombatHUD.onSlotPress` → `CombatInput.press`); no hace falta botones extra para skills/draught.
- B táctil = esquiva en combate (rebind `GamepadB` → `dodge`); `cancel` solo se lee con map/photo/dialog up.
- `lu-root--combat` se añade en `UI.enableCombat` (UI.js:401).
- Browser check: PowerShell necesita comillas alrededor de `--query` con `&`.
