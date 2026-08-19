// Its own prerendered page, so the miniplayer window can be pointed at a real
// path in the bundle: Tauri resolves an app URL as a file path, so a query
// string on `index.html` gets looked up as part of the filename and 404s.
//
// `always` is what makes this emit `mini/index.html` rather than `mini.html` —
// Tauri resolves a directory to its index, and has nothing to resolve a bare
// `mini` against otherwise.
export const prerender = true;
export const ssr = false;
export const trailingSlash = "always";
