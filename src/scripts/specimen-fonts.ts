// Lazy-load Google Fonts for specimen cards, batched by visibility.
// Cards opt in with data-specimen-font="Family Name".

const cache = new Set<string>();

function cssUrl(families: string[]): string {
  const fams = families.map((f) => `family=${f.replace(/ /g, "+")}`).join("&");
  return `https://fonts.googleapis.com/css2?${fams}&text=Handgloves&display=block`;
}

function load(families: string[]): void {
  const toLoad = families.filter((f) => !cache.has(f));
  if (!toLoad.length) return;
  toLoad.forEach((f) => cache.add(f));
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = cssUrl(toLoad);
  document.head.append(link);
}

export function initSpecimenFonts(root: ParentNode = document): () => void {
  let observer: IntersectionObserver | null = null;
  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver(
      (entries) => {
        const fams = new Set<string>();
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const fam = (entry.target as HTMLElement).dataset.specimenFont;
          if (fam) fams.add(fam);
        }
        if (fams.size) load([...fams]);
      },
      { rootMargin: "300px 0px" }
    );
  }
  const observe = () => {
    const els = root.querySelectorAll<HTMLElement>("[data-specimen-font]");
    if (observer) {
      els.forEach((el) => observer!.observe(el));
    } else {
      const fams = new Set<string>();
      els.forEach((el) => {
        const fam = el.dataset.specimenFont;
        if (fam) fams.add(fam);
      });
      if (fams.size) load([...fams]);
    }
  };
  observe();
  return observe;
}