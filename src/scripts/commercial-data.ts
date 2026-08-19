// Curated commercial typefaces -> free stand-ins, embedded for the client-side
// results panel. Mirrors src/data/commercial.ts (server side).
export interface Commercial {
  name: string;
  foundry: string;
  buyUrl: string;
  freeAlternatives: string[];
}

export const COMMERCIAL: Commercial[] = [
  { name: "Helvetica", foundry: "Linotype / Monotype", buyUrl: "https://www.myfonts.com/collections/helvetica-font-linotype", freeAlternatives: ["inter", "roboto", "arimo", "archivo"] },
  { name: "Akzidenz-Grotesk", foundry: "Berthold", buyUrl: "https://www.myfonts.com/collections/akzidenz-grotesk-font-berthold", freeAlternatives: ["inter", "roboto", "archivo"] },
  { name: "Arial", foundry: "Monotype", buyUrl: "https://www.myfonts.com/collections/arial-font-monotype", freeAlternatives: ["arimo", "roboto", "inter"] },
  { name: "Proxima Nova", foundry: "Mark Simonson Studio", buyUrl: "https://www.myfonts.com/collections/proxima-nova-font-mark-simonson-studio", freeAlternatives: ["montserrat", "mulish", "nunito-sans", "hind"] },
  { name: "Gotham", foundry: "Hoefler & Co.", buyUrl: "https://www.typography.com/fonts/gotham/overview", freeAlternatives: ["montserrat", "jost", "poppins"] },
  { name: "Futura", foundry: "Linotype / Paratype", buyUrl: "https://www.myfonts.com/collections/futura-font-linotype", freeAlternatives: ["jost", "poppins", "questrial", "didact-gothic"] },
  { name: "Avenir", foundry: "Linotype", buyUrl: "https://www.myfonts.com/collections/avenir-font-linotype", freeAlternatives: ["nunito-sans", "montserrat", "mulish"] },
  { name: "Circular", foundry: "Lineto", buyUrl: "https://lineto.com/typefaces/circular", freeAlternatives: ["poppins", "dm-sans", "nunito"] },
  { name: "Brandon Grotesque", foundry: "HVD Fonts", buyUrl: "https://www.myfonts.com/collections/brandon-grotesque-font-hvd-fonts", freeAlternatives: ["josefin-sans", "montserrat"] },
  { name: "Gill Sans", foundry: "Monotype", buyUrl: "https://www.myfonts.com/collections/gill-sans-font-monotype", freeAlternatives: ["lato", "cabin", "quattrocento-sans"] },
  { name: "Frutiger", foundry: "Linotype", buyUrl: "https://www.myfonts.com/collections/frutiger-font-linotype", freeAlternatives: ["source-sans-3", "open-sans", "hind"] },
  { name: "Univers", foundry: "Linotype", buyUrl: "https://www.myfonts.com/collections/univers-font-linotype", freeAlternatives: ["roboto", "archivo", "inter"] },
  { name: "Myriad Pro", foundry: "Adobe", buyUrl: "https://fonts.adobe.com/fonts/myriad", freeAlternatives: ["open-sans", "source-sans-3", "hind"] },
  { name: "DIN", foundry: "Monotype", buyUrl: "https://www.myfonts.com/collections/din-next-font-monotype", freeAlternatives: ["archivo", "barlow", "saira"] },
  { name: "Interstate", foundry: "Frere-Jones Type", buyUrl: "https://www.myfonts.com/collections/interstate-font-frere-jones", freeAlternatives: ["archivo", "barlow", "libre-franklin"] },
  { name: "Trade Gothic", foundry: "Linotype", buyUrl: "https://www.myfonts.com/collections/trade-gothic-font-linotype", freeAlternatives: ["oswald", "archivo-narrow", "barlow-condensed"] },
  { name: "Knockout", foundry: "Hoefler & Co.", buyUrl: "https://www.typography.com/fonts/knockout/overview", freeAlternatives: ["oswald", "archivo-narrow", "anton"] },
  { name: "Druk", foundry: "Commercial Type", buyUrl: "https://commercialtype.com/catalog/druk", freeAlternatives: ["anton", "archivo-black", "bebas-neue"] },
  { name: "Impact", foundry: "Monotype", buyUrl: "https://www.myfonts.com/collections/impact-font-monotype", freeAlternatives: ["anton", "archivo-black"] },
  { name: "Graphik", foundry: "Commercial Type", buyUrl: "https://commercialtype.com/catalog/graphik", freeAlternatives: ["inter", "roboto", "work-sans"] },
  { name: "Apercu", foundry: "Colophon Foundry", buyUrl: "https://www.colophon-foundry.org/typefaces/apercu/", freeAlternatives: ["work-sans", "inter", "dm-sans"] },
  { name: "Söhne", foundry: "Klim Type Foundry", buyUrl: "https://klim.co.nz/retail-fonts/soehne/", freeAlternatives: ["inter", "roboto"] },
  { name: "Suisse Int'l", foundry: "Swiss Typefaces", buyUrl: "https://www.swisstypefaces.com/fonts/suisse/", freeAlternatives: ["inter", "archivo"] },
  { name: "Aktiv Grotesk", foundry: "Dalton Maag", buyUrl: "https://www.daltonmaag.com/library/aktiv-grotesk", freeAlternatives: ["inter", "roboto"] },
  { name: "GT Walsheim", foundry: "Grilli Type", buyUrl: "https://www.grillitype.com/typeface/gt-walsheim", freeAlternatives: ["poppins", "jost"] },
  { name: "Sofia Pro", foundry: "Mostardesign", buyUrl: "https://www.myfonts.com/collections/sofia-pro-font-mostardesign", freeAlternatives: ["poppins", "sofia-sans"] },
  { name: "Cera Pro", foundry: "TypeMates", buyUrl: "https://www.myfonts.com/collections/cera-pro-font-typemates", freeAlternatives: ["poppins", "jost"] },
  { name: "Maison Neue", foundry: "Milieu Grotesque", buyUrl: "https://www.milieugrotesque.com/typefaces/maison-neue/", freeAlternatives: ["work-sans", "inter"] },
  { name: "Museo Sans", foundry: "exljbris", buyUrl: "https://www.myfonts.com/collections/museo-sans-font-exljbris", freeAlternatives: ["mulish", "nunito-sans"] },
  { name: "Franklin Gothic", foundry: "Monotype / ITC", buyUrl: "https://www.myfonts.com/collections/itc-franklin-gothic-font-itc", freeAlternatives: ["libre-franklin", "archivo"] },
  { name: "Century Gothic", foundry: "Monotype", buyUrl: "https://www.myfonts.com/collections/century-gothic-font-monotype", freeAlternatives: ["questrial", "didact-gothic", "jost"] },
  { name: "Optima", foundry: "Linotype", buyUrl: "https://www.myfonts.com/collections/optima-font-linotype", freeAlternatives: ["marcellus-sc", "cormorant-garamond", "philosopher"] },
  { name: "Segoe UI", foundry: "Microsoft", buyUrl: "https://learn.microsoft.com/en-us/typography/font-list/segoe-ui", freeAlternatives: ["open-sans", "inter", "source-sans-3"] },
  { name: "Calibri", foundry: "Microsoft", buyUrl: "https://learn.microsoft.com/en-us/typography/font-list/calibri", freeAlternatives: ["carlito", "lato", "open-sans"] },
  { name: "Cambria", foundry: "Microsoft", buyUrl: "https://learn.microsoft.com/en-us/typography/font-list/cambria", freeAlternatives: ["caladea", "pt-serif"] },
  { name: "Verdana", foundry: "Microsoft", buyUrl: "https://www.myfonts.com/collections/verdana-font-microsoft-corporation", freeAlternatives: ["pt-sans", "open-sans", "noto-sans"] },
  { name: "Tahoma", foundry: "Microsoft", buyUrl: "https://www.myfonts.com/collections/tahoma-font-microsoft-corporation", freeAlternatives: ["open-sans", "pt-sans"] },
  { name: "Trebuchet MS", foundry: "Microsoft", buyUrl: "https://www.myfonts.com/collections/trebuchet-ms-font-microsoft-corporation", freeAlternatives: ["fira-sans", "pt-sans"] },
  { name: "Georgia", foundry: "Microsoft", buyUrl: "https://www.myfonts.com/collections/georgia-font-microsoft-corporation", freeAlternatives: ["gelasio", "pt-serif", "lora"] },
  { name: "Times New Roman", foundry: "Monotype", buyUrl: "https://www.myfonts.com/collections/times-new-roman-font-monotype", freeAlternatives: ["tinos", "pt-serif", "crimson-text"] },
  { name: "Courier New", foundry: "Monotype", buyUrl: "https://www.myfonts.com/collections/courier-new-font-monotype", freeAlternatives: ["courier-prime", "cousine"] },
  { name: "Comic Sans MS", foundry: "Microsoft", buyUrl: "https://www.myfonts.com/collections/comic-sans-font-microsoft-corporation", freeAlternatives: ["comic-neue"] },
  { name: "SF Pro", foundry: "Apple", buyUrl: "https://developer.apple.com/fonts/", freeAlternatives: ["inter", "roboto"] },
  { name: "Adobe Garamond", foundry: "Adobe", buyUrl: "https://fonts.adobe.com/fonts/adobe-garamond", freeAlternatives: ["eb-garamond", "cormorant-garamond", "crimson-pro"] },
  { name: "Caslon", foundry: "Adobe / ITC", buyUrl: "https://fonts.adobe.com/fonts/adobe-caslon", freeAlternatives: ["libre-caslon-text", "eb-garamond"] },
  { name: "Baskerville", foundry: "Monotype", buyUrl: "https://www.myfonts.com/collections/baskerville-font-monotype", freeAlternatives: ["libre-baskerville", "playfair-display"] },
  { name: "Bodoni", foundry: "Monotype / ITC", buyUrl: "https://www.myfonts.com/collections/bodoni-font-monotype", freeAlternatives: ["bodoni-moda", "playfair-display"] },
  { name: "Didot", foundry: "Linotype", buyUrl: "https://www.myfonts.com/collections/didot-font-linotype", freeAlternatives: ["playfair-display", "prata", "bodoni-moda"] },
  { name: "Minion Pro", foundry: "Adobe", buyUrl: "https://fonts.adobe.com/fonts/minion", freeAlternatives: ["crimson-text", "source-serif-4", "eb-garamond"] },
  { name: "Sabon", foundry: "Linotype", buyUrl: "https://www.myfonts.com/collections/sabon-font-linotype", freeAlternatives: ["eb-garamond", "crimson-pro"] },
  { name: "Palatino", foundry: "Linotype", buyUrl: "https://www.myfonts.com/collections/palatino-font-linotype", freeAlternatives: ["crimson-pro", "eb-garamond"] },
  { name: "Clarendon", foundry: "Monotype", buyUrl: "https://www.myfonts.com/collections/clarendon-font-monotype", freeAlternatives: ["bitter", "roboto-slab", "zilla-slab"] },
  { name: "Rockwell", foundry: "Monotype", buyUrl: "https://www.myfonts.com/collections/rockwell-font-monotype", freeAlternatives: ["roboto-slab", "zilla-slab", "arvo"] },
  { name: "Museo Slab", foundry: "exljbris", buyUrl: "https://www.myfonts.com/collections/museo-slab-font-exljbris", freeAlternatives: ["arvo", "bitter"] },
  { name: "Tiempos", foundry: "Klim Type Foundry", buyUrl: "https://klim.co.nz/retail-fonts/tiempos-text/", freeAlternatives: ["source-serif-4", "lora", "literata"] },
  { name: "Publico", foundry: "Commercial Type", buyUrl: "https://commercialtype.com/catalog/publico", freeAlternatives: ["source-serif-4", "literata"] },
  { name: "Canela", foundry: "Commercial Type", buyUrl: "https://commercialtype.com/catalog/canela", freeAlternatives: ["playfair-display", "cormorant-garamond"] },
  { name: "Recoleta", foundry: "Latinotype", buyUrl: "https://www.myfonts.com/collections/recoleta-font-latinotype", freeAlternatives: ["literata", "bitter"] },
  { name: "Trajan", foundry: "Adobe", buyUrl: "https://fonts.adobe.com/fonts/trajan", freeAlternatives: ["cinzel", "marcellus-sc"] },
  { name: "Copperplate", foundry: "Monotype", buyUrl: "https://www.myfonts.com/collections/copperplate-gothic-font-monotype", freeAlternatives: ["cinzel", "marcellus-sc"] },
];

export function commercialLookalikes(slug: string): Commercial[] {
  return COMMERCIAL.filter((f) => f.freeAlternatives.includes(slug));
}