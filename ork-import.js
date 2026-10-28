// OpenRocket .ork import, deliberately limited to a single axial stack.
const MAX_FILE = 10 * 1024 * 1024, MAX_XML = 5 * 1024 * 1024;
const child = (el, name) => Array.from(el?.children || []).find(e => e.localName === name);
const children = (el, name) => Array.from(el?.children || []).filter(e => e.localName === name);
const value = (el, name) => child(el,name)?.textContent?.trim() || '';
function number(el,name) {
  const raw=value(el,name).replace(/^auto\s+/i,'');
  if(!raw || raw==='auto')return null;
  const n=Number(raw);return Number.isFinite(n)?n:null;
}
function offset(el, parentLength, componentLength) {
  const node=child(el,'axialoffset') || child(el,'position');
  if(!node)return 0;
  const n=Number(node.textContent.trim()); if(!Number.isFinite(n))return 0;
  const method=node.getAttribute('method') || node.getAttribute('type') || 'top';
  if(method==='bottom')return parentLength-componentLength+n;
  if(method==='middle')return (parentLength-componentLength)/2+n;
  return n;
}
export function parseOpenRocketXML(text) {
  if(!text || text.length>MAX_XML || /<!DOCTYPE|<!ENTITY/i.test(text))throw Error('This file is empty, too large, or contains an unsupported XML declaration.');
  const doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.querySelector('parsererror') || doc.documentElement?.localName!=='openrocket')throw Error('This is not a valid OpenRocket design XML file.');
  const root=child(doc.documentElement,'rocket');if(!root)throw Error('No rocket design was found in this file.');
  const stages=children(child(root,'subcomponents'),'stage');
  if(!stages.length)throw Error('No axial stage found in this design.');
  const warnings=[];
  if(stages.length>1)warnings.push('Multiple stages detected: only the first axial stage is imported.');
  const source=child(stages[0],'subcomponents');
  const types=new Set(['nosecone','bodytube','transition']);
  const stack=Array.from(source?.children || []).filter(e=>types.has(e.localName));
  if(!stack.length)throw Error('No supported nose cone, body tube, or transition found in the first stage.');
  let cursor=0,maxRadius=0;const parts=[], fins=[];
  for(const e of stack){
    const len=number(e,'length');if(!(len>0))throw Error('A body component has a missing or invalid length.');
    const tag=e.localName;
    if(tag==='nosecone' && value(e,'isflipped')==='true')warnings.push('Flipped nose cone is approximated as a normal nose cone.');
    let topR=tag==='nosecone'?0:(tag==='transition'?number(e,'foreradius'):number(e,'radius'));
    let bottomR=tag==='nosecone'?number(e,'aftradius'):(tag==='transition'?number(e,'aftradius'):number(e,'radius'));
    // A plain "auto" radius can be inferred from a neighbouring component.
    const r=number(e,'radius') ?? number(e,'aftradius') ?? number(e,'foreradius');
    if(tag==='bodytube')topR=bottomR=r;
    if(tag==='nosecone')bottomR ??= maxRadius || null;
    if(tag==='transition'){topR ??= maxRadius||null;bottomR ??= topR;}
    const positionNode=child(e,'axialoffset')||child(e,'position');
    const absolute=(positionNode?.getAttribute('method')||positionNode?.getAttribute('type'))==='absolute';
    const base=(absolute?0:cursor)+offset(e,0,0);
    if(base<0)throw Error('A body component extends ahead of the supported stage origin.');
    parts.push({type:tag,start:base,length:len,topRadius:topR,bottomRadius:bottomR,shape:value(e,'shape'),flipped:value(e,'isflipped')==='true'});
    maxRadius=Math.max(maxRadius,topR||0,bottomR||0);cursor=Math.max(cursor,base+len);
    for(const f of Array.from(child(e,'subcomponents')?.children || []).filter(c=>['trapezoidfinset','freeformfinset','ellipticalfinset'].includes(c.localName))){
      let pts=[];const pointList=child(f,'finpoints');
      if(pointList)pts=children(pointList,'point').map(p=>[Number(p.getAttribute('x')),Number(p.getAttribute('y'))]).filter(p=>p.every(Number.isFinite));
      else if(f.localName==='trapezoidfinset'){
        const root=number(f,'rootchord'),tip=number(f,'tipchord'),span=number(f,'height'),sweep=number(f,'sweeplength')??0;
        if(root>0&&tip>=0&&span>0)pts=[[0,0],[sweep,span],[sweep+tip,span],[root,0]];
      }
      if(pts.length<3){warnings.push('A fin set shape is unsupported or incomplete and was omitted.');continue;}
      const chord=Math.max(...pts.map(p=>p[0]))-Math.min(...pts.map(p=>p[0]));
      const local=offset(f,len,chord),count=Math.min(12,Math.max(1,Math.round(number(f,'fincount') ?? number(f,'instancecount') ?? 3)));
      fins.push({start:base+local,radius:bottomR||r||0,points:pts,count,thickness:number(f,'thickness')||.002,rotation:number(f,'rotation')||0});
    }
  }
  // Resolve auto radii using the closest known adjacent radius.
  for(let i=0;i<parts.length;i++){
    const p=parts[i],near=parts[i-1]?.bottomRadius||parts[i+1]?.topRadius||parts[i+1]?.bottomRadius||maxRadius;
    if(p.type!=='nosecone')p.topRadius??=near;p.bottomRadius??=near;
    if(!(p.bottomRadius>0) || (p.type!=='nosecone'&&!(p.topRadius>0)))throw Error('Could not determine the body radius. Save the design with resolved dimensions.');
    maxRadius=Math.max(maxRadius,p.topRadius||0,p.bottomRadius||0);
  }
  for(const f of fins)if(!f.radius)f.radius=maxRadius;
  if(!(cursor>=.03&&cursor<=4&&maxRadius*2>=.01&&maxRadius*2<=.3&&cursor>=maxRadius*6))throw Error('This rocket’s dimensions fall outside the simulator’s supported range.');
  const parachutes=Array.from(stages[0].getElementsByTagName('parachute'));
  const chute=parachutes.length?number(parachutes[0],'diameter'):null;
  const motor=Array.from(stages[0].getElementsByTagName('motor'))[0];
  const motorName=motor?[value(motor,'manufacturer'),value(motor,'designation')].filter(Boolean).join(' '):'';
  const unsupported=Array.from(source?.children||[]).filter(e=>!types.has(e.localName));
  if(unsupported.length)warnings.push('Unsupported external components may be missing from the 3D model.');
  if(parachutes.length>1)warnings.push('Multiple parachutes found; the first is used.');
  if(chute!==null && (chute<.1||chute>3))warnings.push('The parachute diameter is outside supported limits; the existing value is retained.');
  return {name:value(root,'name')||'Imported rocket',length:cursor,diameter:maxRadius*2,parts,fins,
    parachute:chute>=.1&&chute<=3?chute:null,hasParachute:parachutes.length>0,motorName,warnings};
}
export async function readOrk(file, zip=globalThis.JSZip) {
  if(!file || file.size>MAX_FILE)throw Error('Choose an .ork file smaller than 10 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer());let xmlBytes;
  if(bytes[0]===0x50&&bytes[1]===0x4b){
    if(!zip)throw Error('ZIP support could not be loaded. Reload the page and try again.');
    let archive;try{archive=await zip.loadAsync(bytes);}catch{throw Error('The .ork ZIP archive is damaged or unsupported.');}
    const entry=archive.file('rocket.ork');if(!entry)throw Error('The archive does not contain rocket.ork.');
    if(entry._data?.uncompressedSize>MAX_XML)throw Error('The rocket XML is too large.');
    xmlBytes=await entry.async('uint8array');
  }else if(bytes[0]===0x1f&&bytes[1]===0x8b){
    if(typeof DecompressionStream==='undefined')throw Error('This browser cannot open gzip-compressed .ork files.');
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const reader=stream.getReader(),chunks=[];let total=0;
    while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>MAX_XML){await reader.cancel();throw Error('The rocket XML is too large.');}chunks.push(value);}
    xmlBytes=new Uint8Array(total);let at=0;for(const c of chunks){xmlBytes.set(c,at);at+=c.length;}
  }else xmlBytes=bytes;
  if(xmlBytes.length>MAX_XML)throw Error('The rocket XML is too large.');
  return parseOpenRocketXML(new TextDecoder('utf-8',{fatal:true}).decode(xmlBytes));
}
