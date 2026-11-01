import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import type {UiFixture} from './ui-environment.js';
export async function checkAssistant(f:UiFixture,mode:string){
 const {page,base,context,database,organizationId}=f;
 const lead=page.locator('[data-drop-stage=new_inquiry] [data-open-lead]').first();await lead.click();await expect(page.locator('.b-lead-drawer>header h2')).toBeVisible();const id=new URL(page.url()).searchParams.get('lead');assert(id);
 if(mode==='drawer'){
  await page.locator('[data-drawer-stage=contacted]').click();await expect(page.locator('[data-drawer-stage=contacted]')).toHaveAttribute('aria-current','step');
  assert.equal((await (await context.request.get(base+'/api/leads/'+id)).json()).lead.stage,'contacted');
  await page.keyboard.press('Escape');await expect(page.locator('.b-lead-drawer')).toHaveCount(0);assert(!new URL(page.url()).searchParams.has('lead'));
  await page.goto(base+'/admin?lead='+id);await expect(page.locator('.b-lead-drawer>header h2')).toBeVisible();await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');await page.locator('#b-command-input').fill('Bento Check');await expect(page.locator('[data-command-lead]')).toBeVisible();await page.locator('[data-command-lead]').click();await expect(page.locator('.b-lead-drawer')).toBeVisible();
  console.log('PASS lead drawer deep links, stage persistence, Escape, and command record search');return;
 }
 const before=Number((await database.query('SELECT count(*) AS n FROM tasks WHERE organization_id=$1',[organizationId])).rows[0].n);
 const response=page.waitForResponse(r=>r.url().endsWith('/api/pilot/assistant/chat')&&r.request().method()==='POST');
 await page.locator('[data-ask-prompt="Create a follow-up task"]').click();const stream=await response;assert.equal(stream.status(),200);assert.match(stream.headers()['content-type'],/ndjson/);const chunks=(await stream.text()).trim().split('\n').map(s=>JSON.parse(s));assert(chunks.filter(c=>c.type==='text').length>1);assert.equal(chunks.at(-1).type,'done');
 const action=page.locator('[data-chat-action]').last();await expect(action).toBeVisible();assert.equal(Number((await database.query('SELECT count(*) AS n FROM tasks WHERE organization_id=$1',[organizationId])).rows[0].n),before);
 const chatId=await action.getAttribute('data-chat-action');const missingApproval=await context.request.post(base+'/api/pilot/assistant/chat/'+chatId+'/decision',{headers:{Origin:base},data:{operation:'approve',version:1}});assert.equal(missingApproval.status(),400);
 await action.getByRole('button',{name:'Edit',exact:true}).click();await action.locator('[name=title]').fill('Approved Bento follow-up');await action.getByRole('button',{name:'Save changes'}).click();await expect(action).toContainText('Approved Bento follow-up');await expect(action.locator('form')).toBeHidden();
 await action.getByRole('button',{name:'Approve',exact:true}).click();await expect(action).toContainText('approved');assert.equal(Number((await database.query('SELECT count(*) AS n FROM tasks WHERE organization_id=$1',[organizationId])).rows[0].n),before+1);
 const replay=await context.request.post(base+'/api/pilot/assistant/chat/'+chatId+'/decision',{headers:{Origin:base},data:{operation:'approve',version:2,confirmed:true}});assert.equal(replay.status(),200);assert.equal(Number((await database.query('SELECT count(*) AS n FROM tasks WHERE organization_id=$1',[organizationId])).rows[0].n),before+1);
 await page.locator('[data-ask-prompt="Draft a reply"]').click();const draft=page.locator('[data-chat-action]').last();await expect(draft).toContainText('Save an unsent');const draftId=await draft.getAttribute('data-chat-action');assert.equal((await database.query('SELECT 1 FROM conversation_messages WHERE request_key=$1',[draftId])).rowCount,0);await draft.getByRole('button',{name:'Skip',exact:true}).click();await expect(draft).toContainText('skipped');assert.equal((await database.query('SELECT 1 FROM conversation_messages WHERE request_key=$1',[draftId])).rowCount,0);
 await page.locator('[data-ask-prompt="Draft a reply"]').click();const approvedDraft=page.locator('[data-chat-action]').last();await expect(approvedDraft).toContainText('Save an unsent');await expect(approvedDraft.getByRole('button',{name:'Approve',exact:true})).toBeVisible();const approvedId=await approvedDraft.getAttribute('data-chat-action');await approvedDraft.getByRole('button',{name:'Approve',exact:true}).click();await expect(approvedDraft).toContainText('approved');assert.equal((await database.query('SELECT status FROM conversation_messages WHERE request_key=$1',[approvedId])).rows[0].status,'draft');
 await page.reload();await expect(page.locator('[data-chat-action="'+chatId+'"]')).toContainText('approved');await expect(page.locator('[data-chat-action="'+draftId+'"]')).toContainText('skipped');
 const other=await context.browser()!.newContext();try{
  assert.equal((await other.request.get(base+'/api/pilot/assistant/chat')).status(),401);const userId=randomUUID(),email=userId+'@example.test';await database.query('INSERT INTO users(id,email,display_name,password_hash) SELECT $1,$2,$3,password_hash FROM users WHERE email=$4',[userId,email,'Other checker',f.config.demoAdminEmail]);await database.query("INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,'organization_admin')",[organizationId,userId]);assert.equal((await other.request.post(base+'/api/auth/login',{headers:{Origin:base},data:{email,password:f.config.demoAdminPassword}})).status(),200);assert.deepEqual((await (await other.request.get(base+'/api/pilot/assistant/chat')).json()).items,[]);assert.equal((await other.request.post(base+'/api/pilot/assistant/chat/'+chatId+'/decision',{headers:{Origin:base},data:{operation:'approve',version:2,confirmed:true}})).status(),404);
 }finally{await other.close();}
 const logs=await database.query("SELECT kind FROM operation_events WHERE organization_id=$1 AND kind LIKE 'assistant.%'",[organizationId]);for(const kind of ['assistant.proposed','assistant.edit','assistant.approve','assistant.skip'])assert(logs.rows.some(r=>r.kind===kind));
 console.log('PASS answer stream, approve/edit/skip, no premature writes, idempotent approval, per-user history and action logs');
}
