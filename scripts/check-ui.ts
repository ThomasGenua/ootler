import {checkStaffPages} from './check-staff-pages.js';
import {checkAssistant} from './check-assistant-ui.js';
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
 if(mode==='pages'){await checkStaffPages(fixture,screens);return;}
 if(mode==='contracts'){const result=await promisify(execFile)(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/check-dashboard.ts'],{windowsHide:true,timeout:180000,env:{...process.env,DATABASE_URL:fixture.config.databaseUrl}});console.log(result.stdout);return;}
 if(mode==='public'){const result=await promisify(execFile)(process.execPath,['scripts/check-public-seo.mjs'],{windowsHide:true,timeout:180000,env:{...process.env,OOTLA_CHECK_URL:base}});console.log(result.stdout);return;}
 try{
  if(['dashboard','ask','drawer'].includes(mode)){const options=await (await fixture.context.request.get(base+'/api/leads/options')).json();const response=await fixture.context.request.post(base+'/api/leads',{headers:{Origin:base},data:{propertyId:options.properties[0].id,newContact:{displayName:'Bento Check Prospect',email:'bento@example.test'},intent:'leasing'}});assert.equal(response.status(),201);await fixture.database.query("UPDATE viewings SET starts_at=now()+interval '1 day',ends_at=CASE WHEN ends_at IS NULL THEN NULL ELSE now()+interval '1 day 30 minutes' END WHERE organization_id=$1",[fixture.organizationId]);}
  await page.goto(base+'/admin');await expect(page.locator('[data-staff-shell]')).toBeVisible();await expect(page.getByRole('heading',{level:1})).toContainText('Demo');
  if(mode==='ask'||mode==='drawer'){await expect(page.locator('[data-pipeline]')).toBeVisible();await checkAssistant(fixture,mode);await page.screenshot({path:path.join(screens,mode+'-1440x900.png'),fullPage:true});return;}
  if(mode==='dashboard'){
   await expect(page.locator('[data-pipeline]')).toBeVisible();await expect(page.locator('.b-summary .b-stat')).toHaveCount(4);
   const overview=await (await fixture.context.request.get(base+'/api/admin/overview')).json();
   assert.deepEqual(await page.locator('[data-count]').evaluateAll(es=>es.map(el=>Number(el.getAttribute('data-count')))),Object.values(overview.dashboard.metrics));
   const card=page.locator('[data-drop-stage=new_inquiry] [data-board-lead]').first();const id=await card.getAttribute('data-board-lead');assert(id);
   await page.route('**/api/leads/'+id+'/stage',route=>route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'This record changed. Refresh before saving.'})}));
   await card.dragTo(page.locator('[data-drop-stage=contacted]'));await expect(page.locator('[data-dashboard-error]')).toContainText('record changed');await expect(page.locator('[data-drop-stage=new_inquiry] [data-board-lead="'+id+'"]')).toBeVisible();
   await page.unroute('**/api/leads/'+id+'/stage');await card.dragTo(page.locator('[data-drop-stage=contacted]'));await expect(page.locator('[data-drop-stage=contacted] [data-board-lead="'+id+'"]')).toBeVisible();
   await expect(page.locator('[data-dashboard-error]')).toContainText('Lead moved to Contacted');
   const persisted=await (await fixture.context.request.get(base+'/api/leads/'+id)).json();assert.equal(persisted.lead.stage,'contacted');
   const task=page.locator('[data-task-check]').first();if(await task.count()){const taskId=await task.getAttribute('data-task-check');await task.check();await expect(page.locator('[data-dashboard-error]')).toContainText('Task completed');assert.equal((await (await fixture.context.request.get(base+'/api/tasks/'+taskId)).json()).task.status,'completed');}
   console.log('PASS dashboard API totals, drag persistence and conflict rollback, task completion');
  }
  await expect(page.getByRole('navigation',{name:'Workspace navigation'})).toBeVisible();await expect(page.getByRole('link',{name:'Dashboard',exact:true})).toHaveAttribute('aria-current','page');
  const bell=page.getByRole('button',{name:'Notifications',exact:true});await bell.click();await expect(page.getByRole('link',{name:'View notification centre',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(bell).toHaveAttribute('aria-expanded','false');await expect(bell).toBeFocused();
  await page.keyboard.press('Control+j');await expect(page.locator('[data-staff-shell]')).not.toHaveClass(/is-ask-open/);await page.keyboard.press('Control+j');await expect(page.locator('#b-ask')).toBeVisible();
  await page.keyboard.press('Control+k');await expect(page.getByRole('dialog',{name:'Search or run a command'})).toBeVisible();await expect(page.locator('#b-command-input')).toBeFocused();await page.keyboard.press('Escape');
  for(const [width,height]of [[1440,900],[1280,900],[1024,600],[768,900],[390,844]]){await page.setViewportSize({width,height});await page.goto(base+'/admin');await expect(page.locator('[data-staff-shell]')).toBeVisible();if(mode==='dashboard'){await expect(page.locator('[data-pipeline]')).toBeVisible();const box=await page.locator('[data-pipeline]').boundingBox();assert(box&&box.height>=330&&box.y<600,'Pipeline visible without shrinking');}assert(await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Shell overflow at '+width);if(width<1200){await expect(page.getByRole('button',{name:'Ask Ootla',exact:true})).toBeVisible();await expect(page.locator('[data-staff-shell]')).not.toHaveClass(/is-ask-open/);}if(width<768){await page.getByRole('button',{name:'More workspaces',exact:true}).click();for(const name of ['Documents','Calendar','Tasks','Messages','Reports'])await expect(page.locator('#b-workspaces').getByRole('link',{name,exact:true})).toBeVisible();await page.keyboard.press('Escape');}await page.screenshot({path:path.join(screens,mode+'-'+width+'x'+height+'.png'),fullPage:true});}
  console.log('PASS staff shell, keyboard toggles, local fonts and five responsive widths');
 }catch(error){await page.screenshot({path:path.join(screens,mode+'-failure.png'),fullPage:true});console.error('UI failure:',error);throw error;}
});
