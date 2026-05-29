import { describe, it, expect } from 'vitest';
import {
  validateStructuredAddress,
  validatePropertySubmit,
  findDuplicateProperties,
  buildFullAddress,
} from './propertyCreateWorkflow';

const baseAddr = {
  province: 'TP.HCM',
  district: 'Quận 7',
  ward: 'Tân Thuận Đông',
  houseNumber: '12',
  street: 'Nguyễn Bình',
};

describe('validateStructuredAddress', () => {
  it('từ chối thiếu Phường', () => {
    const r = validateStructuredAddress({ ...baseAddr, ward: '' });
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('Phường/Xã');
  });
});

describe('findDuplicateProperties', () => {
  const props = [
    {
      id: 'LS-00001',
      type: 'Bán',
      district: 'Quận 7',
      ward: 'Tân Thuận Đông',
      address: '12 đường Nguyễn Bình, Tân Thuận Đông, Quận 7',
      level1_status: 'Được duyệt',
    },
    {
      id: 'LS-00002',
      type: 'Bán',
      district: 'Quận 7',
      ward: 'Khác',
      address: '12 đường Nguyễn Bình, Khác, Quận 7',
      level1_status: 'Được duyệt',
    },
  ];

  it('tìm trùng cùng quận + phường + số nhà + đường', () => {
    const dups = findDuplicateProperties(props, { type: 'Bán', address: baseAddr });
    expect(dups).toHaveLength(1);
    expect(dups[0].id).toBe('LS-00001');
  });

  it('bỏ qua khi excludeId', () => {
    const dups = findDuplicateProperties(props, {
      type: 'Bán',
      address: baseAddr,
      excludeId: 'LS-00001',
    });
    expect(dups).toHaveLength(0);
  });

  it('bỏ qua Cho thuê', () => {
    expect(findDuplicateProperties(props, { type: 'Thuê', address: baseAddr })).toHaveLength(0);
  });
});

describe('validatePropertySubmit', () => {
  it('yêu cầu ảnh khi gửi duyệt', () => {
    const r = validatePropertySubmit({
      address: baseAddr,
      formData: { area: '50', price: '1000000000' },
      imageCount: 0,
    });
    expect(r.ok).toBe(false);
  });

  it('buildFullAddress có phường', () => {
    expect(buildFullAddress(baseAddr)).toContain('Tân Thuận Đông');
  });
});
