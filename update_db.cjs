const fs = require('fs');
const dbPath = 'd:/PinkWindy/ihouzz-demo/db.json';
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

const directions = ['Đông', 'Tây', 'Nam', 'Bắc', 'Đông Nam', 'Đông Bắc', 'Tây Nam', 'Tây Bắc'];
const conditions = ['Nhà mới', 'Đang sử dụng', 'Cần cải tạo'];
const sources = ['Chuyển nhượng', 'Dự án', 'Cá nhân'];
const furnitures = ['Đầy đủ', 'Cơ bản', 'Nhà trống'];

db.properties = db.properties.map(p => {
  return {
    ...p,
    direction: p.direction || directions[Math.floor(Math.random() * directions.length)],
    condition: p.condition || conditions[Math.floor(Math.random() * conditions.length)],
    source: p.source || sources[Math.floor(Math.random() * sources.length)],
    furniture: p.furniture || furnitures[Math.floor(Math.random() * furnitures.length)],
    floor: p.floor || Math.floor(Math.random() * 30) + 1,
    priceUnit: p.priceUnit || 'VNĐ'
  };
});

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log('Done updating db.json');
