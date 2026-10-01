/* Lock browser gestures without interfering with ship input or menu scrolling. */
(() => {
  'use strict';
  const cancel = event => { if (event.cancelable) event.preventDefault(); };
  const scrollPanel = target => {
    const panel = target.closest?.('.scroll-area, .modal-screen');
    return panel && /^(auto|scroll)$/.test(getComputedStyle(panel).overflowY) ? panel : null;
  };
  const canScroll = (panel, delta) => panel && (delta > 0
    ? panel.scrollTop + panel.clientHeight < panel.scrollHeight - 1
    : delta < 0 && panel.scrollTop > 0);

  // WebViews and older Safari can ignore viewport limits or overscroll CSS.
  let panel = null, lastY = 0;
  document.addEventListener('touchstart', event => {
    panel = event.touches.length === 1 ? scrollPanel(event.target) : null;
    lastY = event.touches[0]?.clientY || 0;
    if (event.touches.length > 1) cancel(event);
  }, { passive: false });
  document.addEventListener('touchmove', event => {
    const y = event.touches[0]?.clientY || 0, delta = lastY - y;
    lastY = y;
    if (event.touches.length !== 1 || !canScroll(panel, delta)) cancel(event);
  }, { passive: false });
  for (const type of ['touchend', 'touchcancel']) document.addEventListener(type, () => { panel = null; }, { passive: true });
  for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'selectstart', 'contextmenu', 'dragstart', 'dblclick']) {
    document.addEventListener(type, cancel, { passive: false });
  }
  document.addEventListener('wheel', event => {
    if (event.ctrlKey || event.metaKey || !canScroll(scrollPanel(event.target), event.deltaY)) cancel(event);
  }, { passive: false });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && ['+', '=', '-', '_', '0'].includes(event.key)) cancel(event);
  });
})();
