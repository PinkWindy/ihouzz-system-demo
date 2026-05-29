const fs = require('fs');
const path = require('path');
const dirs = ['d:/PinkWindy/ihouzz-demo/src/pages', 'd:/PinkWindy/ihouzz-demo/src/utils'];
dirs.forEach(dir => {
  fs.readdirSync(dir).forEach(file => {
    if (!file.endsWith('.js') && !file.endsWith('.jsx')) return;
    const fp = path.join(dir, file);
    let code = fs.readFileSync(fp, 'utf8');
    if (code.includes("'../config'")) {
      code = code.replace(/'\.\.\/config'/g, "'../config.js'");
      fs.writeFileSync(fp, code);
      console.log('Fixed ext', fp);
    }
  });
});
