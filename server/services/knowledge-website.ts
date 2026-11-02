import {resolve4} from 'node:dns/promises';
import {request} from 'node:https';
import {isIP} from 'node:net';
import {ApiError} from '../http/errors.js';
const invalid=()=>new ApiError(400,'WEBSITE_UNAVAILABLE','Use an approved public HTTPS page. Private addresses, redirects outside approved sites and oversized pages are not accepted.');
export function publicIPv4(address:string){
 if(isIP(address)!==4)return false;const [a,b,c]=address.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===88&&c===99)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
}
export function approvedWebsite(value:string,origins:string[]){let url:URL;try{url=new URL(value);}catch{throw invalid();}if(url.protocol!=='https:'||url.username||url.password||url.hash||url.port&&url.port!=='443'||isIP(url.hostname)||!origins.includes(url.origin))throw invalid();return url;}
export function websiteText(html:string){return html.replace(/<!--[\s\S]*?-->/g,' ').replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp|lt|gt|quot|apos);/g,v=>({'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[v]!)).replace(/&#(\d{1,7});/g,(_,v)=>{const n=Number(v);return n>0&&n<=0x10ffff?String.fromCodePoint(n):' ';}).replace(/\s+/g,' ').trim().slice(0,40000);}
export async function fetchKnowledgeWebsite(value:string,origins:string[]){
 const deadline=Date.now()+15000;let url=approvedWebsite(value,origins);
 for(let redirects=0;redirects<=2;redirects++){
  let timer:ReturnType<typeof setTimeout>|undefined;
  const addresses=await Promise.race([resolve4(url.hostname),new Promise<string[]>((_,reject)=>{timer=setTimeout(()=>reject(invalid()),Math.max(1,deadline-Date.now()));})]).finally(()=>clearTimeout(timer));
  if(!addresses.length||addresses.some(a=>!publicIPv4(a))||Date.now()>=deadline)throw invalid();
  const address=addresses[0];
  const result=await new Promise<{location?:string;text?:string}>((resolve,reject)=>{
   const req=request(url,{method:'GET',agent:false,headers:{Accept:'text/html,text/plain','Accept-Encoding':'identity','User-Agent':'OotlaKnowledgeImport/1.0'},lookup:(_host,options,callback)=>{if(options.all)callback(null,[{address,family:4}]);else callback(null,address,4);}},response=>{
    if([301,302,303,307,308].includes(response.statusCode??0)){const location=response.headers.location;response.destroy();if(!location)reject(invalid());else resolve({location});return;}
    const type=response.headers['content-type']?.split(';')[0];
    if(response.statusCode!==200||!['text/html','text/plain'].includes(type??'')||response.headers['content-encoding']&&response.headers['content-encoding']!=='identity'){response.destroy();reject(invalid());return;}
    const parts:Buffer[]=[];let bytes=0;response.on('data',part=>{bytes+=part.length;if(bytes>1024*1024){response.destroy();reject(invalid());}else parts.push(part);});response.on('error',()=>reject(invalid()));response.on('end',()=>resolve({text:websiteText(Buffer.concat(parts).toString('utf8'))}));
   });const timeout=setTimeout(()=>req.destroy(invalid()),Math.max(1,deadline-Date.now()));req.on('close',()=>clearTimeout(timeout));req.on('error',()=>reject(invalid()));req.end();
  });
  if(result.text){if(result.text.length<20)throw invalid();return{url:url.href,text:result.text};}
  if(!result.location)throw invalid();url=approvedWebsite(new URL(result.location,url).href,origins);
 }
 throw invalid();
}
