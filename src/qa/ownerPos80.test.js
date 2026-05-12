/**
 * 80 kịch bản tự động — Đầu chủ & GĐ POS (POS Q1 / POS Q.5), BR-013, F9 lọc kho.
 * Chạy: npm run test
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  isSamePosAsActor,
  shouldMaskAddress,
  hasPermission,
  savePermissions,
  resetPermissions,
  DEFAULT_ROLE_PERMISSIONS,
} from '../utils/permissions';
import { filterWarehouseProperties, warehouseMyProps } from '../utils/warehouseFilter';

let lsStore;
function mockLocalStorage() {
  lsStore = {};
  globalThis.localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(lsStore, k) ? lsStore[k] : null),
    setItem: (k, v) => {
      lsStore[k] = String(v);
    },
    removeItem: (k) => {
      delete lsStore[k];
    },
    clear: () => {
      lsStore = {};
    },
  };
}

beforeEach(() => {
  mockLocalStorage();
  resetPermissions();
});

const propQ1 = { id: 'LS-00001', pos_id: 1, pos_name: 'POS Q1', address: 'Q1 Full', level1_status: 'Được duyệt', level2_status: 'Chưa niêm yết' };
const propQ5 = { id: 'LS-00002', pos_id: 3, pos_name: 'POS Q.5', address: 'Q5 Full', level1_status: 'Được duyệt', level2_status: 'Chưa niêm yết' };
const propQ1Pending = { ...propQ1, id: 'LS-P1', level1_status: 'Chờ POS duyệt' };
const propNoPos = { id: 'LS-X', pos_name: '', pos_id: null, address: 'Orphan', level1_status: 'Được duyệt', level2_status: 'Chưa niêm yết' };

describe('TC-001–TC-012 isSamePosAsActor (POS Q1 / Q.5, id string/number)', () => {
  const rows = [
    ['TC-001', propQ1, 1, 'POS Q1', true],
    ['TC-002', propQ1, '1', 'POS Q1', true],
    ['TC-003', propQ1, 1, 'POS Q.5', true],
    ['TC-004', propQ1, 2, 'POS Q.5', false],
    ['TC-005', propQ5, 3, 'POS Q.5', true],
    ['TC-006', propQ5, '3', 'POS Q.5', true],
    ['TC-007', propQ5, 1, 'POS Q1', false],
    ['TC-008', { pos_id: 1, pos_name: 'POS Q1' }, null, 'POS Q1', true],
    ['TC-009', { pos_id: 1, pos_name: 'POS Q1' }, null, '', false],
    ['TC-010', { pos_id: null, pos_name: 'POS Q1' }, null, 'POS Q1', true],
    ['TC-011', { pos_id: 1, pos_name: '  POS Q1  ' }, null, 'POS Q1', true],
    ['TC-012', {}, 1, 'POS Q1', false],
  ];
  it.each(rows)('%s', (_id, prop, pid, pname, exp) => {
    expect(isSamePosAsActor(prop, pid, pname)).toBe(exp);
  });
});

describe('TC-013–TC-032 shouldMaskAddress (BR-013, 4 actor types)', () => {
  const rows = [
    ['TC-013', 'admin', propQ1, null, '', false],
    ['TC-014', 'admin', propQ5, null, '', false],
    ['TC-015', 'sales', propQ1, 1, 'POS Q1', false],
    ['TC-016', 'sales', propQ1, '1', 'POS Q1', false],
    ['TC-017', 'sales', propQ5, 1, 'POS Q1', true],
    ['TC-018', 'sales', propQ1, 2, 'POS Q.5', true],
    ['TC-019', 'pos_manager', propQ1, 1, 'POS Q1', false],
    ['TC-020', 'pos_manager', propQ5, 1, 'POS Q1', true],
    ['TC-021', 'pos_manager', propQ5, 3, 'POS Q.5', false],
    ['TC-022', 'marketing', propQ1, null, null, true],
    ['TC-023', 'sales', propNoPos, 1, 'POS Q1', false],
    ['TC-024', 'sales', { ...propQ5, pos_id: undefined, pos_name: 'POS Q.5' }, 1, 'POS Q1', true],
    ['TC-025', 'sales', propQ5, 3, 'POS Q.5', false],
    ['TC-026', 'marketing', propQ5, null, null, true],
    ['TC-027', 'pos_manager', propQ1, 1, 'POS Q.5', false],
    ['TC-028', 'pos_manager', propQ1, 3, 'POS Q.5', true],
    ['TC-029', 'sales', propQ5, 1, '', true],
    ['TC-030', 'marketing', propQ1, null, 'POS Q.5', true],
    ['TC-031', 'sales', propQ1, null, 'POS Q1', false],
    ['TC-032', 'sales', propQ1, 1, '', false],
  ];
  it.each(rows)('%s role=%s', (_id, role, prop, pid, pname, exp) => {
    expect(shouldMaskAddress(role, prop, pid, pname)).toBe(exp);
  });
});

describe('TC-033–TC-038 OTHER_POS permission bật → không che', () => {
  beforeEach(() => {
    mockLocalStorage();
    const extra = 'PROPERTY_VIEW_ADDRESS_OTHER_POS';
    const p = { ...DEFAULT_ROLE_PERMISSIONS };
    p.sales = [...DEFAULT_ROLE_PERMISSIONS.sales, extra];
    p.pos_manager = [...DEFAULT_ROLE_PERMISSIONS.pos_manager, extra];
    p.marketing = [...DEFAULT_ROLE_PERMISSIONS.marketing, extra];
    savePermissions(p);
  });
  const rows = [
    ['TC-033', 'sales', propQ5, 1, 'POS Q1', false],
    ['TC-034', 'sales', propQ1, 3, 'POS Q.5', false],
    ['TC-035', 'pos_manager', propQ5, 1, 'POS Q1', false],
    ['TC-036', 'marketing', propQ5, null, null, false],
    ['TC-037', 'sales', propQ1, 1, 'POS Q1', false],
    ['TC-038', 'pos_manager', propQ1, 3, 'POS Q.5', false],
  ];
  it.each(rows)('%s', (_id, role, prop, pid, pname, exp) => {
    expect(shouldMaskAddress(role, prop, pid, pname)).toBe(exp);
  });
});

describe('TC-039–TC-042 hasPermission + F10 matrix (localStorage)', () => {
  it('TC-039 sales có PROPERTY_CREATE mặc định', () => {
    expect(hasPermission('sales', 'PROPERTY_CREATE')).toBe(true);
  });
  it('TC-040 pos_manager không có PROPERTY_CREATE', () => {
    expect(hasPermission('pos_manager', 'PROPERTY_CREATE')).toBe(false);
  });
  it('TC-041 Gán thêm quyền cho pos_manager', () => {
    const p = { ...DEFAULT_ROLE_PERMISSIONS, pos_manager: [...DEFAULT_ROLE_PERMISSIONS.pos_manager, 'PROPERTY_CREATE'] };
    savePermissions(p);
    expect(hasPermission('pos_manager', 'PROPERTY_CREATE')).toBe(true);
  });
  it('TC-042 resetPermissions về mặc định', () => {
    savePermissions({ sales: [] });
    expect(hasPermission('sales', 'PROPERTY_CREATE')).toBe(false);
    resetPermissions();
    expect(hasPermission('sales', 'PROPERTY_CREATE')).toBe(true);
  });
});

const baseProps = [propQ1, propQ5, propQ1Pending, propNoPos, { ...propQ1, id: 'LS-R', level1_status: 'Đã gỡ nguồn' }];

describe('TC-043–TC-062 filterWarehouseProperties (Sales Q1 / GĐ Q1 / Sales Q5 / GĐ Q5)', () => {
  const ctx = (over) => ({
    ROLE: 'sales',
    POS_NAME: 'POS Q1',
    USER_ID: 'u004',
    showRemoved: false,
    search: '',
    filterLv1: '',
    filterType: '',
    filterPOS: 'ALL',
    ...over,
  });

  it('TC-043 Sales Q1 ALL: thấy Q1 + Q5 đã duyệt + pending Q1', () => {
    const r = filterWarehouseProperties(baseProps, ctx({ USER_ID: 'u001' }));
    expect(r.map((x) => x.id).sort()).toEqual(['LS-00001', 'LS-00002', 'LS-P1', 'LS-X'].sort());
  });
  it('TC-044 Sales Q1 ALL: ẩn đã gỡ nguồn mặc định', () => {
    const r = filterWarehouseProperties(baseProps, ctx({}));
    expect(r.some((x) => x.level1_status === 'Đã gỡ nguồn')).toBe(false);
  });
  it('TC-045 showRemoved hiện gỡ nguồn', () => {
    const r = filterWarehouseProperties(baseProps, ctx({ showRemoved: true }));
    expect(r.some((x) => x.id === 'LS-R')).toBe(true);
  });
  it('TC-046 filterPOS=MINE chỉ tài sản createdBy_id', () => {
    const mine = { ...propQ1, id: 'LS-M', createdBy_id: 'u999' };
    const r = filterWarehouseProperties([...baseProps, mine], ctx({ filterPOS: 'MINE', USER_ID: 'u999' }));
    expect(r.map((x) => x.id)).toEqual(['LS-M']);
  });
  it('TC-047 filterPOS=POS Q1', () => {
    const r = filterWarehouseProperties(baseProps, ctx({ filterPOS: 'POS Q1' }));
    expect(r.every((p) => p.pos_name === 'POS Q1')).toBe(true);
  });
  it('TC-048 filterLv1=Được duyệt', () => {
    const r = filterWarehouseProperties(baseProps, ctx({ filterLv1: 'Được duyệt' }));
    expect(r.every((p) => p.level1_status === 'Được duyệt')).toBe(true);
  });
  it('TC-049 filterType=Bán', () => {
    const mixed = [...baseProps, { ...propQ1, id: 'LS-T', type: 'Thuê', level1_status: 'Được duyệt', level2_status: 'Chưa niêm yết' }];
    const r = filterWarehouseProperties(mixed, ctx({ filterType: 'Bán' }));
    expect(r.every((p) => p.type === 'Bán')).toBe(true);
  });
  it('TC-050 search theo id', () => {
    const r = filterWarehouseProperties(baseProps, ctx({ search: 'LS-00002' }));
    expect(r.map((x) => x.id)).toEqual(['LS-00002']);
  });
  it('TC-051 POS Manager Q1 ALL: thấy toàn bộ Q1 + Q5 duyệt', () => {
    const r = filterWarehouseProperties(baseProps, {
      ROLE: 'pos_manager',
      POS_NAME: 'POS Q1',
      USER_ID: 'u_pos1',
      showRemoved: false,
      search: '',
      filterLv1: '',
      filterType: '',
      filterPOS: 'ALL',
    });
    expect(r.map((x) => x.id).sort()).toEqual(['LS-00001', 'LS-00002', 'LS-P1', 'LS-X'].sort());
  });
  it('TC-052 POS Manager Q.5 ALL: thấy Q5 + Q1 đã duyệt (cross-POS)', () => {
    const r = filterWarehouseProperties(baseProps, {
      ROLE: 'pos_manager',
      POS_NAME: 'POS Q.5',
      USER_ID: 'u_pos2',
      showRemoved: false,
      search: '',
      filterLv1: '',
      filterType: '',
      filterPOS: 'ALL',
    });
    expect(r.map((x) => x.id).sort()).toEqual(['LS-00001', 'LS-00002', 'LS-X'].sort());
  });
  it('TC-053 Admin filter rỗng = tất cả', () => {
    const r = filterWarehouseProperties(baseProps, {
      ROLE: 'admin',
      POS_NAME: null,
      USER_ID: '',
      showRemoved: true,
      search: '',
      filterLv1: '',
      filterType: '',
      filterPOS: '',
    });
    expect(r.length).toBe(baseProps.length);
  });
  it('TC-054 Marketing ALL', () => {
    const r = filterWarehouseProperties(baseProps, {
      ROLE: 'marketing',
      POS_NAME: null,
      USER_ID: '',
      showRemoved: false,
      search: '',
      filterLv1: '',
      filterType: '',
      filterPOS: 'ALL',
    });
    expect(r.length).toBe(4);
  });
  it('TC-055 Q5 chờ duyệt không hiện cho GĐ Q1 ALL (chỉ duyệt+cùng POS)', () => {
    const q5wait = { ...propQ5, id: 'LS-W5', level1_status: 'Chờ POS duyệt' };
    const r = filterWarehouseProperties([...baseProps, q5wait], {
      ROLE: 'pos_manager',
      POS_NAME: 'POS Q1',
      USER_ID: 'u_pos1',
      showRemoved: false,
      search: '',
      filterLv1: '',
      filterType: '',
      filterPOS: 'ALL',
    });
    expect(r.some((x) => x.id === 'LS-W5')).toBe(false);
  });
  it('TC-056 Q1 chờ duyệt hiện cho GĐ Q1 ALL', () => {
    const r = filterWarehouseProperties(baseProps, {
      ROLE: 'pos_manager',
      POS_NAME: 'POS Q1',
      USER_ID: 'u_pos1',
      filterPOS: 'ALL',
      showRemoved: false,
      search: '',
      filterLv1: '',
      filterType: '',
    });
    expect(r.some((x) => x.id === 'LS-P1')).toBe(true);
  });
  it('TC-057 filterPOS POS Q.5 chỉ Q5', () => {
    const r = filterWarehouseProperties(baseProps, ctx({ filterPOS: 'POS Q.5', ROLE: 'pos_manager', POS_NAME: 'POS Q.5' }));
    expect(r.every((p) => p.pos_name === 'POS Q.5')).toBe(true);
  });
  it('TC-058 search địa chỉ', () => {
    const r = filterWarehouseProperties(baseProps, ctx({ search: 'Q5 Full' }));
    expect(r.some((x) => x.id === 'LS-00002')).toBe(true);
  });
  it('TC-059 không khớp search', () => {
    const r = filterWarehouseProperties(baseProps, ctx({ search: 'ZZZNONE' }));
    expect(r.length).toBe(0);
  });
  it('TC-060 Sales không thấy Q5 chờ duyệt trên ALL', () => {
    const q5wait = { ...propQ5, id: 'LS-W52', level1_status: 'Chờ POS duyệt' };
    const r = filterWarehouseProperties([...baseProps, q5wait], ctx({ filterPOS: 'ALL' }));
    expect(r.some((x) => x.id === 'LS-W52')).toBe(false);
  });
  it('TC-061 prop không có pos: vẫn vào ALL nếu đã duyệt', () => {
    const r = filterWarehouseProperties(baseProps, ctx({ filterPOS: 'ALL' }));
    expect(r.some((x) => x.id === 'LS-X')).toBe(true);
  });
  it('TC-062 filterPOS ALL + pos_manager không POS_NAME: chỉ duyệt ngoài', () => {
    const r = filterWarehouseProperties(baseProps, {
      ROLE: 'pos_manager',
      POS_NAME: '',
      USER_ID: 'x',
      showRemoved: false,
      search: '',
      filterLv1: '',
      filterType: '',
      filterPOS: 'ALL',
    });
    expect(r.map((x) => x.id).sort()).toEqual(['LS-00001', 'LS-00002', 'LS-X'].sort());
  });
});

describe('TC-063–TC-070 warehouseMyProps', () => {
  it('TC-063 admin = toàn bộ', () => {
    expect(warehouseMyProps(baseProps, 'admin', null, '').length).toBe(baseProps.length);
  });
  it('TC-064 pos_manager Q1', () => {
    const r = warehouseMyProps(baseProps, 'pos_manager', 'POS Q1', '');
    expect(r.every((p) => p.pos_name === 'POS Q1')).toBe(true);
  });
  it('TC-065 pos_manager Q.5', () => {
    const r = warehouseMyProps(baseProps, 'pos_manager', 'POS Q.5', '');
    expect(r.every((p) => p.pos_name === 'POS Q.5')).toBe(true);
  });
  it('TC-066 sales u004', () => {
    const mine = { ...propQ1, createdBy_id: 'u004' };
    const r = warehouseMyProps([mine, propQ5], 'sales', 'POS Q1', 'u004');
    expect(r.length).toBe(1);
  });
  it('TC-067 sales khác user', () => {
    const r = warehouseMyProps(baseProps, 'sales', 'POS Q1', 'NOBODY');
    expect(r.length).toBe(0);
  });
  it('TC-068 pos_manager tên rỗng', () => {
    expect(warehouseMyProps(baseProps, 'pos_manager', '', '').length).toBe(0);
  });
  it('TC-069 admin không phụ thuộc USER_ID', () => {
    expect(warehouseMyProps(baseProps, 'admin', 'POS Q1', 'x').length).toBe(baseProps.length);
  });
  it('TC-070 sales nhiều bản ghi cùng user', () => {
    const a = { ...propQ1, id: 'A', createdBy_id: 'u1' };
    const b = { ...propQ5, id: 'B', createdBy_id: 'u1' };
    expect(warehouseMyProps([a, b], 'sales', 'POS Q1', 'u1').length).toBe(2);
  });
});

describe('TC-071–TC-080 tổng hợp luồng cross-POS (địa chỉ vs danh sách)', () => {
  it('TC-071 GĐ Q.5 nhìn thấy dòng LS Q1 trong filter ALL', () => {
    const r = filterWarehouseProperties(baseProps, {
      ROLE: 'pos_manager',
      POS_NAME: 'POS Q.5',
      USER_ID: 'u_pos2',
      filterPOS: 'ALL',
      showRemoved: false,
      search: '',
      filterLv1: '',
      filterType: '',
    });
    expect(r.some((p) => p.id === 'LS-00001')).toBe(true);
  });
  it('TC-072 … nhưng BR-013 che địa chỉ Q1', () => {
    expect(shouldMaskAddress('pos_manager', propQ1, 3, 'POS Q.5')).toBe(true);
  });
  it('TC-073 … không che địa chỉ Q5', () => {
    expect(shouldMaskAddress('pos_manager', propQ5, 3, 'POS Q.5')).toBe(false);
  });
  it('TC-074 Sales Q1 che Q5', () => {
    expect(shouldMaskAddress('sales', propQ5, 1, 'POS Q1')).toBe(true);
  });
  it('TC-075 Sales Q5 không che Q5', () => {
    expect(shouldMaskAddress('sales', propQ5, 3, 'POS Q.5')).toBe(false);
  });
  it('TC-076 Sales Q5 che Q1', () => {
    expect(shouldMaskAddress('sales', propQ1, 3, 'POS Q.5')).toBe(true);
  });
  it('TC-077 GĐ Q1 không che Q1', () => {
    expect(shouldMaskAddress('pos_manager', propQ1, 1, 'POS Q1')).toBe(false);
  });
  it('TC-078 GĐ Q1 che Q5', () => {
    expect(shouldMaskAddress('pos_manager', propQ5, 1, 'POS Q1')).toBe(true);
  });
  it('TC-079 id pos tài sản dạng string khớp GĐ', () => {
    expect(isSamePosAsActor({ pos_id: '3', pos_name: 'POS Q.5' }, 3, 'POS Q.5')).toBe(true);
  });
  it('TC-080 đồng bộ pos_name trim', () => {
    expect(isSamePosAsActor({ pos_id: 1, pos_name: '  POS Q1' }, 1, 'POS Q1  ')).toBe(true);
  });
});
