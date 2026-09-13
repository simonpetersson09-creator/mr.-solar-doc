import { readdirSync } from 'fs'
const dir='src/i18n/locales'
const files=readdirSync(dir).filter(f=>f.endsWith('.ts'))
const flat=(o:any,p='',out:Record<string,string>={})=>{for(const[k,v]of Object.entries(o)){const key=p?`${p}.${k}`:k;if(typeof v==='string')out[key]=v;else if(v&&typeof v==='object')flat(v,key,out)}return out}
const load=async(f:string)=>{const m=await import(`../${dir}/${f}`);return flat(Object.values(m)[0] as any)}
const en=await load('en.ts');const enKeys=Object.keys(en)
const watch=['welcome.disclaimer','address.zoomIn','address.zoomOut','consumption.validation.monthOutOfRange','consumption.validation.monthUneven','fuse.capacity.inputUnit','fuse.grid.twoPhase','result.revisionUsed','result.revisionsLeft','result.calculationUnavailable','meta.paywall.title','meta.paywall.description','meta.paywall.ogDescription','report.installerChecklistTitle','report.disclaimer',...Array.from({length:12},(_,i)=>`report.installerChecklistItems.${i}`)]
const ph=(s:string)=>(s.match(/\{\{\w+\}\}/g)??[]).sort().join(',')
for(const f of files){if(f==='en.ts')continue;const l=await load(f);const c=f.replace('.ts','')
 const missing=enKeys.filter(k=>!(k in l));const extra=Object.keys(l).filter(k=>!(k in en))
 const still=watch.filter(k=>l[k]===en[k]);const badph=enKeys.filter(k=>k in l&&ph(l[k])!==ph(en[k]))
 const empty=enKeys.filter(k=>k in l&&!l[k].trim())
 if(missing.length||extra.length||still.length||badph.length||empty.length)
  console.log(c,'saknade',missing.length,'extra',extra.length,'kvar-engelska',JSON.stringify(still),'platshållarfel',JSON.stringify(badph),'tomma',empty.length)
 else console.log(c,'OK')}
