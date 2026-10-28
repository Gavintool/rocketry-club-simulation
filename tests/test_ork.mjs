import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const xml=require('xml-js');
class Element {
 constructor(el){this.localName=el.name;this.attrs=el.attributes||{};this.children=(el.elements||[]).filter(x=>x.type==='element').map(x=>new Element(x));this.content=(el.elements||[]).filter(x=>x.type==='text').map(x=>x.text).join('');}
 get textContent(){return this.content+this.children.map(x=>x.textContent).join('');}
 getAttribute(name){return this.attrs[name]??null;}
 getElementsByTagName(name){return this.children.flatMap(c=>[...(c.localName===name?[c]:[]),...c.getElementsByTagName(name)]);}
}
globalThis.DOMParser=class {parseFromString(text){try{const e=xml.xml2js(text).elements.find(x=>x.type==='element');return {documentElement:new Element(e),querySelector(){return null;}};}catch{return {documentElement:null,querySelector(){return {};}};}}};
const {parseOpenRocketXML,readOrk}=await import('../ork-import.js');
const source=await readFile(new URL('./fixtures/example.ork.xml',import.meta.url),'utf8');
const model=parseOpenRocketXML(source);
assert.equal(model.name,'Test rocket');assert.ok(Math.abs(model.length-.3)<1e-10);assert.ok(Math.abs(model.diameter-.0252)<1e-10);
assert.equal(model.parts.length,3);assert.equal(model.fins.length,1);assert.equal(model.fins[0].count,4);assert.equal(model.parachute,.3);assert.equal(model.motorName,'Estes B6');
assert.throws(()=>parseOpenRocketXML('<invalid>'));assert.throws(()=>parseOpenRocketXML('<!DOCTYPE foo><openrocket/>'));
assert.throws(()=>parseOpenRocketXML(source.replace('<length>0.15</length>','<length>-1</length>')));
const JSZip=require('jszip');
const zip=new JSZip();zip.file('rocket.ork',source);const buffer=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
assert.equal((await readOrk(new Blob([buffer]),JSZip)).name,'Test rocket');
assert.equal((await readOrk(new Blob([source]),JSZip)).name,'Test rocket');
const bad=new JSZip();bad.file('nope.xml',source);const badBytes=await bad.generateAsync({type:'uint8array'});await assert.rejects(()=>readOrk(new Blob([badBytes]),JSZip),/does not contain/);
console.log('OpenRocket parser and zipped/plain import checks passed');

if(process.argv[2]){const input=await readFile(process.argv[2]);const real=await readOrk(new Blob([input]),JSZip);assert.ok(real.length>0&&real.diameter>0);assert.ok(real.parts.length>0);console.log('Additional OpenRocket archive imported successfully');}
