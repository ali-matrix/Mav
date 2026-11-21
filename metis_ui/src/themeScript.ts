// @metis/ui — runs on the server (root layout) and inline in <head>: sets the theme
// before paint so a page never flashes the wrong one. A saved light/dark choice wins;
// otherwise the device's. Kept out of theme.tsx, which is a client module.
export const themeScript = (key: string) =>
  `try{var c=localStorage.getItem(${JSON.stringify(key)});if(c!=="dark"&&c!=="light")c=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=c}catch(e){}`;
