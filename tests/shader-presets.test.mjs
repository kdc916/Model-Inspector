import {test} from 'node:test';import assert from 'node:assert/strict';
import {SHADER_PRESETS,resolveShaderPreset} from '../src/shader-presets.js';
test('shader presets return copy not mutable shared instance',()=>{const v=resolveShaderPreset('aura');v.settings.fxNoiseStrength=9;assert.notEqual(resolveShaderPreset('aura').settings.fxNoiseStrength,9)});
test('engine inspired presets expose valid modes',()=>{assert.equal(Object.keys(SHADER_PRESETS).length,4);for(const key of Object.keys(SHADER_PRESETS)){const p=resolveShaderPreset(key);assert.equal(p.settings.fxEnabled,true);assert.ok(['add','blend'].includes(p.material.matAlphaMode))}});
test('unknown preset is ignored',()=>assert.equal(resolveShaderPreset('unknown'),null));
