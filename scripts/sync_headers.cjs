const fs = require('fs');
const path = require('path');

const baseDir = path.resolve(__dirname, '..');
const indexFile = path.join(baseDir, 'index.html');
const indexContent = fs.readFileSync(indexFile, 'utf8');

// Extract Header
const headerRegex = /<header class="nav" id="nav"[^>]*>[\s\S]*?<\/header>/i;
const headerMatch = indexContent.match(headerRegex);
const newHeader = headerMatch ? headerMatch[0] : null;

// Extract Mobile Menu
const mobileMenuRegex = /<div class="mobile-menu" id="mobile-menu"[^>]*>[\s\S]*?<\/div>/i;
const mobileMenuMatch = indexContent.match(mobileMenuRegex);
const newMobileMenu = mobileMenuMatch ? mobileMenuMatch[0] : null;

// Extract Footer
const footerRegex = /<footer class="footer"[^>]*>[\s\S]*?<\/footer>/i;
const footerMatch = indexContent.match(footerRegex);
const newFooter = footerMatch ? footerMatch[0] : null;

if (!newHeader || !newFooter || !newMobileMenu) {
  console.error('Could not extract header, mobile menu, or footer from index.html');
  process.exit(1);
}

const htmlFiles = [];

function findHtmlFiles(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        findHtmlFiles(fullPath);
      }
    } else if (fullPath.endsWith('.html') && fullPath !== indexFile) {
      htmlFiles.push(fullPath);
    }
  }
}

findHtmlFiles(baseDir);

let changedCount = 0;

for (const file of htmlFiles) {
  let content = fs.readFileSync(file, 'utf8');
  let modified = false;

  // Replace Header
  const targetHeaderRegex = /<header\b[^>]*?id="nav"[^>]*>[\s\S]*?<\/header>/i;
  if (targetHeaderRegex.test(content)) {
    content = content.replace(targetHeaderRegex, newHeader);
    modified = true;
  } else {
    // If no header found, that's unusual, but we'll try to insert it after <body>
    const bodyRegex = /<body[^>]*>/i;
    content = content.replace(bodyRegex, `$&` + '\n    ' + newHeader);
    modified = true;
  }

  // Replace Mobile Menu
  const targetMobileMenuRegex = /<div class="mobile-menu" id="mobile-menu"[^>]*>[\s\S]*?<\/div>/i;
  if (targetMobileMenuRegex.test(content)) {
    content = content.replace(targetMobileMenuRegex, newMobileMenu);
    modified = true;
  }

  // Replace Footer
  const targetFooterRegex = /<footer\b[^>]*?class="footer"[^>]*>[\s\S]*?<\/footer>/i;
  if (targetFooterRegex.test(content)) {
    content = content.replace(targetFooterRegex, newFooter);
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(file, content, 'utf8');
    changedCount++;
    console.log('Updated:', path.relative(baseDir, file));
  }
}

console.log('Done! Updated', changedCount, 'files.');
