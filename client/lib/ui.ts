export type IconName = 'person' | 'bell' | 'key' | 'link' | 'chevron-down' | 'arrow' | 'arrow-up' | 'arrow-left' | 'home' | 'grid' | 'leads' | 'building' | 'file' | 'calendar' | 'check' | 'tasks' | 'chart' | 'sparkles' | 'plug' | 'search' | 'chevron' | 'plus' | 'menu' | 'close' | 'logout' | 'lock' | 'mail' | 'eye' | 'shield' | 'clock' | 'import' | 'message' | 'info';
const paths: Record<IconName, string> = {
  person: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2z"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  key: '<circle cx="15.5" cy="8.5" r="5.5"/><path d="m11.5 12.5-8 8V23H7v-3h3v-3h2M16 7h.01"/>',
  link: '<path d="m10 13 4-4m-7 7-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m4-3 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(3 2) scale(.85)"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  'arrow-up': '<path d="M6 18 18 6M6 6h12v12"/>',
  'arrow-left': '<path d="M20 12H5m6-6-6 6 6 6"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  leads: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2m1-17a3 3 0 0 1 0 6m2 5a5 5 0 0 1 3 4v2"/>',
  building: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1m-6 4h1m4 0h1m-4 6v-3h2v3M3 21h18"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm0 0v6h6M8 13h8m-8 4h6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m-13 5h2m4 0h2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  tasks: '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M9 4V2h6v2M8 10l1 1 2-2m3 1h2m-8 6 1 1 2-2m3 1h2"/>',
  chart: '<path d="M4 3v18h17M8 17v-5m5 5V7m5 10V4"/>',
  sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM20 2v4m-2-2h4"/>',
  plug: '<path d="M9 3v5m6-5v5M7 8h10v3a5 5 0 0 1-10 0zm5 8v3a3 3 0 0 1-3 3"/>',
  search: '<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  logout: '<path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4m5-13 5 5-5 5m-5-5h14"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7"/><circle cx="12" cy="12" r="3"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  import: '<path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5"/>',
  message: '<path d="M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 0 1-1-4v-1a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8ZM8 10h8m-8 4h5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.01"/>'
};
export function icon(name: IconName, className = ''): string {
  return `<svg class="icon ${className}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
export function wordmark(dark = false, admin = false): string {
  const artwork='<img class="brand-source" src="/brand/ootla-wordmark.png" width="1944" height="809" alt="" decoding="async" />';
  // Every piece uses the supplied artwork; clipping follows transparent gaps.
  const pieces=['brand-roof','brand-first-o',...['o','t','l','a'].map(letter=>'brand-letter brand-letter-'+letter)]
    .map(piece=>'<span class="brand-piece '+piece+'">'+artwork+'</span>').join('');
  // Reuse original roof/O/letter geometry in both still and animated palette masks.
  const still=pieces;
  return '<span class="wordmark ' + (dark ? 'wordmark-on-dark ' : '') + (admin ? 'admin-wordmark' : '') + '" role="img" aria-label="Ootla"><span class="brand-art" aria-hidden="true">' + '<span class="brand-still">'+still+'</span><span class="brand-motion">'+pieces+'</span></span></span>';
}
export function link(href: string, text: string, className = ''): string {
  return `<a href="${href}" data-link class="${className}">${text}</a>`;
}
export function loading(label = 'Loading your workspace'): string {
  return `<main id="main-content" class="page-loading" aria-busy="true"><span class="spinner" aria-hidden="true"></span><p role="status">${escapeHtml(label)}…</p></main>`;
}
