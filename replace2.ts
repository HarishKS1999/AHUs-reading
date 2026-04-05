import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');
content = content.replace(/bg-white/g, 'bg-surface-100');
content = content.replace(/border-white/g, 'border-surface-100');
fs.writeFileSync('src/App.tsx', content);
console.log('Replaced bg-white and border-white in src/App.tsx');
