/**
 * Alvo do portal de overlays (menu Tools, hover, toast).
 * Em tela cheia o navegador só pinta o `fullscreenElement` — portal em `document.body` some.
 */
export function overlayPortalRoot(): HTMLElement {
  const fullscreen = document.fullscreenElement;
  if (fullscreen instanceof HTMLElement) {
    return fullscreen;
  }
  return document.body;
}
