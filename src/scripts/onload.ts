// Run a callback on the initial page load and on every Astro view-transition
// navigation. Module scripts only execute once per document, so this registers
// a single listener that survives client-side navigations.
export function onPageLoad(cb: () => void): void {
  cb();
  document.addEventListener("astro:page-load", cb);
}

// Run once per DOM node, then every time that node is re-added after a view
// transition (the persisted/copied subtree may be new each navigation).
export function onPageLoadFor(node: HTMLElement, cb: (el: HTMLElement) => void): void {
  const run = () => {
    if (node.isConnected) cb(node);
  };
  cb(node);
  document.addEventListener("astro:page-load", run);
}