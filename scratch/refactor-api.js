import fs from 'fs';
import path from 'path';

const SRC_DIR = 'd:/PinkWindy/ihouzz-demo/src';
const TARGET_DIRS = ['pages', 'utils'];

function refactorFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let originalContent = content;

  // Track if we need to add the import
  let needsImport = false;

  // Case 1: Constant definition e.g. const API = 'http://localhost:5000';
  if (content.includes("const API = 'http://localhost:5000';") || content.includes("export const API = 'http://localhost:5000';")) {
      content = content.replace(/const API = 'http:\/\/localhost:5000';/g, "const API = API_BASE_URL;");
      content = content.replace(/export const API = 'http:\/\/localhost:5000';/g, "export const API = API_BASE_URL;");
      needsImport = true;
  }

  // Case 2: String literals e.g. axios.get('http://localhost:5000/properties')
  // We'll replace 'http://localhost:5000' with API_BASE_URL + '' or similar. 
  // Wait, better yet, `API_BASE_URL` without quotes if there's no trailing slash inside the string, but string literal concatenation is safer: `${API_BASE_URL}`
  // Let's replace 'http://localhost:5000/something' with `${API_BASE_URL}/something` using template literals.
  const stringLiteralRegex = /'http:\/\/localhost:5000([^']*)'/g;
  if (stringLiteralRegex.test(content)) {
    content = content.replace(stringLiteralRegex, "`\\${API_BASE_URL}$1`");
    needsImport = true;
  }

  // Case 3: Template literals e.g. `http://localhost:5000/properties/${id}`
  const templateLiteralRegex = /http:\/\/localhost:5000/g;
  // If it's inside a template literal (already uses backticks), we just inject ${API_BASE_URL}
  // Let's check for it in backticks.
  const backtickRegex = /`http:\/\/localhost:5000([^`]*)`/g;
  if (backtickRegex.test(content)) {
    content = content.replace(backtickRegex, "`\\${API_BASE_URL}$1`");
    needsImport = true;
  }
  
  // Wait, what if it's already a backtick like `http://localhost:5000...`? The above backtickRegex catches it.
  
  if (needsImport) {
    // Determine relative path to src/config.js
    const relativePathToSrc = path.relative(path.dirname(filePath), SRC_DIR);
    let importPath = path.posix.join(relativePathToSrc, 'config');
    if (!importPath.startsWith('.')) {
        importPath = './' + importPath;
    }
    
    // Check if import already exists
    if (!content.includes("import { API_BASE_URL }")) {
      const importStatement = `import { API_BASE_URL } from '${importPath}';\n`;
      // Insert after React imports if they exist, otherwise at top
      if (content.startsWith('import')) {
        const lastImportIndex = content.lastIndexOf('import ');
        const nextLine = content.indexOf('\n', lastImportIndex);
        content = content.slice(0, nextLine + 1) + importStatement + content.slice(nextLine + 1);
      } else {
        content = importStatement + content;
      }
    }
    
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Updated: ${filePath}`);
  }
}

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      scanDir(fullPath);
    } else if (fullPath.endsWith('.jsx') || fullPath.endsWith('.js')) {
      refactorFile(fullPath);
    }
  }
}

TARGET_DIRS.forEach(dir => scanDir(path.join(SRC_DIR, dir)));
console.log('Done!');
