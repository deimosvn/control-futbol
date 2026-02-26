/**
 * Generador de íconos PWA para RoboFútbol Control
 * Ejecutar con: node generate-icons.js
 * Requiere: npm install canvas (opcional)
 * 
 * Si no tienes 'canvas', este script genera placeholders SVG
 * que funcionan como íconos PWA
 */

const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 192, 512];
const iconsDir = path.join(__dirname, 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Generar SVG como PNG placeholder
function generateIcon(size) {
  const fontSize = Math.round(size * 0.35);
  const smallFont = Math.round(size * 0.1);
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0a0e27"/>
      <stop offset="100%" style="stop-color:#141830"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#00e5ff"/>
      <stop offset="100%" style="stop-color:#0091a1"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="url(#bg)"/>
  <circle cx="${size/2}" cy="${size * 0.42}" r="${size * 0.22}" fill="none" stroke="url(#accent)" stroke-width="${Math.max(2, size * 0.02)}"/>
  <text x="${size/2}" y="${size * 0.48}" text-anchor="middle" font-size="${fontSize}" font-family="Arial, sans-serif" fill="white">⚽</text>
  <text x="${size/2}" y="${size * 0.78}" text-anchor="middle" font-size="${smallFont}" font-family="Arial, sans-serif" font-weight="bold" fill="#00e5ff">ROBO</text>
</svg>`;

  return svg;
}

// Intentar generar PNGs con canvas, o usar SVGs
try {
  const { createCanvas } = require('canvas');
  
  sizes.forEach(size => {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    
    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#0a0e27');
    grad.addColorStop(1, '#141830');
    
    // Rounded rect
    const r = size * 0.18;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(size - r, 0);
    ctx.quadraticCurveTo(size, 0, size, r);
    ctx.lineTo(size, size - r);
    ctx.quadraticCurveTo(size, size, size - r, size);
    ctx.lineTo(r, size);
    ctx.quadraticCurveTo(0, size, 0, size - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    
    // Circle
    ctx.beginPath();
    ctx.arc(size/2, size * 0.42, size * 0.22, 0, Math.PI * 2);
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = Math.max(2, size * 0.025);
    ctx.stroke();
    
    // Soccer ball emoji (text)
    ctx.font = `${Math.round(size * 0.3)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'white';
    ctx.fillText('⚽', size/2, size * 0.42);
    
    // Text
    ctx.font = `bold ${Math.round(size * 0.1)}px Arial`;
    ctx.fillStyle = '#00e5ff';
    ctx.fillText('ROBO', size/2, size * 0.78);
    
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(path.join(iconsDir, `icon-${size}.png`), buffer);
    console.log(`✅ Generado icon-${size}.png`);
  });
  
  console.log('🎉 Todos los íconos PNG generados');
} catch (e) {
  // Fallback: generar SVGs como PNG (browser los renderizará)
  console.log('ℹ️ canvas no disponible, generando SVGs como fallback...');
  
  sizes.forEach(size => {
    const svg = generateIcon(size);
    // Guardar como SVG que se usará como ícono
    fs.writeFileSync(path.join(iconsDir, `icon-${size}.svg`), svg);
    console.log(`✅ Generado icon-${size}.svg`);
  });
  
  // Crear un HTML para generar PNGs en el navegador
  const generatorHtml = `<!DOCTYPE html>
<html><head><title>Generar Íconos</title></head>
<body style="background:#333;color:#fff;font-family:sans-serif;padding:20px">
<h1>Generador de Íconos RoboFútbol</h1>
<p>Haz clic en cada imagen para descargar como PNG</p>
<div id="icons"></div>
<script>
const sizes = [72, 96, 128, 192, 512];
const container = document.getElementById('icons');

sizes.forEach(size => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#0a0e27');
  grad.addColorStop(1, '#141830');
  
  const r = size * 0.18;
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r); ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size); ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r); ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  
  ctx.beginPath();
  ctx.arc(size/2, size * 0.42, size * 0.22, 0, Math.PI * 2);
  ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = Math.max(2, size * 0.025);
  ctx.stroke();
  
  ctx.font = Math.round(size * 0.3) + 'px Arial';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'white'; ctx.fillText('⚽', size/2, size * 0.42);
  
  ctx.font = 'bold ' + Math.round(size * 0.1) + 'px Arial';
  ctx.fillStyle = '#00e5ff'; ctx.fillText('ROBO', size/2, size * 0.78);
  
  const div = document.createElement('div');
  div.style.cssText = 'display:inline-block;margin:10px;text-align:center';
  div.innerHTML = '<p>' + size + 'x' + size + '</p>';
  
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = 'icon-' + size + '.png';
  a.appendChild(canvas);
  div.appendChild(a);
  container.appendChild(div);
});
<\/script>
</body></html>`;
  
  fs.writeFileSync(path.join(__dirname, 'generate-icons.html'), generatorHtml);
  console.log('📄 Abre generate-icons.html en el navegador para descargar PNGs');
}
