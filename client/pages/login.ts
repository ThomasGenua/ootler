import {privatePagePaths} from '../../shared/public-site';
import { api, errorMessage, staffCopy, type AuthUser, type PublicConfig } from '../lib/api';
import { icon, link, wordmark } from '../lib/ui';
import type { AccountSnapshot } from '../../shared/account-contracts';

export function loginPage(): string {
  return `<main id="main-content" class="login-layout"><section class="login-form-panel"><div class="login-top-link">${link('/', `${icon('arrow-left')} Ootla`, 'text-link')}</div><h1>Welcome back.</h1><p class="login-intro">Sign in to your staff workspace.</p><div id="login-setup" class="notice" role="status"><p>Opening your workspace…</p></div>${new URLSearchParams(location.search).get('passwordChanged') === '1' ? '<p class="notice" role="status">Use your new password to sign in.</p>' : ''}<form id="login-form"><div class="form-field"><label for="login-email">Email address</label><div class="input-wrap">${icon('mail')}<input id="login-email" name="email" type="email" autocomplete="username" placeholder="you@company.com" required maxlength="254" spellcheck="false"/></div></div><div class="form-field"><label for="login-password">Password</label><div class="input-wrap">${icon('lock')}<input id="login-password" name="password" type="password" autocomplete="current-password" required maxlength="256"/><button type="button" class="password-toggle icon-button" data-action="toggle-password" aria-label="Show password" aria-pressed="false">${icon('eye')}</button></div></div><p id="login-error" class="form-error" role="alert" hidden></p><button id="login-submit" type="submit" class="b-button b-button-primary login-submit" disabled>Sign in ${icon('arrow')}</button><div id="demo-credentials-slot"></div></form></section></main>`;
}
export function safeReturnTo(raw: string | null): string {
  if (!raw) return '/admin';
  const paths = new Set<string>(privatePagePaths.filter(path=>path.startsWith('/admin')&&path!=='/admin/login'));
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || raw.length > 2000) return '/admin';
  try {
    const target = new URL(raw, 'https://ootla.local');
    return target.origin === 'https://ootla.local' && paths.has(target.pathname) ? target.pathname + target.search : '/admin';
  } catch { return '/admin'; }
}
export async function initializeLogin(signal: AbortSignal, navigate: (path: string, replace?: boolean) => void): Promise<void> {
  const form = document.querySelector<HTMLFormElement>('#login-form');
  const email = document.querySelector<HTMLInputElement>('#login-email');
  const password = document.querySelector<HTMLInputElement>('#login-password');
  const submit = document.querySelector<HTMLButtonElement>('#login-submit');
  const error = document.querySelector<HTMLParagraphElement>('#login-error');
  const setup = document.querySelector<HTMLDivElement>('#login-setup');
  if (!form || !email || !password || !submit || !error || !setup) return;
  let config: PublicConfig | undefined;
  let pending = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending || !config?.databaseReady || !form.reportValidity()) return;
    pending = true;
    submit.disabled = true;
    submit.innerHTML = '<span class="spinner spinner-small" aria-hidden="true"></span> Signing in…';
    form.setAttribute('aria-busy', 'true');
    error.hidden = true;
    try {
      await api<{ user: AuthUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: email.value.trim(), password: password.value }), signal });
      if(signal.aborted)return;
      const requested=new URLSearchParams(location.search).get('returnTo');
      const account=requested===null ? await api<AccountSnapshot>('/api/account',{signal}) : undefined;
      if(!signal.aborted)navigate(safeReturnTo(requested ?? account?.preferences.defaultPage ?? null),true);
    } catch (reason) {
      if (signal.aborted) return;
      error.textContent = errorMessage(reason);
      error.hidden = false;
    } finally {
      if (!signal.aborted) {
        pending = false;
        submit.disabled = !config?.databaseReady;
        submit.innerHTML = `Sign in ${icon('arrow')}`;
        form.removeAttribute('aria-busy');
      }
    }
  }, { signal });
  document.querySelector<HTMLButtonElement>('[data-action="toggle-password"]')?.addEventListener('click', (event) => {
    const toggle = event.currentTarget as HTMLButtonElement;
    const visible = password.type === 'password';
    password.type = visible ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(visible));
    toggle.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
  }, { signal });
  try {
    config = await api<PublicConfig>('/api/config', { signal });
    if (signal.aborted) return;
    // Use the running API's configured origin; never broaden the server's CSRF policy.
    if(typeof config.appUrl!=='string')throw new Error('Restart the Ootla API to load its application address, then refresh this page.');
    const appOrigin=new URL(config.appUrl);
    if(!['http:','https:'].includes(appOrigin.protocol)||appOrigin.origin!==config.appUrl)throw new Error('Restart the Ootla API to load its application address, then refresh this page.');
    if(location.origin!==appOrigin.origin){
      const target=new URL('/admin/login',appOrigin.origin);
      const returnTo=safeReturnTo(new URLSearchParams(location.search).get('returnTo'));
      target.searchParams.set('returnTo',returnTo);
      setup.hidden=false;setup.className='notice notice-warning';setup.replaceChildren();
      const content=document.createElement('div');const heading=document.createElement('strong');heading.textContent='Continue at your Ootla address';
      const copy=document.createElement('p');copy.textContent='This sign-in page was opened at another address. Use '+appOrigin.origin+' to sign in to your workspace.';
      const link=document.createElement('a');link.id='canonical-login-link';link.href=target.href;link.className='button button-secondary';link.textContent='Open Ootla sign in';
      content.append(heading,copy,link);setup.append(content);
      form.setAttribute('aria-disabled','true');email.disabled=true;password.disabled=true;submit.disabled=true;
      const toggle=document.querySelector<HTMLButtonElement>('[data-action="toggle-password"]');if(toggle)toggle.disabled=true;
      document.querySelector('#demo-credentials-slot')?.replaceChildren();
      config=undefined;
      return;
    }
    if (config.databaseReady) {
      setup.hidden = true;
      submit.disabled = false;
    } else {
      setup.className = 'notice notice-warning';
      setup.innerHTML = `${icon('info')}<div><strong>Your workspace is waiting for setup.</strong><p></p></div>`;
    }
    const setupCopy = setup.querySelector('p');
    if (!config.databaseReady && setupCopy) setupCopy.textContent = staffCopy(config.setupMessage || 'Ask your administrator to finish workspace setup, then refresh.');
    if (config.demoEnabled && config.demoCredentials) {
      const slot = document.querySelector<HTMLDivElement>('#demo-credentials-slot');
      if (slot) {
        slot.innerHTML = `<div class="demo-fill"><span class="demo-divider">REVIEWING THE DEMO?</span><button type="button" id="fill-demo" class="button button-secondary">Fill demo credentials ${icon('arrow')}</button><p>Fills the email and masked password fields.<br>You choose when to sign in.</p></div>`;
        document.querySelector<HTMLButtonElement>('#fill-demo')?.addEventListener('click', () => {
          if (!config?.demoEnabled || !config.demoCredentials) return;
          email.value = config.demoCredentials.email;
          password.value = config.demoCredentials.password;
          password.type = 'password';
          const toggle = document.querySelector<HTMLButtonElement>('[data-action="toggle-password"]');
          toggle?.setAttribute('aria-pressed', 'false');
          toggle?.setAttribute('aria-label', 'Show password');
          error.hidden = true;
          submit.focus();
        }, { signal });
      }
    }
    if (config.standaloneDemoCredentials) {
      const slot=document.querySelector<HTMLDivElement>('#demo-credentials-slot');
      if(slot){const section=document.createElement('div');section.className='demo-fill';const button=document.createElement('button');button.type='button';button.className='button button-secondary';button.id='fill-standalone-demo';button.textContent='Fill standalone demo credentials';const copy=document.createElement('p');copy.textContent='Separate standalone organization for CSV onboarding. Fill the fields, then choose Sign in.';section.append(button,copy);slot.append(section);
        button.addEventListener('click',()=>{if(!config?.standaloneDemoCredentials)return;email.value=config.standaloneDemoCredentials.email;password.value=config.standaloneDemoCredentials.password;password.type='password';const toggle=document.querySelector<HTMLButtonElement>('[data-action="toggle-password"]');toggle?.setAttribute('aria-pressed','false');toggle?.setAttribute('aria-label','Show password');error.hidden=true;submit.focus();},{signal});
      }
    }
  } catch (reason) {
    if (signal.aborted) return;
    config=undefined;submit.disabled=true;
    setup.className = 'notice notice-warning';
    setup.replaceChildren();
    const copy = document.createElement('p');
    copy.textContent = errorMessage(reason);
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'text-link';
    retry.textContent = 'Try again';
    retry.dataset.action = 'retry';
    setup.append(copy, retry);
  }
}
