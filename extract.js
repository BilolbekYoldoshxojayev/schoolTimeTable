const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const tabs = ['substitution', 'directory', 'daily', 'news', 'login', 'api', 'docs'];
if (!fs.existsSync('public/pages')) fs.mkdirSync('public/pages');

let newHtml = html;
for (const tab of tabs) {
  const startTag = '<section id="tab-content-' + tab + '"';
  const startIdx = newHtml.indexOf(startTag);
  if (startIdx === -1) continue;
  
  // Find matching closing </section>
  let endIdx = startIdx;
  let depth = 0;
  let pos = startIdx;
  
  while (pos < newHtml.length) {
    if (newHtml.substr(pos, 9) === '<section ' || newHtml.substr(pos, 9) === '<section>') depth++;
    if (newHtml.substr(pos, 10) === '</section>') {
      depth--;
      if (depth === 0) {
        endIdx = pos + 10;
        break;
      }
    }
    pos++;
  }
  
  if (endIdx > startIdx) {
    let content = newHtml.substring(startIdx, endIdx);
    
    // Remove the hidden class from the section so it's visible when loaded
    content = content.replace('class="tab-pane hidden', 'class="tab-pane');
    
    fs.writeFileSync('public/pages/' + tab + '.html', content);
    
    newHtml = newHtml.substring(0, startIdx) + newHtml.substring(endIdx);
  }
}

// Ensure there is a router-view placeholder
if (newHtml.indexOf('id="router-view"') === -1) {
  const mainEndIdx = newHtml.indexOf('</main>');
  newHtml = newHtml.substring(0, mainEndIdx) + '    <div id="router-view" class="flex-1 min-h-0 h-full flex flex-col"></div>\n  ' + newHtml.substring(mainEndIdx);
}

fs.writeFileSync('public/index.html', newHtml);
console.log('Extraction complete!');
