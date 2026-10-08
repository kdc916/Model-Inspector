import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
test('model import owns its decoder and rejects late responses',()=>{
 assert.match(app,/const ticket=modelRequests\.next\(\)/);
 assert.match(app,/const loader=new LocalModelLoader\(renderer\)/);
 assert.match(app,/if\(!modelRequests\.isCurrent\(ticket\)\)return;/);
 assert.match(app,/disposeDetachedRoot\(result\?\.root,textureMapSlots\)/);
});
test('comparison import is guarded against new primary model',()=>{
 assert.match(app,/comparisonRequests\.invalidate\(\)/);
 assert.match(app,/state\.model!==originalPrimary/);
});
test('texture upload and ORM cannot overwrite newer slot requests',()=>{
 assert.match(app,/textureRequests\.isCurrent\(slot,ticket\)/);
 assert.match(app,/ORM_SLOTS\.some\(slot=>!textureRequests\.isCurrent/);
});
test('production pack import aborts on a model switch',()=>{
 assert.match(app,/activeGeneration!==state\.loadGeneration/);
 assert.match(app,/ZIP 부분 복원/);
});
