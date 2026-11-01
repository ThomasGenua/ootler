import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {expect} from '@playwright/test';
import {withUiEnvironment} from './ui-environment.js';
const mode=process.argv[2]??'shell',screens=path.resolve(import.meta.dirname,'../.local/screenshots/bento');
await mkdir(screens,{recursive:true});
await withUiEnvironment(async fixture=>{
 const {page,base}=fixture;
 if(mode==='public'){const result=await promisify(execFile)(process.execPath,['scripts/check-public-seo.mjs'],{windowsHide:true,timeout:180000,env:{...process.env,OOTLA_CHECK_URL:base}});console.log(result.stdout);return;}
 try{
  await page.goto(base+'/admin');await expect(page.locator('[data-staff-shell]')).toBeVisible();await expect(page.getByRole('heading',{level:1})).toContainText('Demo');
  await expect(page.getByRole('navigation',{name:'Workspace navigation'})).toBeVisible();await expect(page.getByRole('link',{name:'Dashboard',exact:true})).toHaveAttribute('aria-current','page');
  await page.keyboard.press('Control+j');await expect(page.locator('[data-staff-shell]')).not.toHaveClass(/is-ask-open/);await page.keyboard.press('Control+j');await expect(page.locator('#b-ask')).toBeVisible();
  await page.keyboard.press('Control+k');await expect(page.getByRole('dialog',{name:'Search or run a command'})).toBeVisible();await expect(page.locator('#b-command-input')).toBeFocused();await page.keyboard.press('Escape');
  for(const [width,height]of [[1440,900],[1280,900],[1024,600],[768,900],[390,844]]){await page.setViewportSize({width,height});await page.goto(base+'/admin');await expect(page.locator('[data-staff-shell]')).toBeVisible();assert(await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Shell overflow at '+width);if(width<1200){await expect(page.getByRole('button',{name:'Ask Ootla',exact:true})).toBeVisible();await expect(page.locator('[data-staff-shell]')).not.toHaveClass(/is-ask-open/);}await page.screenshot({path:path.join(screens,mode+'-'+width+'x'+height+'.png'),fullPage:true});}
  console.log('PASS staff shell, keyboard toggles, local fonts and five responsive widths');
 }catch(error){await page.screenshot({path:path.join(screens,mode+'-failure.png'),fullPage:true});console.error('UI failure:',error);throw error;}
});
