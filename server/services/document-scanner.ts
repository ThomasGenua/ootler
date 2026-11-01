import {createConnection} from 'node:net';
import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {ServerConfig} from '../config/env.js';
import {ApiError} from '../http/errors.js';
import {isIsolatedDemo} from './demo-environment.js';
import {maximumDocumentBytes} from '../../shared/lead-workspace-contracts.js';
let active=0;
/** clamd INSTREAM: NUL-framed command, bounded big-endian chunks, explicit terminator. */
export async function clamScan(content:Buffer,host:string,port:number,timeoutMs=15000):Promise<void>{
 if(active>=4)throw new ApiError(503,'SCANNER_BUSY','Document scanning is busy. Try again shortly.');active++;
 try{await new Promise<void>((resolve,reject)=>{
  const socket=createConnection({host,port});let reply=Buffer.alloc(0),finished=false,offset=-1;
  const finish=(error?:Error)=>{if(finished)return;finished=true;clearTimeout(timer);socket.destroy();error?reject(error):resolve();};
  const unavailable=()=>finish(new ApiError(503,'SCANNER_UNAVAILABLE','The document scanner is unavailable. The file was not saved.'));
  const timer=setTimeout(unavailable,timeoutMs);socket.once('error',unavailable);socket.once('close',()=>{if(!finished)unavailable();});
  const pump=()=>{try{while(!finished&&offset<=content.length){let chunk:Buffer;if(offset===-1){chunk=Buffer.from('zINSTREAM\0');offset=0;}else if(offset===content.length){chunk=Buffer.alloc(4);offset++;}else{const end=Math.min(offset+65536,content.length),header=Buffer.alloc(4);header.writeUInt32BE(end-offset);chunk=Buffer.concat([header,content.subarray(offset,end)]);offset=end;}if(!socket.write(chunk)){socket.once('drain',pump);return;}}}catch{unavailable();}};
  socket.once('connect',pump);socket.on('data',data=>{reply=Buffer.concat([reply,data]);if(reply.length>4096)return unavailable();const end=reply.indexOf(0);if(end===-1)return;const result=reply.subarray(0,end).toString('utf8');if(result==='stream: OK')finish();else if(/^stream: .+ FOUND$/.test(result))finish(new ApiError(422,'DOCUMENT_REJECTED','The scanner rejected this file. Choose a clean replacement.'));else unavailable();});
 });}finally{active--;}
}
/** Set an attestation tied to these exact bytes, scoped to the upload transaction. */
export async function scanDocument(config:ServerConfig,c:PoolClient,content:Buffer):Promise<'clamav'|'demo'>{
 if(!Buffer.isBuffer(content)||!content.length||content.length>maximumDocumentBytes)throw new ApiError(413,'INVALID_DOCUMENT','Choose a nonempty document up to 20 MiB.');
 let engine:'clamav'|'demo';
 if(config.documentScanner.host){await clamScan(content,config.documentScanner.host,config.documentScanner.port);engine='clamav';}
 else if(await isIsolatedDemo(config,c)){if(content.includes(Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')))throw new ApiError(422,'DOCUMENT_REJECTED','The demo scan rejected the test file.');engine='demo';}
 else throw new ApiError(503,'SCANNER_NOT_CONFIGURED','Configure the document scanner before accepting private uploads. The file was not saved.');
 await c.query("SELECT set_config('ootla.file_scan',$1,true)",[JSON.stringify({engine,sha256:createHash('sha256').update(content).digest('hex')})]);return engine;
}
