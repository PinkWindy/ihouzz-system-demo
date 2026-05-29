const fs = require('fs');
const db = JSON.parse(fs.readFileSync('db.json', 'utf8'));
const formatId = (id) => {
  if (!id) return '';
  const s = String(id);
  const m = s.match(/^(\d+)$/);
  if (m) return 'LS-' + s.padStart(5, '0');
  if (s.match(/^LS-\d+$/i)) return 'LS-' + String(parseInt(s.split('-')[1], 10)).padStart(5, '0');
  return s;
};

const formatDt = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const header = [
  'Mã tài sản', 'Loại', 'Địa chỉ', 'Trạng thái Kho', 'Trạng thái Niêm yết', 'POS', 
  'Người tạo', 'Thời gian tạo', 'Người quản lý tài sản', 'Người duyệt LV1 (Giám đốc Pos)', 
  'Thời gian duyệt', 'Người duyệt lv2 (nhân viên marketing duyệt tin đăng)', 
  'Thời gian duyệt đăng tin', 'Thời gian hết hạn tin đăng', 'Người cập nhật tài sản', 
  'Thời gian đề xuất', 'Người duyệt cập nhật tài sản', 'Thời gian duyệt cập nhật tài sản', 
  'Người đề xuất Gỡ tin đăng', 'Thời gian gửi đề xuất gỡ tin', 'Người duyệt Gỡ tin', 
  'Thời gian duyệt gỡ tin', 'Người đề xuất Gỡ nguồn', 'Thời gian đề xuất Gỡ nguồn', 
  'Người duyệt đề xuất Gỡ nguồn', 'Thời gian duyệt đề xuất Gỡ nguồn'
];

const csv = [header.join(',')];

db.properties.forEach(p => {
  const lsts = db.listings.filter(l => String(l.property_id) === String(p.id) || String(l.property_id) === String(p.propertyCode));
  lsts.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const l = lsts.length > 0 ? lsts[0] : {};

  const row = [
    formatId(p.propertyCode || p.id),
    p.type || '',
    p.address || '',
    p.level1_status || '',
    p.level2_status || '',
    p.pos_name || '',
    p.createdBy || '',
    formatDt(p.createdAt),
    p.manager_name || '',
    p.approvedBy || '',
    formatDt(p.approvedAt),
    p.mktApproveBy || l.approvedBy || '',
    formatDt(p.mktApproveAt || l.approvedAt),
    formatDt(l.expiredAt),
    p.update_requested_by || '',
    formatDt(p.update_requested_at),
    p.update_approved_by || '',
    formatDt(p.update_approved_at),
    l.unlistRequestedBy || l.rejectedBy || '',
    formatDt(l.unlistRequestedAt || l.rejectedAt),
    l.approvedUnlistBy || '',
    formatDt(l.approvedUnlistAt),
    p.unsourceRequestedBy || '',
    formatDt(p.unsourceRequestedAt),
    p.unsourceApprovedBy || '',
    formatDt(p.unsourceApprovedAt)
  ];
  csv.push(row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
});

fs.writeFileSync('Bao_Cao_Tong_Hop_iHouzz.csv', '\uFEFF' + csv.join('\n'));
console.log('Created Bao_Cao_Tong_Hop_iHouzz.csv');