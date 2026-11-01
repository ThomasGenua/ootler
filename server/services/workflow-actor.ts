import type {PoolClient} from 'pg';
import type {AuthUser} from '../../shared/contracts.js';
import type {ServerConfig} from '../config/env.js';
import {isIsolatedDemo} from './demo-environment.js';
export async function workflowActor(c:PoolClient,config:ServerConfig,organizationId:string,membershipId:string,userId:string):Promise<AuthUser|null>{
 const r=(await c.query("SELECT m.role,u.display_name,u.email,o.name,o.environment,ARRAY(SELECT permission FROM role_permissions WHERE role_key=m.role) AS permissions FROM organization_memberships m JOIN users u ON u.id=m.user_id JOIN organizations o ON o.id=m.organization_id WHERE m.id=$1 AND m.user_id=$2 AND m.organization_id=$3 AND m.active AND u.active AND m.account_kind='staff' AND u.account_kind='staff' FOR SHARE OF m,u",[membershipId,userId,organizationId])).rows[0];
 if(!r||!r.permissions.includes('leasing.manage'))return null;
 if(r.environment==='demo'?!(await isIsolatedDemo(config,c)):config.demoMode)return null;
 return{id:userId,membershipId,name:r.display_name,email:r.email,permissions:r.permissions,sessionExpiresAt:'',organization:{id:organizationId,name:r.name,role:r.role}};
}
