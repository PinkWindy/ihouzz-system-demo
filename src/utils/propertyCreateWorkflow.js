/**
 * UC002 — validate địa chỉ, kiểm tra trùng (Bán), chuẩn bị gửi duyệt.
 */

import { DEFAULT_PROVINCE } from '../data/hcmAdminUnits';

export const LEVEL1_REMOVED = 'Đã gỡ nguồn';

export function buildFullAddress(address) {
  if (!address) return '';
  const { houseNumber, street, ward, district, province } = address;
  return [
    houseNumber,
    street && `đường ${street}`,
    ward,
    district,
    province || DEFAULT_PROVINCE,
  ]
    .filter(Boolean)
    .join(', ');
}

/** @returns {{ ok: boolean, message: string, missing: string[] }} */
export function validateStructuredAddress(address, { required = true } = {}) {
  const missing = [];
  if (!address?.district?.trim()) missing.push('Quận/Huyện');
  if (!address?.ward?.trim()) missing.push('Phường/Xã');
  if (!address?.houseNumber?.trim()) missing.push('Số nhà');
  if (!address?.street?.trim()) missing.push('Tên đường');
  if (required && missing.length > 0) {
    return {
      ok: false,
      message: `Vui lòng điền đầy đủ thông tin địa chỉ (ERR2-001): ${missing.join(', ')}.`,
      missing,
    };
  }
  return { ok: true, message: '', missing: [] };
}

/** @returns {{ ok: boolean, message: string }} */
export function validatePropertySubmit({
  address,
  formData,
  imageCount = 0,
  requireImages = true,
}) {
  const addrCheck = validateStructuredAddress(address, { required: true });
  if (!addrCheck.ok) return addrCheck;

  const area = Number(String(formData?.area ?? '').replace(/,/g, ''));
  if (!formData?.area || !Number.isFinite(area) || area <= 0) {
    return { ok: false, message: 'Vui lòng nhập Diện tích hợp lệ (ERR2-002).' };
  }

  const price = Number(String(formData?.price ?? '').replace(/,/g, ''));
  if (!formData?.price || !Number.isFinite(price) || price <= 0) {
    return { ok: false, message: 'Vui lòng nhập Giá hợp lệ (ERR2-003).' };
  }

  if (requireImages && imageCount < 1) {
    return {
      ok: false,
      message: 'Bắt buộc đính kèm ít nhất 1 ảnh (JPG/PNG/WebP) trước khi gửi duyệt.',
    };
  }

  return { ok: true, message: '' };
}

/** Lấy object địa chỉ cấu trúc từ bản ghi property (nháp cũ có thể thiếu ward). */
export function propertyToAddressFields(property) {
  if (!property) {
    return {
      province: DEFAULT_PROVINCE,
      district: '',
      ward: '',
      futureWard: '',
      houseNumber: '',
      street: '',
    };
  }
  return {
    province: property.province || DEFAULT_PROVINCE,
    district: property.district || '',
    ward: property.ward || '',
    futureWard: property.futureWard || '',
    houseNumber: property.houseNumber || '',
    street: property.street || '',
  };
}

/**
 * Đối soát trùng địa chỉ — chỉ `type = Bán`, Lv1 ≠ Đã gỡ nguồn (FR2-003).
 * @param {object[]} properties
 * @param {{ type: string, address: object, excludeId?: string }} criteria
 */
export function findDuplicateProperties(properties, { type, address, excludeId }) {
  if (type !== 'Bán') return [];
  const addrCheck = validateStructuredAddress(address, { required: true });
  if (!addrCheck.ok) return [];

  const numQ = address.houseNumber.toLowerCase().trim();
  const streetQ = address.street.toLowerCase().trim();

  return (properties || []).filter((p) => {
    const pid = p.propertyCode || p.id;
    if (excludeId && (p.id === excludeId || pid === excludeId)) return false;
    if (p.type !== 'Bán') return false;
    const lv1 = p.level1_status || p.statusLv1 || '';
    if (lv1 === LEVEL1_REMOVED) return false;
    if (p.district && p.district !== address.district) return false;
    if (p.ward && p.ward !== address.ward) return false;
    if (!p.address) return false;
    const addrLower = p.address.toLowerCase();
    return addrLower.includes(numQ) && addrLower.includes(streetQ);
  });
}
