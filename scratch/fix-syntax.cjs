const fs = require('fs');
const path = require('path');
const dirs = ['d:/PinkWindy/ihouzz-demo/src/pages', 'd:/PinkWindy/ihouzz-demo/src/utils'];
dirs.forEach(dir => {
  fs.readdirSync(dir).forEach(file => {
    if (!file.endsWith('.js') && !file.endsWith('.jsx')) return;
    const fp = path.join(dir, file);
    let code = fs.readFileSync(fp, 'utf8');
    if (code.includes('API_BASE_URL')) {
      // Remove all faulty imports
      code = code.replace(/import \{ API_BASE_URL \} from '\.\.\/config';\n/g, '');
      // Insert at the absolute top
      code = "import { API_BASE_URL } from '../config';\n" + code;
      fs.writeFileSync(fp, code);
      console.log('Fixed', fp);
    }
  });
});
