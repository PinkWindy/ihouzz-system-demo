import { describe, it, expect } from 'vitest';
import {
  propertyHasLiveListingForUpdateLock,
  canRequestPropertyUpdate,
  UPDATE_REQUEST_PENDING,
} from './propertyUpdateWorkflow';

const baseProp = {
  id: 'LS-00001',
  level1_status: 'Được duyệt',
  level2_status: 'Chưa niêm yết',
  createdBy_id: 'u004',
};

describe('propertyHasLiveListingForUpdateLock (phương án B)', () => {
  it('bật khi Lv2 = Đang niêm yết', () => {
    expect(
      propertyHasLiveListingForUpdateLock(
        { ...baseProp, level2_status: 'Đang niêm yết' },
        [],
      ),
    ).toBe(true);
  });
  it('bật khi có tin Đã duyệt cùng property_id', () => {
    expect(
      propertyHasLiveListingForUpdateLock(baseProp, [
        { property_id: 'LS-00001', listing_status: 'Đã duyệt' },
      ]),
    ).toBe(true);
  });
  it('tắt khi chỉ tin Chờ duyệt / Đã gỡ', () => {
    expect(
      propertyHasLiveListingForUpdateLock(baseProp, [
        { property_id: 'LS-00001', listing_status: 'Chờ duyệt' },
        { property_id: 'LS-00001', listing_status: 'Đã gỡ' },
      ]),
    ).toBe(false);
  });
});

describe('canRequestPropertyUpdate + listings', () => {
  it('từ chối khi đang niêm yết dù Lv1 đủ', () => {
    expect(
      canRequestPropertyUpdate(
        { ...baseProp, level2_status: 'Đang niêm yết' },
        'u004',
        [],
      ),
    ).toBe(false);
  });
  it('từ chối khi có listing Đã duyệt', () => {
    expect(
      canRequestPropertyUpdate(baseProp, 'u004', [
        { property_id: 'LS-00001', listing_status: 'Đã duyệt' },
      ]),
    ).toBe(false);
  });
  it('cho phép khi không tin live và Lv1 hợp lệ', () => {
    expect(canRequestPropertyUpdate(baseProp, 'u004', [])).toBe(true);
  });
  it('từ chối khi đang pending update', () => {
    expect(
      canRequestPropertyUpdate(
        { ...baseProp, update_request_status: UPDATE_REQUEST_PENDING },
        'u004',
        [],
      ),
    ).toBe(false);
  });
});
