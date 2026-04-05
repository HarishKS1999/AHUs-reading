import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');
content = content.replace(/text-white/g, 'text-surface-50');
content = content.replace(/white\/5/g, 'surface-100/5');
content = content.replace(/white\/10/g, 'surface-100/10');
fs.writeFileSync('src/App.tsx', content);
console.log('Replaced colors in src/App.tsx');
