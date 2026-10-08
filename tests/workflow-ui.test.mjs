import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const ids=[...html.matchAll(/\bid="([\w-]+)"/g)].map(m=>m[1]);
test('no duplicate DOM ids and app direct lookups resolve',()=>{
 assert.equal(ids.length,new Set(ids).size);
 for(const [,id] of app.matchAll(/\$\('#([\w-]+)'\)/g))assert.ok(ids.includes(id),`missing #${id}`);
});
test('production workflow controls are wired',()=>{
 for(const id of ['slotFlowSlot','slotFlowEnabled','slotFlowUV','slotFlowX','slotFlowY','slotOffsetX','slotOffsetY','slotRepeatX','slotRepeatY','flipbookEnabled','flipbookSlot','flipbookColumns','flipbookRows','flipbookFPS','flipbookLoop','matMaskChannel','matMaskInvert','matDepthTest','matDepthWrite','matCull','matBloom','matBloomStrength','matBloomRadius','matBloomThreshold','btnPresetExport','btnPresetImport','btnCompareOpen','btnQAReport','btnUVAnalyze']){
 assert.ok(html.includes(`id="${id}"`),id);assert.ok(app.includes(`'#${id}'`)||app.includes(`'${id}'`),id);
 }
 for(const mode of ['premultiply','multiply','screen'])assert.match(html,new RegExp(`value="${mode}"`));
});
test('KTX2 glTF pipeline plus standalone texture workflow',()=>{
 const loader=readFileSync(new URL('../src/model-loaders.js',import.meta.url),'utf8');
 assert.match(loader,/setKTX2Loader/);assert.match(loader,/detectSupport/);assert.match(app,/getTextureKTX2Loader/);
});
