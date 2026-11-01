import path from 'node:path';
import {createServer,type Plugin,type ViteDevServer} from 'vite';
import {isPublicPage,privatePagePaths,publicPagePaths,publicPath,publicHtmlAlias,readPublicSiteSettings,renderPublicDocument,robotsText,sitemapXml,type PublicSiteSettings} from '../shared/public-site.js';

/** Reuse the exact vanilla page renderer for every visitor, never user-agent cloaking. */
export function publicSeoPlugin(environment:Record<string,string|undefined>,projectRoot:string):Plugin {
 const buildSettings=readPublicSiteSettings(environment),clientRoot=path.join(projectRoot,'client');
 let devServer:ViteDevServer|undefined,rendererServer:ViteDevServer|undefined,command:'build'|'serve'='serve';
 let accessOrigin:string|null=null;
 const known=new Set<string>([...publicPagePaths,...privatePagePaths]);
 const settings=():PublicSiteSettings=>command==='serve'?{...buildSettings,indexing:false}:buildSettings;
 async function render(pathname:string):Promise<string>{
  const server=devServer??(rendererServer??=await createServer({configFile:false,root:clientRoot,publicDir:false,appType:'custom',logLevel:'error',server:{middlewareMode:true,hmr:false,ws:false}}));
  const pages=await server.ssrLoadModule('/pages/public.ts') as {publicPage:(path:string,demoAccess?:boolean)=>string};
  let demoAccess=false;
  if(command==='serve'&&accessOrigin){
   try{
    const response=await fetch(accessOrigin+'/api/public-access',{redirect:'error',signal:AbortSignal.timeout(1500)});
    if(response.ok&&response.headers.get('content-type')?.includes('application/json'))demoAccess=(await response.json() as {demoAccess?:unknown}).demoAccess===true;
   }catch{/* Public access defaults to ordinary sign-in when isolation cannot be checked. */}
  }
  return pages.publicPage(pathname,demoAccess);
 }
 return {
  name:'ootla-public-seo',enforce:'post',
  configResolved(config){
   command=config.command;
   const proxy=config.server.proxy?.['/api'];
   const target=typeof proxy==='string'?proxy:proxy?.target;
   try{
    const url=new URL(typeof target==='string'?target:'');
    if(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash)accessOrigin=url.origin;
   }catch{/* Never fetch an arbitrary host to resolve development presentation. */}
  },
  configureServer(server){
   devServer=server;
   server.middlewares.use((request,response,next)=>{
    const route=new URL(request.url??'/', 'http://localhost').pathname,normalized=publicPath(route),alias=publicHtmlAlias(route);
    // Component workbench exists only in Vite development, never compiled routes.
    if(route==='/design-system.html'&&(request.method==='GET'||request.method==='HEAD')){response.setHeader('X-Robots-Tag','noindex, nofollow');next();return;}
    if(alias&&(request.method==='GET'||request.method==='HEAD')){response.statusCode=308;response.setHeader('Location',alias);response.end();return;}
    if((request.method==='GET'||request.method==='HEAD')&&(normalized==='/robots.txt'||normalized==='/sitemap.xml')){
     response.statusCode=200;response.setHeader('X-Robots-Tag','noindex, follow');response.setHeader('Content-Type',normalized==='/robots.txt'?'text/plain; charset=utf-8':'application/xml; charset=utf-8');response.end(request.method==='HEAD'?'':normalized==='/robots.txt'?robotsText(settings()):sitemapXml(settings()));return;
    }
    if(!normalized.startsWith('/api')&&(!route.includes('.')||route.endsWith('.html'))&&!route.startsWith('/@')&&!route.startsWith('/node_modules')){
     response.setHeader('X-Robots-Tag',isPublicPage(normalized)?'noindex, follow':'noindex, nofollow');
     if(!known.has(normalized)){response.statusCode=404;response.setHeader('Content-Type','text/plain; charset=utf-8');response.end('Page or asset not found.');return;}
    }
    next();
   });
  },
  transformIndexHtml:{order:'post',async handler(html,context){
   if(command==='serve'&&new URL(context.originalUrl??context.path,'http://localhost').pathname==='/design-system.html')return html;
   const pathname=publicPath(new URL(context.originalUrl??context.path,'http://localhost').pathname);
   const route=command==='build'?'/':pathname;
   return renderPublicDocument(html,route,settings(),isPublicPage(route)?await render(route):'');
  }},
  async generateBundle(_options,bundle){
   const template=bundle['index.html'];if(!template||template.type!=='asset')throw Error('Built public HTML template is missing.');
   const html=String(template.source);
   for(const route of publicPagePaths){
    if(route==='/')continue;
    this.emitFile({type:'asset',fileName:route.slice(1)+'/index.html',source:renderPublicDocument(html,route,buildSettings,await render(route))});
   }
   this.emitFile({type:'asset',fileName:'app-shell.html',source:renderPublicDocument(html,'/admin/login',buildSettings,'')});
   this.emitFile({type:'asset',fileName:'robots.txt',source:robotsText(buildSettings)});
   this.emitFile({type:'asset',fileName:'sitemap.xml',source:sitemapXml(buildSettings)});
   this.emitFile({type:'asset',fileName:'public-site-manifest.json',source:JSON.stringify({version:1,...buildSettings})+'\n'});
  },
  async closeBundle(){await rendererServer?.close();rendererServer=undefined;},
  async buildEnd(error){if(error){await rendererServer?.close();rendererServer=undefined;}},
 };
}
