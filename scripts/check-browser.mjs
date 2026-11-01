import {spawn} from 'node:child_process';
// Dashboard smoke checks now exercise the Bento shell, saved records, approvals, drawers,
// every staff route, and public/auth regressions in independently owned scratch databases.
for(const mode of ['shell','dashboard','ask','drawer','pages','public']){
 await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/check-ui.ts',mode],{stdio:'inherit',windowsHide:true,env:process.env});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Bento '+mode+' check failed.')));});
}
