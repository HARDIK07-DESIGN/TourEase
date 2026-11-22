const fs = require('fs');

const html = fs.readFileSync('app/src/main/assets/index1.html', 'utf8');
const js = fs.readFileSync('app/src/main/assets/app.js', 'utf8');

const regex = /getElementById\(['"]([^'"]+)['"]\)/g;
let match;
const ids = new Set();
while ((match = regex.exec(js)) !== null) {
  ids.add(match[1]);
}

const missing = [];
for (const id of ids) {
  if (!html.includes(`id="${id}"`) && !html.includes(`id='${id}'`)) {
    missing.push(id);
  }
}

console.log('Total getElementById queries:', ids.size);
console.log('Missing IDs from index1.html:', missing);

