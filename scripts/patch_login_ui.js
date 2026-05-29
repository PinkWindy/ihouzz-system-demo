const fs = require('fs');
const path = require('path');

const loginPath = path.join(__dirname, '../src/pages/Feature1_Login.jsx');
const ui = `      <div className="card shadow-lg border-0" style={{ maxWidth: '420px', width: '100%', borderRadius: '16px' }}>
        <div className="card-body p-5">
          <motionWrap />
        </motionWrap>
      </motionWrap>`;

let content = fs.readFileSync(loginPath, 'utf8');
content = content.replace(/<motionWrap\s*\/>/g, ui);
fs.writeFileSync(loginPath, content);
console.log('patched');
