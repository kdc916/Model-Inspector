import { modelStats, triangleCount, uvAttributeName, uvBounds } from './uv-utils.js';

export function inspectMeshes(meshes, channel) {
  const totals = modelStats(meshes);
  let missingUV = 0, missingNormals = 0, outUV = 0, uvElements = 0;
  let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
  for (const mesh of meshes) {
    const geo = mesh.geometry;
    const uv = geo.getAttribute(uvAttributeName(channel));
    const bounds = uvBounds(uv);
    if (!bounds) missingUV++;
    else {
      outUV += bounds.outOfRange; uvElements += bounds.count;
      minU = Math.min(minU, bounds.minU); maxU = Math.max(maxU, bounds.maxU);
      minV = Math.min(minV, bounds.minV); maxV = Math.max(maxV, bounds.maxV);
    }
    if (!geo.getAttribute('normal')) missingNormals++;
  }
  return { ...totals, missingUV, missingNormals, outUV, uvElements,
    uvBounds: Number.isFinite(minU) ? { minU, maxU, minV, maxV } : null };
}

export function drawUVLayout(canvas, meshes, channel, { exportMode = false } = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = exportMode ? '#10151c' : '#12202a'; ctx.fillRect(0, 0, w, h);
  const margin = 30, size = Math.min(w, h) - margin * 2;
  const ox = (w-size)/2, oy = (h-size)/2;
  const UVtoX = (u) => ox + u*size;
  const UVtoY = (v) => oy + (1-v)*size;
  ctx.fillStyle = '#1c2a36'; ctx.fillRect(ox, oy, size, size);
  ctx.strokeStyle = '#365064'; ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const t = i / 10; ctx.beginPath(); ctx.moveTo(ox + t*size,oy);ctx.lineTo(ox+t*size,oy+size);ctx.stroke();
    ctx.beginPath();ctx.moveTo(ox,oy+t*size);ctx.lineTo(ox+size,oy+t*size);ctx.stroke();
  }
  ctx.strokeStyle = '#9fc2ca'; ctx.lineWidth = 2; ctx.strokeRect(ox,oy,size,size);
  ctx.font = `${Math.floor(w/48)}px ui-monospace,monospace`; ctx.fillStyle = '#8eabbc';
  ctx.fillText('0',ox-17,oy+size+3);ctx.fillText('1',ox+size+6,oy+size+3);ctx.fillText('1',ox-17,oy+5);
  const colors = ['#58e8d4','#f5b96a','#9a9af7','#e78cb2','#d1e775'];
  let total = 0, skipped = 0;
  ctx.save(); ctx.beginPath();ctx.rect(ox,oy,size,size);ctx.clip();
  for (const [meshIndex, mesh] of meshes.entries()) {
    const g = mesh.geometry;
    const uv = g.getAttribute(uvAttributeName(channel));
    if (!uv) continue;
    const idx = g.index;
    const faceCount = triangleCount(g);
    const step = Math.max(1,Math.ceil(faceCount / 25000));
    ctx.strokeStyle = colors[meshIndex % colors.length];ctx.lineWidth = Math.max(0.65, w / 640);
    ctx.beginPath();
    for (let face=0; face<faceCount;face+=step) {
      let ids = [face*3, face*3+1, face*3+2];
      if (idx) ids = ids.map(x => idx.getX(x));
      if (ids.some(i => i >= uv.count)) continue;
      const coords = ids.map(i => [uv.getX(i),uv.getY(i)]);
      if (coords.some(p => !p.every(Number.isFinite))) continue;
      ctx.moveTo(UVtoX(coords[0][0]),UVtoY(coords[0][1]));
      ctx.lineTo(UVtoX(coords[1][0]),UVtoY(coords[1][1]));
      ctx.lineTo(UVtoX(coords[2][0]),UVtoY(coords[2][1]));ctx.closePath();total++;
    }
    if (step > 1) skipped += faceCount - Math.ceil(faceCount/step);
    ctx.stroke();
  }
  ctx.restore();
  return { drawnFaces: total, skippedFaces: skipped };
}
