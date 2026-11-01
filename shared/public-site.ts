/** Public marketing SEO only. No user, organization or provider data belongs here. */
export const publicPages = {
  '/': {title:'Real Estate AI Assistant & Leasing CRM | OotlaAI',description:'Explore OotlaAI, an AI-assisted real estate CRM for leasing enquiries, viewing follow-ups, applications and resident support. Try scripted examples.',name:'Real estate AI assistant'},
  '/platform': {title:'AI-Assisted Real Estate CRM Platform | OotlaAI',description:'Keep property leads, viewings, applications and staff tasks connected in OotlaAI. Explore the real estate CRM platform and its AI workflow examples.',name:'Real estate CRM platform'},
  '/ai-workflows': {title:'AI Leasing & Property Management Assistant | OotlaAI',description:'Explore scripted AI assistant workflows for resident requests, staff reminders and prospect viewings, including SMS, phone and staff handoff examples.',name:'AI assistant workflows'},
  '/workflows/leasing': {title:'AI-Assisted Leasing & Viewing Workflows | OotlaAI',description:'Follow the leasing journey from property enquiry to viewing, application documents and staff review, with clear examples of how OotlaAI can help.',name:'Leasing workflow'},
  '/workflows/resident-support': {title:'AI Resident Support & Property Workflows | OotlaAI',description:'See how OotlaAI can support resident requests, maintenance handoffs, renewal conversations and existing-provider payment guidance. Scripted examples.',name:'Resident support workflow'},
  '/integrations': {title:'Yardi-Ready CRM & Property Integrations | OotlaAI',description:'Explore Yardi-ready integration, Google Calendar and standalone CRM imports. Live activation depends on licensed interfaces, permissions and setup.',name:'Property integrations'},
  '/contact': {title:'Contact Ootla | Real Estate AI Assistant',description:'Talk to Ootla about AI-assisted real estate workflows, leasing, resident support and CRM onboarding. Contact our team or explore the demo.',name:'Contact Ootla'},
  '/privacy': {title:'Development Preview Privacy & Access | OotlaAI',description:'Learn how the OotlaAI preview handles staff and applicant access, private documents, essential sessions and scripted public AI demonstrations.',name:'Preview privacy'},
} as const;
export type PublicPagePath = keyof typeof publicPages;
export const publicPagePaths = Object.keys(publicPages) as PublicPagePath[];
export const privatePagePaths = [
 '/admin/login','/admin','/admin/leads','/admin/contacts','/admin/properties','/admin/applications','/admin/calendar',
 '/admin/tasks','/admin/imports','/admin/profile','/admin/settings','/admin/analytics','/admin/ai','/admin/integrations',
 '/admin/vendor-work','/admin/inspections','/admin/notifications','/admin/resident-documents','/admin/property-insights',
 '/admin/maintenance','/admin/renewals','/admin/vacancies','/admin/duplicates','/admin/response-targets','/admin/attention',
 '/admin/intake','/admin/inbox','/admin/automations','/admin/residents','/admin/workspace','/admin/knowledge','/admin/reports',
 '/admin/team','/admin/onboarding','/staff/access',
 '/applicant','/applicant/login','/applicant/invite','/payment-demo','/book',
] as const;
export type PublicSiteSettings = {origin:string|null;indexing:boolean};
export function publicPath(path:string): string {return path.replace(/\/+$/,'') || '/';}
export function isPublicPage(path:string):path is PublicPagePath {return Object.hasOwn(publicPages,path);}
export function readPublicSiteSettings(environment:Record<string,string|undefined>):PublicSiteSettings {
 const value=(environment.PUBLIC_SITE_URL??'').trim();
 const flag=environment.PUBLIC_SITE_INDEXING??'false';
 if(!['true','false'].includes(flag))throw Error('PUBLIC_SITE_INDEXING must be true or false.');
 let origin:string|null=null;
 if(value){
  let parsed:URL;try{parsed=new URL(value);}catch{throw Error('PUBLIC_SITE_URL must be an HTTPS origin.');}
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash||['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))throw Error('PUBLIC_SITE_URL must be a public HTTPS origin without a path, credentials, query or fragment.');
  origin=parsed.origin;
 }
 if(flag==='true'&&!origin)throw Error('Set the verified PUBLIC_SITE_URL before enabling public indexing.');
 return {origin,indexing:flag==='true'&&origin!==null};
}
function escape(value:string):string{return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
export function publicStructuredData(path:PublicPagePath,settings:PublicSiteSettings):Record<string,unknown> {
 const page=publicPages[path],origin=settings.origin;
 const organization={'@type':'Organization',name:'Ootla',...(origin?{'@id':origin+'/#organization',url:origin+'/',logo:origin+'/brand/ootla-wordmark.png'}:{})};
 const website={'@type':'WebSite',name:'OotlaAI',alternateName:'Ootla',inLanguage:'en',...(origin?{'@id':origin+'/#website',url:origin+'/',publisher:{'@id':origin+'/#organization'}}:{})};
 const webpage={'@type':'WebPage',name:page.title,description:page.description,inLanguage:'en',...(origin?{'@id':origin+path+'#webpage',url:origin+path,isPartOf:{'@id':origin+'/#website'},about:{'@id':origin+'/#organization'}}:{})};
 const graph:Record<string,unknown>[]=[organization,website,webpage];
 if(origin&&path!=='/')graph.push({'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'OotlaAI',item:origin+'/'},{'@type':'ListItem',position:2,name:page.name,item:origin+path}]});
 return {'@context':'https://schema.org','@graph':graph};
}
export function seoHead(path:string,settings:PublicSiteSettings):string {
 const publicPage=isPublicPage(path),page=publicPage?publicPages[path]:null;
 const title=page?.title??'Private workspace | OotlaAI';
 const description=page?.description??'Sign in to your authorized Ootla workspace. Private staff, applicant and booking records are not public search content.';
 const robots=publicPage?(settings.indexing?'index, follow, max-image-preview:large':'noindex, follow'):'noindex, nofollow';
 const tag=(attributes:string)=>'<meta data-ootla-seo '+attributes+' />';
 let html='<title data-ootla-seo>'+escape(title)+'</title>\n'+tag('name="description" content="'+escape(description)+'"')+'\n'+tag('name="robots" content="'+robots+'"')+'\n'+tag('name="ootla:site-origin" content="'+escape(settings.origin??'')+'"')+'\n'+tag('name="ootla:indexing" content="'+settings.indexing+'"');
 if(publicPage&&page){
  html+='\n'+tag('property="og:type" content="website"')+'\n'+tag('property="og:site_name" content="OotlaAI"')+'\n'+tag('property="og:title" content="'+escape(title)+'"')+'\n'+tag('property="og:description" content="'+escape(description)+'"')+'\n'+tag('name="twitter:card" content="summary_large_image"')+'\n'+tag('name="twitter:title" content="'+escape(title)+'"')+'\n'+tag('name="twitter:description" content="'+escape(description)+'"');
  if(settings.origin){
   const canonical=settings.origin+path,image=settings.origin+'/brand/ootla-wordmark.png';
   html+='\n<link data-ootla-seo rel="canonical" href="'+escape(canonical)+'" />\n'+tag('property="og:url" content="'+escape(canonical)+'"')+'\n'+tag('property="og:image" content="'+escape(image)+'"')+'\n'+tag('property="og:image:alt" content="Ootla brand logo"')+'\n'+tag('property="og:image:width" content="1944"')+'\n'+tag('property="og:image:height" content="809"')+'\n'+tag('name="twitter:image" content="'+escape(image)+'"');
  }
  html+='\n<script data-ootla-seo type="application/ld+json">'+JSON.stringify(publicStructuredData(path as PublicPagePath,settings)).replace(/</g,'\\u003c')+'</script>';
 }
 return html;
}
export function renderPublicDocument(template:string,path:string,settings:PublicSiteSettings,content=''):string {
 if(!template.includes('<!--ootla-seo:start-->')||!template.includes('<!--ootla-public:start-->'))throw Error('Public HTML template markers are missing.');
 return template.replace(/<!--ootla-seo:start-->[\s\S]*?<!--ootla-seo:end-->/,'<!--ootla-seo:start-->\n'+seoHead(path,settings)+'\n<!--ootla-seo:end-->')
  .replace(/<!--ootla-public:start-->[\s\S]*?<!--ootla-public:end-->/,'<!--ootla-public:start-->'+content+'<!--ootla-public:end-->')
  .replace(/<body(?:\s[^>]*)?>/,isPublicPage(path)?'<body class="public-body">':'<body>');
}
export function robotsText(settings:PublicSiteSettings):string {
 return 'User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /applicant\nDisallow: /staff\nDisallow: /book\nDisallow: /api\n'+(settings.indexing&&settings.origin?'\nSitemap: '+settings.origin+'/sitemap.xml\n':'\n# Preview indexing is disabled through page metadata and HTTP headers.\n');
}
export function sitemapXml(settings:PublicSiteSettings):string {
 return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+(settings.indexing&&settings.origin?publicPagePaths.map(path=>'\n<url><loc>'+escape(settings.origin!+path)+'</loc></url>').join(''):'')+'\n</urlset>\n';
}
export function publicHtmlAlias(path:string):string|null {
 if(path==='/index.html')return '/';
 for(const route of publicPagePaths)if(route!=='/'&&(path===route+'/index.html'||path===route+'/'))return route;
 return null;
}
