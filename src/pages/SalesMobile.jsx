import { API_BASE_URL } from '../config.js';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import SmartAddress from '../components/SmartAddress';
import { DEFAULT_PROVINCE } from '../data/hcmAdminUnits';
import {
  readFileAsDataURL,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  fetchMediaByListing,
  deleteMediaRows,
  persistMediaItems,
  splitUrls,
  isHttpUrl,
} from '../utils/mediaLibraryApi';
import { sameUserId } from '../utils/userId';
import {
  API,
  readSessionUser,
  postAuditLog,
  postEntityAudit,
  buildLogAction,
  AUDIT_ACTION_TYPE,
  RESUBMIT_NOTE_MIN,
  propertySequenceNumber,
  listingSequenceNumber,
  formatListingId,
  formatPropertyId,
  propertyMatchesExternalRef,
  SESSION_CHANGED_EVENT,
  buildListingTitleFromProperty,
  buildListingDescriptionFromProperty,
  mergePreviewImageUrls,
  confirmDuplicateListingWarningAsync,
  listingRequestHeaders,
  resolveDuplicateListing409,
} from '../utils/listingWorkflow';
import ListingWebsitePreviewModal from '../components/ListingWebsitePreviewModal';
import {
  UPDATE_REQUEST_PENDING,
  diffPropertyUpdate,
  pickPendingPayloadFromForm,
  canRequestPropertyUpdate,
  shrinkPendingForJsonServer,
  propertyHasLiveListingForUpdateLock,
  initialPendingUpdateFormState,
} from '../utils/propertyUpdateWorkflow';
import {
  MY_PROPS_STATUS_ALL,
  MY_PROPS_STATUS_OPTIONS,
  filterMyPropsForTab,
  formatMyPropsPriceDisplay,
  normalizeJsonServerList,
  warehouseLabel,
} from '../utils/myPropsTab';
import {
  buildFullAddress,
  validatePropertySubmit,
  findDuplicateProperties,
  propertyToAddressFields,
} from '../utils/propertyCreateWorkflow';

function newMediaClientKey() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * SalesMobile - Màn hình App Mobile dành cho Chuyên viên Đầu chủ
 * Dùng cùng SmartAddress component với Feature2_Create (Web) để đảm bảo đồng nhất dữ liệu.
 * Tab: Tạo tài sản | Tài sản của tôi
 */
function SalesMobile() {
  const [activeTab, setActiveTab] = useState('create'); // 'create' | 'myprops'
  const [properties, setProperties] = useState([]);
  const [listings, setListings] = useState([]);
  const [myPropsSearch, setMyPropsSearch] = useState('');
  const [myPropsStatusFilter, setMyPropsStatusFilter] = useState(MY_PROPS_STATUS_ALL);
  const [includeRemovedMyProps, setIncludeRemovedMyProps] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state - ĐỒNG NHẤT với Feature2_Create
  const [address, setAddress] = useState({
    province: DEFAULT_PROVINCE, district: '', ward: '',
    futureWard: '', houseNumber: '', street: '',
  });
  const [formData, setFormData] = useState({
    type: 'Bán', propertyType: 'Căn hộ chung cư',
    area: '', price: '', priceUnit: 'tỷ VNĐ',
    direction: '', condition: '', source: '', furniture: '', floor: '',
    bedrooms: '', bathrooms: '', description: '', legalStatus: 'Sổ đỏ',
  });
  const [files, setFiles] = useState([]);
  
  const handleFileUpload = (e) => {
    const selectedFiles = Array.from(e.target.files);
    for (let file of selectedFiles) {
      if (file.size > 10 * 1024 * 1024) {
        alert(`❌ Lỗi: File "${file.name}" vượt quá dung lượng cho phép (10MB).`);
        e.target.value = '';
        return;
      }
    }
    setFiles([...files, ...selectedFiles]);
  };

  const handleAreaChange = (e) => {
    let rawValue = e.target.value.replace(/,/g, '');
    if (/[^\d]/.test(rawValue) && rawValue !== '') alert("❌ Lỗi: Diện tích chỉ được phép chứa số nguyên.");
    rawValue = rawValue.replace(/\D/g, '');
    if (rawValue === '') { setFormData({ ...formData, area: '' }); return; }
    const numValue = parseInt(rawValue, 10);
    if (numValue <= 0) { alert("❌ Lỗi: Diện tích phải lớn hơn 0."); setFormData({ ...formData, area: '' }); return; }
    setFormData({ ...formData, area: numValue.toLocaleString('en-US') });
  };

  const handlePriceChange = (e) => {
    let rawValue = String(e.target.value).replace(/,/g, ''); 
    if (/[^\d.]/.test(rawValue) && rawValue !== '') {
      alert("❌ Lỗi: Giá trị chỉ được phép chứa số và dấu chấm (VD: 6.7).");
    }
    rawValue = rawValue.replace(/[^\d.]/g, ''); 
    const parts = rawValue.split('.');
    if (parts.length > 2) {
      rawValue = parts[0] + '.' + parts.slice(1).join('');
    }
    if (rawValue === '' || rawValue === '.') {
      setFormData({ ...formData, price: rawValue });
      return;
    }
    if (rawValue.endsWith('.') || (parts.length > 1 && parts[1].endsWith('0'))) {
      const intPart = parts[0] ? parseInt(parts[0], 10).toLocaleString('en-US') : '0';
      const decPart = parts.length > 1 ? '.' + parts[1] : '';
      setFormData({ ...formData, price: intPart + decPart });
      return;
    }
    const numValue = parseFloat(rawValue);
    if (numValue <= 0 && rawValue !== '0') {
      alert("❌ Lỗi: Giá trị số tiền phải lớn hơn 0.");
      setFormData({ ...formData, price: '' });
      return;
    }
    const intPart = parts[0] ? parseInt(parts[0], 10).toLocaleString('en-US') : '0';
    const decPart = parts.length > 1 && parts[1] ? '.' + parts[1] : '';
    setFormData({ ...formData, price: intPart + decPart });
  };

  const [dupAlert, setDupAlert] = useState(null); // null | 'dup' | 'clear'
  const [dupInfo, setDupInfo] = useState(null);

  // Listing form state
  const [listingForm, setListingForm] = useState(null);
  const [listingTitle, setListingTitle] = useState('');
  const [listingDesc, setListingDesc] = useState('');
  const [listingContactPhone, setListingContactPhone] = useState('');
  const [listingComposeMedia, setListingComposeMedia] = useState([]);
  const [listingImageUrlInput, setListingImageUrlInput] = useState('');
  const [listingVideoUrlInput, setListingVideoUrlInput] = useState('');
  const [showListingComposePreview, setShowListingComposePreview] = useState(false);
  const [listingComposeSubmitting, setListingComposeSubmitting] = useState(false);

  // Unlist state
  const [unlistTarget, setUnlistTarget] = useState(null);
  const [unlistReason, setUnlistReason] = useState('');

  const [sessionRev, setSessionRev] = useState(0);
  const [fetchError, setFetchError] = useState(null);

  useEffect(() => {
    const bump = () => setSessionRev((n) => n + 1);
    const onStorage = (e) => {
      if (e.key === 'user' || e.key === 'user_role' || e.key === 'pos_name' || e.key === null) bump();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(SESSION_CHANGED_EVENT, bump);
    const onVis = () => {
      if (document.visibilityState === 'visible') bump();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SESSION_CHANGED_EVENT, bump);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const currentUserObj = useMemo(() => readSessionUser(), [sessionRev]);

  const USER_ID = currentUserObj.id || '';

  /** Chỉnh sửa TS sau khi GĐ POS từ chối */
  const [reopenRejected, setReopenRejected] = useState(null);
  const [rejectedDesc, setRejectedDesc] = useState('');
  const [rejectedNote, setRejectedNote] = useState('');
  const [rejectedExtraFiles, setRejectedExtraFiles] = useState([]);

  /** Gửi yêu cầu cập nhật (đồng bộ F2 web) */
  const [upTarget, setUpTarget] = useState(null);
  const [upForm, setUpForm] = useState(null);
  const [upNote, setUpNote] = useState('');
  const [upExtraFiles, setUpExtraFiles] = useState([]);

  const [mktResubmitCtx, setMktResubmitCtx] = useState(null);
  const [mktResubmitForm, setMktResubmitForm] = useState({ title: '', description: '', contact_phone: '' });
  const [mktResubmitNote, setMktResubmitNote] = useState('');
  const [mktResubmitMedia, setMktResubmitMedia] = useState([]);
  const [showMktListingPreview, setShowMktListingPreview] = useState(false);
  const [mktSubmitting, setMktSubmitting] = useState(false);

  /** Hoàn thiện hồ sơ nháp (đồng bộ Feature2_Create — Web) */
  const [mobileDraftProp, setMobileDraftProp] = useState(null);
  const [mobileDraftForm, setMobileDraftForm] = useState(null);
  const [mobileDraftExtraFiles, setMobileDraftExtraFiles] = useState([]);
  const [mobileDraftSubmitting, setMobileDraftSubmitting] = useState(false);
  /** 1: eSign KH · 2: Kho đảm bảo · 3: Đã ký / POS */
  const [mobileDraftBranch, setMobileDraftBranch] = useState(null);

  const myPropsListBase = useMemo(() => {
    if (!USER_ID) return [];
    /** Giống F2 (`Feature2_Create.jsx`): lọc theo `createdBy_id`. */
    const byId = new Map();
    properties.forEach((p) => {
      if (p && sameUserId(p.createdBy_id, USER_ID)) byId.set(p.id, p);
    });
    const name = (currentUserObj.name || '').trim();
    listings.forEach((l) => {
      if (!l || !(sameUserId(l.createdBy_id, USER_ID) || (name && l.createdBy === name))) return;
      const ref = l.property_id;
      if (ref == null || ref === '') return;
      const p = properties.find((x) => x && propertyMatchesExternalRef(x, ref));
      if (p) byId.set(p.id, p);
    });
    return Array.from(byId.values());
  }, [properties, listings, USER_ID, currentUserObj.name]);

  const myPropsDisplayed = useMemo(
    () =>
      filterMyPropsForTab(myPropsListBase, {
        statusKey: myPropsStatusFilter,
        hideRemovedSource: !includeRemovedMyProps,
        search: myPropsSearch,
      }),
    [myPropsListBase, myPropsStatusFilter, includeRemovedMyProps, myPropsSearch],
  );

  const myRejectedMktListings = useMemo(() => {
    if (!USER_ID) return [];
    const name = currentUserObj.name || '';
    return listings.filter(
      (l) =>
        l &&
        l.listing_status === 'Từ chối' &&
        (sameUserId(l.createdBy_id, USER_ID) || (name && l.createdBy === name)),
    );
  }, [listings, USER_ID, currentUserObj.name]);

  const mktPreviewImageUrls = useMemo(
    () => mktResubmitMedia.filter((m) => m.kind === 'image').map((m) => m.url).filter(Boolean),
    [mktResubmitMedia],
  );

  const listingComposePreviewImageUrls = useMemo(
    () => listingComposeMedia.filter((m) => m.kind === 'image').map((m) => m.url).filter(Boolean),
    [listingComposeMedia],
  );

  const openUpModal = (p) => {
    setUpTarget(p);
    setUpForm(initialPendingUpdateFormState(p));
    setUpNote('');
    setUpExtraFiles([]);
  };

  const handleUpExtraUpload = (e) => {
    const sel = Array.from(e.target.files || []);
    e.target.value = '';
    for (const file of sel) {
      if (file.size > 10 * 1024 * 1024) {
        alert(`File "${file.name}" vượt quá 10MB.`);
        return;
      }
    }
    setUpExtraFiles((prev) => [...prev, ...sel]);
  };

  const handleUpSubmit = async () => {
    if (!upTarget || !upForm) return;
    if (!canRequestPropertyUpdate(upTarget, USER_ID, listings)) {
      if (propertyHasLiveListingForUpdateLock(upTarget, listings)) {
        alert('Không thể gửi cập nhật kho: tài sản đang có bài đăng niêm yết. Vui lòng gỡ / tạm dừng tin trước.');
      } else {
        alert('Không thể gửi yêu cầu cập nhật cho tài sản này.');
      }
      return;
    }
    const imgNew = upExtraFiles.filter((f) => f.type.startsWith('image/'));
    const newUrls = [];
    for (const f of imgNew.slice(0, 12)) {
      try {
        newUrls.push(await readFileAsDataURL(f, MAX_IMAGE_BYTES));
      } catch (err) {
        alert(err?.message || f.name);
        return;
      }
    }
    const mergedImages = [...(upForm.images || []).filter(Boolean), ...newUrls];
    if (mergedImages.length < 1) {
      alert('Cần ít nhất 1 ảnh trong bản cập nhật.');
      return;
    }
    const pendingRaw = pickPendingPayloadFromForm({
      ...upForm,
      area: Number(String(upForm.area).replace(/,/g, '')),
      price: Number(String(upForm.price).replace(/,/g, '')),
      bedrooms: Number(upForm.bedrooms) || 0,
      bathrooms: Number(upForm.bathrooms) || 0,
      floor: upForm.floor === '' || upForm.floor == null ? null : parseInt(String(upForm.floor), 10),
      images: mergedImages,
    });
    if (diffPropertyUpdate(upTarget, pendingRaw).length < 1) {
      alert('Không có thay đổi so với dữ liệu hiện tại.');
      return;
    }
    const meta = {
      update_request_status: UPDATE_REQUEST_PENDING,
      update_requested_at: new Date().toISOString(),
      update_requested_by: currentUserObj.name || 'Đầu chủ',
      update_requested_by_id: USER_ID || null,
      update_request_note: upNote.trim() || null,
    };
    const { pending: pendingToSend, didSubstituteImages } = shrinkPendingForJsonServer(
      meta,
      pendingRaw,
      upTarget.id,
    );
    const changes = diffPropertyUpdate(upTarget, pendingToSend);
    try {
      await axios.patch(`${API_BASE_URL}/properties/${encodeURIComponent(upTarget.id)}`, {
        ...meta,
        pending_update_payload: pendingToSend,
      });
      await logAudit('Gửi yêu cầu phê duyệt cập nhật TS (Mobile)', upTarget.id, {
        actionType: AUDIT_ACTION_TYPE.PROPERTY_F2_UPDATE_REQUEST,
        property_id: upTarget.propertyCode || upTarget.id,
        modified_fields:
          changes.length > 0
            ? Object.fromEntries(changes.map((c) => [String(c.field), { old: c.old, new: c.new }]))
            : undefined,
        extra: { changesPreview: changes.map((c) => c.field) },
      });
      setUpTarget(null);
      setUpForm(null);
      setUpExtraFiles([]);
      fetchData();
      alert(
        didSubstituteImages
          ? '✅ Đã gửi yêu cầu. (Demo: json-server ~100KB — ảnh thay bằng URL minh họa.)'
          : '✅ Đã gửi yêu cầu cập nhật tới GĐ POS.',
      );
    } catch (err) {
      console.error(err);
      const detail = err?.response?.data?.error || err?.response?.data?.message || err?.message || '';
      alert(detail ? `Lỗi: ${detail}` : 'Lỗi khi gửi (chạy `npm run api` port 5000?).');
    }
  };

  const closeMktResubmit = () => {
    setMktResubmitCtx(null);
    setMktResubmitNote('');
    setMktResubmitMedia([]);
    setShowMktListingPreview(false);
  };

  const openMktResubmitListing = async (listing) => {
    const prop = properties.find((p) => p.id === listing.property_id) || null;
    setMktResubmitCtx({ listing, property: prop });
    setMktResubmitForm({
      title: buildListingTitleFromProperty(prop) || listing.title || '',
      description: buildListingDescriptionFromProperty(prop),
      contact_phone: (listing.contact_phone || '').trim(),
    });
    setMktResubmitNote('');
    setShowMktListingPreview(false);
    const rows = await fetchMediaByListing(listing.id);
    let media = rows.map((r) => ({
      clientKey: r.id,
      mediaLibId: r.id,
      kind: r.kind === 'video' ? 'video' : 'image',
      url: r.url,
      fileName: r.fileName || '',
      mimeType: r.mimeType,
      fileSize: r.fileSize,
      source: r.source || 'upload',
    }));
    if (media.length === 0) {
      const urls = mergePreviewImageUrls(listing, prop, 5);
      media = urls.map((url, i) => ({
        clientKey: `seed-${i}`,
        kind: 'image',
        url,
        fileName: `anh-${i + 1}.jpg`,
        mimeType: 'image/jpeg',
        fileSize: null,
        source: 'url',
      }));
    }
    setMktResubmitMedia(media);
  };

  const handleMktResubmitMediaUpload = async (e) => {
    const sel = Array.from(e.target.files || []);
    e.target.value = '';
    for (const file of sel) {
      if (file.type.startsWith('image/')) {
        try {
          const url = await readFileAsDataURL(file, MAX_IMAGE_BYTES);
          setMktResubmitMedia((prev) => [
            ...prev,
            {
              clientKey: newMediaClientKey(),
              kind: 'image',
              url,
              fileName: file.name,
              mimeType: file.type,
              fileSize: file.size,
              source: 'upload',
            },
          ]);
        } catch (err) {
          alert(err?.message || file.name);
          return;
        }
      } else if (file.type.startsWith('video/')) {
        try {
          const url = await readFileAsDataURL(file, MAX_VIDEO_BYTES);
          setMktResubmitMedia((prev) => [
            ...prev,
            {
              clientKey: newMediaClientKey(),
              kind: 'video',
              url,
              fileName: file.name,
              mimeType: file.type,
              fileSize: file.size,
              source: 'upload',
            },
          ]);
        } catch (err) {
          alert(err?.message || file.name);
          return;
        }
      } else {
        alert(`Bỏ qua (chỉ ảnh/video): ${file.name}`);
      }
    }
  };

  const handleMktResubmitSubmit = async () => {
    if (!mktResubmitCtx) return;
    if (mktResubmitNote.trim().length < RESUBMIT_NOTE_MIN) {
      alert(`Ghi chú gửi lại bắt buộc tối thiểu ${RESUBMIT_NOTE_MIN} ký tự (mô tả phần đã chỉnh theo phản hồi MKT).`);
      return;
    }
    if (!mktResubmitForm.title.trim() || !mktResubmitForm.description.trim() || !mktResubmitForm.contact_phone.trim()) {
      alert('Tiêu đề, mô tả và SĐT không được để trống.');
      return;
    }
    const u = readSessionUser();
    const { listing } = mktResubmitCtx;
    const now = new Date().toISOString();
    setMktSubmitting(true);
    try {
      const existing = await fetchMediaByListing(listing.id);
      await deleteMediaRows(existing);
      const saved = await persistMediaItems({
        listingId: listing.id,
        propertyId: listing.property_id,
        user: u,
        items: mktResubmitMedia.map((m) => ({
          kind: m.kind,
          url: m.url,
          fileName: m.fileName,
          mimeType: m.mimeType,
          fileSize: m.fileSize,
          source: m.source || 'upload',
        })),
      });
      const imageUrls = saved.filter((s) => s.kind === 'image').map((s) => s.url);
      const videoUrls = saved.filter((s) => s.kind === 'video').map((s) => s.url);
      const mediaLibraryIds = saved.map((s) => s.id).filter(Boolean);

      await fetch(`${API}/listings/${listing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: mktResubmitForm.title.trim(),
          description: mktResubmitForm.description.trim(),
          contact_phone: mktResubmitForm.contact_phone.trim(),
          listing_status: 'Chờ duyệt chỉnh sửa',
          prev_rejection_note: listing.rejection_note || listing.prev_rejection_note || null,
          resubmit_note: mktResubmitNote.trim(),
          resubmittedAt: now,
          resubmittedBy: u.name,
          resubmittedBy_id: u.id,
          rejection_note: null,
          rejectedBy: null,
          rejectedBy_id: null,
          rejectedAt: null,
          images: imageUrls,
          videos: videoUrls,
          mediaLibraryIds,
          updatedAt: now,
        }),
      });
      const propPatch = mktResubmitCtx.property;
      if (propPatch?.id) {
        await fetch(`${API}/properties/${encodeURIComponent(propPatch.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            level2_status: 'Chờ duyệt chỉnh sửa',
            statusLv2: 'Chờ duyệt chỉnh sửa',
            updatedAt: now,
          }),
        });
      }
      await postAuditLog({
        actionText: buildLogAction('Đầu chủ (Mobile) gửi lại duyệt', listing.id, `Ghi chú: ${mktResubmitNote.trim().slice(0, 120)}`),
        actionType: AUDIT_ACTION_TYPE.LISTING_RESUBMIT_FOR_REVIEW,
        listingId: listing.id,
        userName: u.name || u.email || 'User',
        userId: u.id || '',
        propertyId: listing.property_id,
        oldStatus: 'Từ chối',
        newStatus: 'Chờ duyệt chỉnh sửa',
        detail: mktResubmitNote.trim(),
        modifiedFields: {
          title: { from: listing.title || '', to: mktResubmitForm.title.trim() },
          description: { from: listing.description || '', to: mktResubmitForm.description.trim() },
          resubmit_note: mktResubmitNote.trim(),
        },
      });
      closeMktResubmit();
      await fetchData();
      alert('Đã gửi lại MKT duyệt.');
    } catch (err) {
      console.error(err);
      alert('Lỗi khi gửi lại MKT.');
    } finally {
      setMktSubmitting(false);
    }
  };

  const fetchData = useCallback(async () => {
    setFetchError(null);
    try {
      const [resP, resL] = await Promise.all([
        axios.get(`${API}/properties`, { headers: { 'Cache-Control': 'no-cache' } }),
        axios.get(`${API}/listings`, { headers: { 'Cache-Control': 'no-cache' } }),
      ]);
      setProperties(normalizeJsonServerList(resP.data));
      setListings(normalizeJsonServerList(resL.data));
    } catch (err) {
      console.error("SalesMobile fetchData error", err);
      const hint = API_BASE_URL.includes('localhost') ? ' tại cổng 5000' : ` tại ${API_BASE_URL}`;
      setFetchError(
        err?.response?.data?.message || err?.message || `Không tải được dữ liệu. Hãy chạy API json-server${hint}.`,
      );
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (activeTab === 'myprops') fetchData();
  }, [activeTab, sessionRev, fetchData]);

  /** Điện thoại vs máy tính: không có chung `storage` — làm mới nhẹ khi đang xem tab. */
  useEffect(() => {
    if (activeTab !== 'myprops') return undefined;
    const id = setInterval(() => {
      fetchData();
    }, 28000);
    return () => clearInterval(id);
  }, [activeTab, fetchData]);

  const logAudit = async (action, entityId, opts = {}) => {
    try {
      await postEntityAudit({
        action,
        actionType: opts.actionType || AUDIT_ACTION_TYPE.MOBILE_AUDIT_GENERIC,
        entityId: entityId != null ? String(entityId) : '',
        property_id: opts.property_id != null ? String(opts.property_id) : entityId != null ? String(entityId) : '',
        listing_id: opts.listing_id,
        user: opts.user || currentUserObj.name || 'Đầu chủ (Mobile)',
        user_id: USER_ID,
        old_status: opts.old_status,
        new_status: opts.new_status,
        reason: opts.reason,
        detail: opts.detail,
        modified_fields: opts.modified_fields,
        extra: opts.extra,
      });
    } catch (err) {
      console.error('SalesMobile logAudit error', err);
    }
  };

  const fullAddress = [address.houseNumber, address.street && `đường ${address.street}`,
    address.ward, address.district, address.province].filter(Boolean).join(', ');

  const handleDupCheck = async () => {
    if (formData.type !== 'Bán') {
      alert('Chức năng kiểm tra trùng địa chỉ chỉ bắt buộc và áp dụng cho giao dịch Bán.');
      return;
    }
    if (!address.houseNumber || !address.street) {
      alert('Vui lòng nhập Số nhà và Tên đường để kiểm tra.');
      return;
    }
    try {
      const res = await axios.get(`${API}/properties`);
      const q = `${address.houseNumber} ${address.street}`.toLowerCase();
      const dups = res.data.filter(p => p.type === 'Bán' && p.address?.toLowerCase().includes(q));
      if (dups.length > 0) { setDupAlert('dup'); setDupInfo(dups[0]); }
      else { setDupAlert('clear'); }
    } catch (err) {
      console.error("SalesMobile handleDupCheck error", err);
      alert('Lỗi kết nối khi kiểm tra trùng địa chỉ.');
    }
  };

  const handleCreateProp = async (e) => {
    e.preventDefault();
    if (!address.district || !address.ward || !address.houseNumber || !address.street) {
      alert('Vui lòng điền đầy đủ địa chỉ (Quận, Phường, Số nhà, Tên đường)');
      return;
    }
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length < 1) {
      alert('Bắt buộc ít nhất 1 ảnh (JPG/PNG/WebP) minh họa tài sản trước khi gửi duyệt.');
      return;
    }
    if (dupAlert === 'dup') {
      if (!window.confirm(`⚠️ Địa chỉ này có thể trùng với ${dupInfo?.id}. Bạn có muốn tiếp tục không?`)) return;
    }
    setSubmitting(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/properties`);
      const maxId = res.data.reduce((max, p) => {
        const idToCheck = p.propertyCode || p.id;
        const n = propertySequenceNumber(idToCheck);
        return n != null ? Math.max(max, n) : max;
      }, 0);
      const newId = `LS-${String(maxId + 1).padStart(5, '0')}`;

      const imageUrls = [];
      for (const f of imageFiles.slice(0, 12)) {
        try {
          imageUrls.push(await readFileAsDataURL(f, MAX_IMAGE_BYTES));
        } catch (err) {
          alert(err?.message || `Không đọc được ảnh: ${f.name}`);
          setSubmitting(false);
          return;
        }
      }

      await axios.post(`${API_BASE_URL}/properties`, {
        id: newId,
        propertyCode: newId,
        address: fullAddress,
        futureWard: address.futureWard || null,
        district: address.district,
        ward: address.ward,
        type: formData.type,
        propertyType: formData.propertyType,
        price: Number(String(formData.price).replace(/,/g, '')),
        priceUnit: formData.priceUnit,
        area: Number(String(formData.area).replace(/,/g, '')),
        bedrooms: Number(formData.bedrooms) || 0,
        bathrooms: Number(formData.bathrooms) || 0,
        direction: formData.direction,
        condition: formData.condition,
        source: formData.source,
        furniture: formData.furniture,
        floor: formData.floor ? parseInt(formData.floor, 10) : null,
        legalStatus: formData.legalStatus,
        description: formData.description,
        images: imageUrls,
        statusLv1: 'Chờ POS duyệt',
        level1_status: 'Chờ POS duyệt',
        statusLv2: 'Chưa niêm yết',
        level2_status: 'Chưa niêm yết',
        createdAt: new Date().toISOString(),
        createdBy: currentUserObj.name || 'Đầu chủ',
        createdBy_id: USER_ID || undefined,
        pos_name: currentUserObj.pos_name || 'POS Q1',
        pos_id: currentUserObj.pos_id || 1,
      });
      await logAudit('Tạo tài sản mới (Mobile)', newId, {
        actionType: AUDIT_ACTION_TYPE.PROPERTY_F2_SUBMIT_WAREHOUSE,
        new_status: 'Chờ POS duyệt',
      });
      alert(`✅ Đã gửi duyệt nhập kho: ${newId}`);
      setAddress({ province: DEFAULT_PROVINCE, district: '', ward: '', futureWard: '', houseNumber: '', street: '' });
      setFormData({
        type: 'Bán',
        propertyType: 'Căn hộ chung cư',
        area: '',
        price: '',
        priceUnit: 'tỷ VNĐ',
        direction: '',
        condition: '',
        source: '',
        furniture: '',
        floor: '',
        bedrooms: '',
        bathrooms: '',
        description: '',
        legalStatus: 'Sổ đỏ',
      });
      setFiles([]);
      setDupAlert(null);
      setActiveTab('myprops');
      fetchData();
    } finally {
      setSubmitting(false);
    }
  };

  const closeComposeToMyProps = () => {
    setListingForm(null);
    setListingTitle('');
    setListingDesc('');
    setListingContactPhone('');
    setListingComposeMedia([]);
    setListingImageUrlInput('');
    setListingVideoUrlInput('');
    setShowListingComposePreview(false);
    setActiveTab('myprops');
  };

  const openListingCompose = (p) => {
    setListingForm(p);
    setListingTitle(buildListingTitleFromProperty(p));
    setListingDesc(buildListingDescriptionFromProperty(p));
    setListingContactPhone('');
    const imgs = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
    setListingComposeMedia(
      imgs.slice(0, 12).map((url, i) => ({
        clientKey: `prop-img-${p.id}-${i}`,
        kind: 'image',
        url,
        fileName: `anh-kho-${i + 1}.jpg`,
        mimeType: 'image/jpeg',
        fileSize: null,
        source: 'property',
      })),
    );
    setListingImageUrlInput('');
    setListingVideoUrlInput('');
    setShowListingComposePreview(false);
    setActiveTab('create');
  };

  const handleListingComposeMediaUpload = async (e) => {
    const sel = Array.from(e.target.files || []);
    e.target.value = '';
    for (const file of sel) {
      if (file.type.startsWith('image/')) {
        try {
          const url = await readFileAsDataURL(file, MAX_IMAGE_BYTES);
          setListingComposeMedia((prev) => [
            ...prev,
            {
              clientKey: newMediaClientKey(),
              kind: 'image',
              url,
              fileName: file.name,
              mimeType: file.type,
              fileSize: file.size,
              source: 'upload',
            },
          ]);
        } catch (err) {
          alert(err?.message || file.name);
          return;
        }
      } else if (file.type.startsWith('video/')) {
        try {
          const url = await readFileAsDataURL(file, MAX_VIDEO_BYTES);
          setListingComposeMedia((prev) => [
            ...prev,
            {
              clientKey: newMediaClientKey(),
              kind: 'video',
              url,
              fileName: file.name,
              mimeType: file.type,
              fileSize: file.size,
              source: 'upload',
            },
          ]);
        } catch (err) {
          alert(err?.message || file.name);
          return;
        }
      } else {
        alert(`Bỏ qua (chỉ ảnh/video): ${file.name}`);
      }
    }
  };

  const addListingImageUrlsFromInput = () => {
    const urls = splitUrls(listingImageUrlInput).filter(isHttpUrl);
    if (!urls.length) {
      alert('Nhập ít nhất một URL ảnh hợp lệ (http/https).');
      return;
    }
    setListingComposeMedia((prev) => [
      ...prev,
      ...urls.map((url) => ({
        clientKey: newMediaClientKey(),
        kind: 'image',
        url,
        fileName: url.split('/').pop() || 'image',
        mimeType: 'image/url',
        fileSize: null,
        source: 'url',
      })),
    ]);
    setListingImageUrlInput('');
  };

  const addListingVideoUrlsFromInput = () => {
    const urls = splitUrls(listingVideoUrlInput).filter(isHttpUrl);
    if (!urls.length) {
      alert('Nhập ít nhất một URL video hợp lệ (http/https).');
      return;
    }
    setListingComposeMedia((prev) => [
      ...prev,
      ...urls.map((url) => ({
        clientKey: newMediaClientKey(),
        kind: 'video',
        url,
        fileName: url.split('/').pop() || 'video',
        mimeType: 'video/url',
        fileSize: null,
        source: 'url',
      })),
    ]);
    setListingVideoUrlInput('');
  };

  const nextLTIdForMobile = async () => {
    const res = await axios.get(`${API}/listings`);
    const list = res.data;
    let max = 0;
    for (const l of list) {
      const idToCheck = l.listingCode || l.id;
      const n = listingSequenceNumber(idToCheck);
      if (n != null) max = Math.max(max, n);
    }
    return formatListingId(String(max + 1));
  };

  const syncListingMediaFieldsMobile = async (listingId, propertyId, u, mediaRows) => {
    const items = mediaRows.map((m) => ({
      kind: m.kind,
      url: m.url,
      fileName: m.fileName,
      mimeType: m.mimeType,
      fileSize: m.fileSize,
      source: m.source || 'upload',
    }));
    const saved = await persistMediaItems({ listingId, propertyId, user: u, items });
    const imageUrls = saved.filter((s) => s.kind === 'image').map((s) => s.url);
    const videoUrls = saved.filter((s) => s.kind === 'video').map((s) => s.url);
    const mediaLibraryIds = saved.map((s) => s.id).filter(Boolean);
    await fetch(`${API}/listings/${listingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        images: imageUrls,
        videos: videoUrls,
        mediaLibraryIds,
        updatedAt: new Date().toISOString(),
      }),
    });
  };

  const handleCreateListing = async (e) => {
    e.preventDefault();
    if (!listingForm) return;
    if (!listingTitle.trim()) {
      alert('Vui lòng nhập tiêu đề tin đăng.');
      return;
    }
    if (!listingDesc.trim()) {
      alert('Vui lòng nhập mô tả tin đăng.');
      return;
    }
    if (!listingContactPhone.trim()) {
      alert('Vui lòng nhập SĐT liên hệ (đồng bộ form Soạn tin trên web).');
      return;
    }
    const u = readSessionUser();
    const dupConfirm = await confirmDuplicateListingWarningAsync({
      listings,
      propertyRef: listingForm.id,
      propertyCode: listingForm.propertyCode || listingForm.id,
      actionPrompt:
        'Bạn có chắc muốn GỬI DUYỆT thêm tin cho tài sản này không? (Chọn OK để tiếp tục.)',
      audit: {
        userName: u.name || u.email || 'Sales',
        userId: u.id || '',
        propertyId: listingForm.id,
        screen: 'Mobile',
        action: 'LISTING_SUBMIT',
      },
    });
    if (!dupConfirm.ok) return;

    setListingComposeSubmitting(true);
    try {
      const newLTId = await nextLTIdForMobile();
      const now = new Date().toISOString();
      const postBody = JSON.stringify({
        id: newLTId,
        listingCode: newLTId,
        property_id: listingForm.id,
        title: listingTitle.trim(),
        description: listingDesc.trim(),
        contact_phone: listingContactPhone.trim(),
        images: [],
        videos: [],
        mediaLibraryIds: [],
        listing_status: 'Chờ duyệt',
        createdBy: u.name || 'Sales',
        createdBy_id: u.id || '',
        createdAt: now,
        updatedAt: now,
        expiredAt: null,
      });
      const doPost = (force) =>
        fetch(`${API}/listings`, {
          method: 'POST',
          headers: listingRequestHeaders(force),
          body: postBody,
        });
      let res = await doPost(dupConfirm.forceDuplicate);
      if (res.status === 409) {
        const retried = await resolveDuplicateListing409(
          res,
          (force) => doPost(force),
          {
            listings,
            propertyRef: listingForm.id,
            propertyCode: listingForm.propertyCode || listingForm.id,
            actionPrompt:
              'Bạn có chắc muốn GỬI DUYỆT thêm tin cho tài sản này không? (Chọn OK để tiếp tục.)',
            audit: {
              userName: u.name || u.email || 'Sales',
              userId: u.id || '',
              propertyId: listingForm.id,
              listingId: newLTId,
              screen: 'Mobile',
              action: 'LISTING_SUBMIT',
            },
          },
        );
        if (retried === null) {
          setListingComposeSubmitting(false);
          return;
        }
        res = retried;
      }
      if (!res.ok) throw new Error(`POST listings ${res.status}`);
      if (listingComposeMedia.length > 0) {
        await syncListingMediaFieldsMobile(newLTId, listingForm.id, u, listingComposeMedia);
      }
      await axios.patch(`${API}/properties/${encodeURIComponent(listingForm.id)}`, {
        level2_status: 'Chờ MKT duyệt',
        statusLv2: 'Chờ MKT duyệt',
        updatedAt: now,
      });
      await postAuditLog({
        actionText: buildLogAction('Tạo & gửi duyệt bài đăng (Mobile)', newLTId, `TS ${listingForm.id}`),
        actionType: AUDIT_ACTION_TYPE.LISTING_SUBMIT_FOR_REVIEW,
        listingId: newLTId,
        userName: u.name || u.email || 'User',
        userId: u.id || '',
        propertyId: listingForm.id,
        oldStatus: '—',
        newStatus: 'Chờ duyệt',
        detail: `Tiêu đề: ${listingTitle.trim().slice(0, 80)}${listingTitle.length > 80 ? '…' : ''} · Media: ${listingComposeMedia.length}`,
      });
      alert(`✅ Đã gửi tin ${newLTId} — chờ MKT duyệt (đồng bộ kho & Library như web).`);
      closeComposeToMyProps();
      fetchData();
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || err?.message || 'Lỗi khi gửi tin đăng.');
    } finally {
      setListingComposeSubmitting(false);
    }
  };

  const handleRequestUnlist = async () => {
    if (!unlistReason) { alert('❌ Vui lòng chọn lý do gỡ tin.'); return; }
    const p = unlistTarget;
    await axios.put(`${API}/properties/${p.id}`, { ...p, statusLv2: `Yêu cầu gỡ: ${unlistReason}` });
    await logAudit(`Yêu cầu gỡ tin: ${unlistReason}`, p.id, {
      reason: unlistReason,
      detail: 'Mobile: cập nhật property theo flow đơn giản hóa (json-server demo).',
    });
    alert('✅ Đã gửi yêu cầu gỡ tin!');
    setUnlistTarget(null); setUnlistReason('');
    fetchData();
  };

  const handleRemoveSource = async (p) => {
    const lv2 = p.level2_status || p.statusLv2;
    if (lv2 === 'Đang niêm yết') {
      alert('❌ Tài sản đang niêm yết. Vui lòng gỡ tin trước khi gỡ nguồn.');
      return;
    }
    if (!window.confirm('⚠️ Yêu cầu Gỡ Nguồn sẽ gửi đến GĐ POS duyệt. Xác nhận?')) return;
    await axios.put(`${API}/properties/${p.id}`, { ...p, statusLv1: 'Chờ duyệt gỡ nguồn', level1_status: 'Chờ duyệt gỡ nguồn' });
    await logAudit('Yêu cầu gỡ nguồn (Mobile F8)', p.id, {
      actionType: AUDIT_ACTION_TYPE.PROPERTY_F8_UNSOURCE_REQUEST,
      old_status: p.level1_status || p.statusLv1,
      new_status: 'Chờ duyệt gỡ nguồn',
    });
    alert('✅ Đã gửi yêu cầu gỡ nguồn!');
    fetchData();
  };

  const openRejectedEdit = (p) => {
    setReopenRejected(p);
    setRejectedDesc(p.description || '');
    setRejectedNote('');
    setRejectedExtraFiles([]);
  };

  const handleRejectedExtraUpload = (e) => {
    const sel = Array.from(e.target.files || []);
    e.target.value = '';
    for (const file of sel) {
      if (file.size > 10 * 1024 * 1024) {
        alert(`File "${file.name}" vượt quá 10MB.`);
        return;
      }
    }
    setRejectedExtraFiles((prev) => [...prev, ...sel]);
  };

  const handleRejectedResubmit = async () => {
    if (!reopenRejected) return;
    if (rejectedNote.trim().length < RESUBMIT_NOTE_MIN) {
      alert(`Ghi chú gửi lại tối thiểu ${RESUBMIT_NOTE_MIN} ký tự.`);
      return;
    }
    const existing = Array.isArray(reopenRejected.images) ? reopenRejected.images.filter(Boolean) : [];
    const imgNew = rejectedExtraFiles.filter((f) => f.type.startsWith('image/'));
    if (existing.length + imgNew.length < 1) {
      alert('Cần ít nhất 1 ảnh: giữ ảnh hồ sơ hoặc tải thêm ảnh mới.');
      return;
    }
    const newUrls = [];
    for (const f of imgNew.slice(0, 10)) {
      try {
        newUrls.push(await readFileAsDataURL(f, MAX_IMAGE_BYTES));
      } catch (err) {
        alert(err?.message || f.name);
        return;
      }
    }
    const merged = [...existing, ...newUrls];
    await axios.patch(`${API}/properties/${reopenRejected.id}`, {
      description: rejectedDesc,
      images: merged,
      level1_status: 'Chờ POS duyệt',
      statusLv1: 'Chờ POS duyệt',
      rejection_reason: null,
      resubmit_property_note: rejectedNote.trim(),
      updatedAt: new Date().toISOString(),
    });
    await logAudit('Đầu chủ chỉnh sửa TS sau từ chối POS & gửi lại duyệt', reopenRejected.id, {
      actionType: AUDIT_ACTION_TYPE.PROPERTY_F2_SUBMIT_WAREHOUSE,
    });
    setReopenRejected(null);
    setRejectedExtraFiles([]);
    fetchData();
    alert('✅ Đã gửi lại GĐ POS duyệt.');
  };

  const closeMobileDraftModal = () => {
    setMobileDraftProp(null);
    setMobileDraftForm(null);
    setMobileDraftExtraFiles([]);
    setMobileDraftBranch(null);
    setMobileDraftSubmitting(false);
  };

  const countMobileDraftImages = (form, extraFiles) => {
    const existing = (form?.images || []).filter(Boolean).length;
    const pending = (extraFiles || []).filter((f) => f.type.startsWith('image/')).length;
    return existing + pending;
  };

  const handleMobileDraftFileChange = (e) => {
    const sel = Array.from(e.target.files || []);
    e.target.value = '';
    for (const file of sel) {
      if (file.size > 10 * 1024 * 1024) {
        alert(`File "${file.name}" vượt quá 10MB.`);
        return;
      }
      const isImage =
        file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name || '');
      if (!isImage) {
        alert(`"${file.name}" không phải ảnh hợp lệ. Chỉ chấp nhận JPG, PNG, WebP.`);
        return;
      }
    }
    setMobileDraftExtraFiles((prev) => [...prev, ...sel]);
  };

  const resolveMobileDraftImages = async (propertyId, form, extraFiles) => {
    const kept = (form?.images || []).filter(Boolean);
    const imgNew = (extraFiles || []).filter((f) => f.type.startsWith('image/'));
    const newUrls = [];
    for (let i = 0; i < imgNew.length; i++) {
      try {
        newUrls.push(await readFileAsDataURL(imgNew[i], MAX_IMAGE_BYTES));
      } catch {
        newUrls.push(
          `https://picsum.photos/seed/mob-draft-${encodeURIComponent(propertyId)}-${Date.now()}-${i}/1200/800`,
        );
      }
    }
    return [...kept, ...newUrls].slice(0, 20);
  };

  const openMobileDraftModal = (p) => {
    setMobileDraftProp(p);
    setMobileDraftExtraFiles([]);
    setMobileDraftBranch(null);
    setMobileDraftForm({
      type: p.type || 'Bán',
      propertyType: p.propertyType || 'Căn hộ chung cư',
      area: p.area || '',
      price: p.price ? Number(p.price).toLocaleString('en-US') : '',
      priceUnit: p.priceUnit || 'tỷ VNĐ',
      direction: p.direction || '',
      condition: p.condition || '',
      source: p.source || '',
      furniture: p.furniture || '',
      floor: p.floor ?? '',
      bedrooms: p.bedrooms ?? '',
      bathrooms: p.bathrooms ?? '',
      description: p.description || '',
      legalStatus: p.legalStatus || p.legal || 'Sổ đỏ',
      addressFields: propertyToAddressFields(p),
      images: Array.isArray(p.images) ? p.images.filter(Boolean) : [],
    });
  };

  const assertMobileDraftDupOk = async (addr, listingType, excludeId) => {
    if (listingType !== 'Bán') return true;
    try {
      const res = await axios.get(`${API}/properties`);
      const dups = findDuplicateProperties(res.data, { type: listingType, address: addr, excludeId });
      if (dups.length === 0) return true;
      return window.confirm(
        `⚠️ Phát hiện địa chỉ có thể trùng với hồ sơ ${formatPropertyId(dups[0].propertyCode || dups[0].id)}. Vẫn tiếp tục gửi duyệt?`,
      );
    } catch {
      alert('Không kiểm tra được trùng địa chỉ. Vui lòng thử lại.');
      return false;
    }
  };

  const handleMobileDraftSaveOnly = async () => {
    if (!mobileDraftProp || !mobileDraftForm) return;
    const draftAddr = mobileDraftForm.addressFields || propertyToAddressFields(mobileDraftProp);
    if (!mobileDraftForm.area && !mobileDraftForm.price && !buildFullAddress(draftAddr)) {
      alert('Vui lòng nhập ít nhất một số thông tin (địa chỉ, diện tích hoặc giá) trước khi lưu nháp.');
      return;
    }
    setMobileDraftSubmitting(true);
    const now = new Date().toISOString();
    let mergedImages = (mobileDraftForm.images || []).filter(Boolean);
    if (mobileDraftExtraFiles.length > 0) {
      try {
        mergedImages = await resolveMobileDraftImages(mobileDraftProp.id, mobileDraftForm, mobileDraftExtraFiles);
      } catch (err) {
        alert(err?.message || 'Không xử lý được file ảnh.');
        setMobileDraftSubmitting(false);
        return;
      }
    }
    const payload = {
      type: mobileDraftForm.type,
      propertyType: mobileDraftForm.propertyType,
      area: Number(String(mobileDraftForm.area).replace(/,/g, '')) || 0,
      price: Number(String(mobileDraftForm.price).replace(/,/g, '')) || 0,
      priceUnit: mobileDraftForm.priceUnit,
      direction: mobileDraftForm.direction,
      condition: mobileDraftForm.condition,
      source: mobileDraftForm.source,
      furniture: mobileDraftForm.furniture,
      floor: mobileDraftForm.floor === '' || mobileDraftForm.floor == null ? null : parseInt(String(mobileDraftForm.floor), 10),
      bedrooms: Number(mobileDraftForm.bedrooms) || 0,
      bathrooms: Number(mobileDraftForm.bathrooms) || 0,
      description: mobileDraftForm.description,
      legalStatus: mobileDraftForm.legalStatus,
      address: buildFullAddress(draftAddr) || mobileDraftProp.address,
      district: draftAddr.district || '',
      ward: draftAddr.ward || '',
      houseNumber: draftAddr.houseNumber || '',
      street: draftAddr.street || '',
      province: draftAddr.province || DEFAULT_PROVINCE,
      futureWard: draftAddr.futureWard || null,
      images: mergedImages,
      level1_status: 'Mới',
      statusLv1: 'Mới',
      is_draft: true,
      updatedAt: now,
    };
    try {
      await axios.patch(`${API}/properties/${encodeURIComponent(mobileDraftProp.id)}`, payload);
      await logAudit(`[Mobile F2] Cập nhật nháp ${mobileDraftProp.id}`, mobileDraftProp.id, {
        actionType: AUDIT_ACTION_TYPE.PROPERTY_F2_DRAFT_UPDATE,
        property_id: mobileDraftProp.propertyCode || mobileDraftProp.id,
      });
      alert(`✅ Đã lưu nháp ${formatPropertyId(mobileDraftProp.propertyCode || mobileDraftProp.id)}.`);
      closeMobileDraftModal();
      fetchData();
    } catch {
      alert('Lỗi khi lưu nháp. Kiểm tra API.');
    }
    setMobileDraftSubmitting(false);
  };

  const handleMobileDraftSubmitForApproval = async () => {
    if (!mobileDraftProp || !mobileDraftForm) return;
    if (!mobileDraftBranch) {
      alert('Vui lòng chọn nhánh gửi duyệt (1 / 2 / 3) — đồng bộ với Web F2.');
      return;
    }
    const draftAddr = mobileDraftForm.addressFields || propertyToAddressFields(mobileDraftProp);
    const imgCount = countMobileDraftImages(mobileDraftForm, mobileDraftExtraFiles);
    const v = validatePropertySubmit({
      address: draftAddr,
      formData: mobileDraftForm,
      imageCount: imgCount,
      requireImages: true,
    });
    if (!v.ok) {
      alert(v.message);
      return;
    }
    const dupOk = await assertMobileDraftDupOk(draftAddr, mobileDraftForm.type, mobileDraftProp.id);
    if (!dupOk) return;

    setMobileDraftSubmitting(true);
    let mergedImages;
    try {
      mergedImages = await resolveMobileDraftImages(mobileDraftProp.id, mobileDraftForm, mobileDraftExtraFiles);
    } catch (err) {
      alert(err?.message || 'Không xử lý được file ảnh.');
      setMobileDraftSubmitting(false);
      return;
    }

    let lv1Status = '';
    if (mobileDraftBranch === 1) lv1Status = 'Chờ KH ký';
    else if (mobileDraftBranch === 2) lv1Status = 'Chờ duyệt đảm bảo';
    else if (mobileDraftBranch === 3) lv1Status = 'Chờ POS duyệt';

    const now = new Date().toISOString();
    const body = {
      type: mobileDraftForm.type,
      propertyType: mobileDraftForm.propertyType,
      area: Number(String(mobileDraftForm.area).replace(/,/g, '')),
      price: Number(String(mobileDraftForm.price).replace(/,/g, '')),
      priceUnit: mobileDraftForm.priceUnit,
      bedrooms: Number(mobileDraftForm.bedrooms) || 0,
      bathrooms: Number(mobileDraftForm.bathrooms) || 0,
      direction: mobileDraftForm.direction,
      condition: mobileDraftForm.condition,
      source: mobileDraftForm.source,
      furniture: mobileDraftForm.furniture,
      floor:
        mobileDraftForm.floor === '' || mobileDraftForm.floor == null
          ? null
          : parseInt(String(mobileDraftForm.floor), 10),
      legalStatus: mobileDraftForm.legalStatus,
      description: mobileDraftForm.description,
      address: buildFullAddress(draftAddr) || mobileDraftProp.address,
      futureWard: draftAddr.futureWard || null,
      district: draftAddr.district || '',
      ward: draftAddr.ward || '',
      houseNumber: draftAddr.houseNumber || '',
      street: draftAddr.street || '',
      province: draftAddr.province || DEFAULT_PROVINCE,
      images: mergedImages,
      statusLv1: lv1Status,
      level1_status: lv1Status,
      statusLv2: 'Chưa niêm yết',
      level2_status: 'Chưa niêm yết',
      is_draft: false,
      updatedAt: now,
      approval_branch: mobileDraftBranch,
    };
    if (mobileDraftBranch === 1) {
      body.esign_sent_at = now;
      body.esign_link_demo = `https://esign.ihouzz.demo/kh-ky/${Date.now()}`;
    }

    const savedId = mobileDraftProp.id;
    const logAction =
      mobileDraftBranch === 1
        ? `[F2-Mobile] Nhánh 1 — Gửi link eSign KH, ${savedId} → Chờ KH ký`
        : mobileDraftBranch === 2
          ? `[F2-Mobile] Nhánh 2 — Gửi duyệt đảm bảo ${savedId}`
          : `[F2-Mobile] Nhánh 3 — Gửi duyệt POS ${savedId}`;

    try {
      await axios.patch(`${API}/properties/${encodeURIComponent(savedId)}`, body);
      await postEntityAudit({
        action: logAction,
        actionType: AUDIT_ACTION_TYPE.PROPERTY_F2_MOBILE_SUBMIT_WAREHOUSE,
        entityId: savedId,
        property_id: savedId,
        user: currentUserObj.name || 'Đầu chủ (Mobile)',
        user_id: USER_ID,
        extra: { mobileDraftBranch },
      });
      if (mobileDraftBranch === 1) {
        await axios.post(`${API}/notifications`, {
          propertyId: savedId,
          recipient: 'Khách hàng (demo)',
          message: `[Demo eSign] Link ký HĐMG đã gửi qua Zalo OA / Email cho ${formatPropertyId(savedId)}.`,
          type: 'info',
          createdAt: now,
          isRead: false,
        });
      } else if (mobileDraftBranch === 2 || mobileDraftBranch === 3) {
        await axios.post(`${API}/notifications`, {
          propertyId: savedId,
          recipient: currentUserObj.pos_name ? 'GĐ POS' : 'Giám đốc POS',
          message:
            mobileDraftBranch === 2
              ? `Tài sản ${formatPropertyId(savedId)} chờ phê duyệt Kho Đảm bảo.`
              : `Tài sản ${formatPropertyId(savedId)} chờ phê duyệt nhập Kho Chuẩn (HĐMG đã ký).`,
          type: 'info',
          createdAt: now,
          isRead: false,
        });
      }
      const code = formatPropertyId(savedId);
      if (mobileDraftBranch === 1) {
        alert(`✅ ${code} — Đã gửi link ký KH (Chờ KH ký). Xác nhận sau khi KH ký, rồi Gửi duyệt POS.`);
      } else if (mobileDraftBranch === 2) {
        alert(`✅ ${code} — Đã gửi «Chờ duyệt đảm bảo».`);
      } else {
        alert(`✅ ${code} — Đã gửi «Chờ POS duyệt».`);
      }
      closeMobileDraftModal();
      fetchData();
    } catch (e) {
      console.error(e);
      alert('Lỗi khi gửi duyệt. Kiểm tra API.');
    }
    setMobileDraftSubmitting(false);
  };

  const handleMobileConfirmKhSigned = async (row) => {
    if (!row) return;
    const code = formatPropertyId(row.propertyCode || row.id);
    if (!window.confirm(`Xác nhận Khách hàng đã ký HĐMG cho ${code}?`)) return;
    const t = new Date().toISOString();
    try {
      await axios.patch(`${API}/properties/${encodeURIComponent(row.id)}`, {
        level1_status: 'KH đã ký',
        statusLv1: 'KH đã ký',
        kh_signed_at: t,
        updatedAt: t,
      });
      await postEntityAudit({
        action: `[F2-Mobile] Xác nhận KH đã ký ${code}`,
        actionType: AUDIT_ACTION_TYPE.PROPERTY_F2_MOBILE_ESIGN_CONFIRMED,
        entityId: row.id,
        property_id: row.propertyCode || row.id,
        user: currentUserObj.name || 'Đầu chủ (Mobile)',
        user_id: USER_ID,
        old_status: row.level1_status || row.statusLv1,
        new_status: 'KH đã ký',
      });
      fetchData();
      alert(`✅ ${code}: trạng thái «KH đã ký». Bạn có thể bấm «Gửi duyệt POS».`);
    } catch {
      alert('Lỗi cập nhật trạng thái.');
    }
  };

  const handleMobileSendEsignToPos = async (row) => {
    if (!row) return;
    if (row.level1_status !== 'KH đã ký' && row.statusLv1 !== 'KH đã ký') {
      alert('Chỉ gửi POS sau khi trạng thái là «KH đã ký».');
      return;
    }
    const t = new Date().toISOString();
    const code = formatPropertyId(row.propertyCode || row.id);
    try {
      await axios.patch(`${API}/properties/${encodeURIComponent(row.id)}`, {
        level1_status: 'Chờ POS duyệt',
        statusLv1: 'Chờ POS duyệt',
        submitted_to_pos_at: t,
        updatedAt: t,
      });
      await postEntityAudit({
        action: `[F2-Mobile] Gửi duyệt POS ${code}`,
        actionType: AUDIT_ACTION_TYPE.PROPERTY_F2_MOBILE_SEND_POS_ESIGN,
        entityId: row.id,
        property_id: row.propertyCode || row.id,
        user: currentUserObj.name || 'Đầu chủ (Mobile)',
        user_id: USER_ID,
        old_status: 'KH đã ký',
        new_status: 'Chờ POS duyệt',
      });
      await axios.post(`${API}/notifications`, {
        propertyId: row.propertyCode || row.id,
        recipient: currentUserObj.pos_name ? 'GĐ POS' : 'Giám đốc POS',
        message: `Tài sản ${code} (KH đã ký HĐMG) chờ phê duyệt nhập kho.`,
        type: 'info',
        createdAt: t,
        isRead: false,
      });
      fetchData();
      alert(`✅ Đã gửi ${code} tới Giám đốc POS (Chờ POS duyệt).`);
    } catch {
      alert('Lỗi khi gửi duyệt POS.');
    }
  };

  const statusBadge = (lv1, lv2) => {
    const colorMap = {
      Mới: 'warning',
      'Chờ POS duyệt': 'warning',
      'Chờ duyệt đảm bảo': 'warning',
      'Được duyệt': 'success',
      'Được đảm bảo': 'success',
      'Bị từ chối': 'danger',
      'Từ chối': 'danger',
      'Chờ KH ký': 'info',
      'KH đã ký': 'info',
      'Đã gỡ nguồn': 'secondary',
      'Chờ duyệt gỡ nguồn': 'danger',
    };
    const colorMap2 = {
      'Chưa niêm yết': 'secondary', 'Chờ MKT duyệt': 'info',
      'Đang niêm yết': 'success', 'Đã gỡ': 'dark',
    };
    return (
      <div className="d-flex flex-column gap-1 align-items-end">
        <span className={`badge bg-${colorMap[lv1] || 'secondary'}`}>{lv1}</span>
        <span className={`badge bg-${colorMap2[lv2] || 'secondary'}`}>{lv2}</span>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }} className="p-3 pb-5">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h5 className="fw-bold m-0"><i className="bi bi-phone-fill text-primary me-2"></i>App Đầu Chủ</h5>
          <small className="text-muted">iHouzz Internal System</small>
        </div>
        <span className="badge bg-primary">Đầu chủ · Mobile</span>
      </div>

      {/* Tab bar */}
      <div className="btn-group w-100 mb-4" role="group">
        <button className={`btn ${activeTab === 'create' ? 'btn-primary' : 'btn-outline-primary'}`}
          onClick={() => setActiveTab('create')}>
          <i className="bi bi-plus-circle me-1"></i>Tạo Tài sản
        </button>
        <button className={`btn ${activeTab === 'myprops' ? 'btn-primary' : 'btn-outline-primary'}`}
          onClick={() => { setActiveTab('myprops'); fetchData(); }}>
          <i className="bi bi-building me-1"></i>Tài sản của tôi
          <span className="badge bg-white text-primary ms-2">{myPropsDisplayed.length}</span>
        </button>
      </div>

      {/* TAB: Tạo tài sản */}
      {activeTab === 'create' && !listingForm && (
        <form onSubmit={handleCreateProp}>
          {/* Loại giao dịch */}
          <div className="card border-0 shadow-sm p-3 mb-3">
            <h6 className="fw-bold mb-2"><i className="bi bi-tags-fill text-primary me-2"></i>Loại Giao Dịch</h6>
            <div className="d-flex gap-3">
              {['Bán', 'Thuê'].map(t => (
                <div className="form-check" key={t}>
                  <input className="form-check-input" type="radio" name="mob_gdType"
                    id={`mob_gd${t}`} value={t} checked={formData.type === t}
                    onChange={e => { setFormData({ ...formData, type: e.target.value }); setDupAlert(null); }} />
                  <label className="form-check-label small" htmlFor={`mob_gd${t}`}>
                    {t === 'Bán' ? '🏷️ Mua Bán' : '🔑 Cho Thuê'}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* SmartAddress - compact mode */}
          <div className="card border-0 shadow-sm p-3 mb-3">
            <h6 className="fw-bold mb-3"><i className="bi bi-geo-alt-fill text-danger me-2"></i>Địa Chỉ Tài Sản</h6>
            <SmartAddress value={address} onChange={newAddr => { setAddress(newAddr); setDupAlert(null); }} compact={true} />
            <button type="button" className="btn btn-sm btn-outline-primary mt-2 w-100"
              onClick={handleDupCheck} disabled={!address.houseNumber || !address.street}>
              <i className="bi bi-search me-1"></i>Kiểm tra trùng địa chỉ
            </button>
            {dupAlert === 'clear' && <div className="alert alert-success py-1 px-2 mt-2 small"><i className="bi bi-check-circle-fill me-1"></i>Địa chỉ chưa có trong hệ thống</div>}
            {dupAlert === 'dup' && <div className="alert alert-warning py-1 px-2 mt-2 small"><i className="bi bi-exclamation-triangle-fill me-1"></i>Có thể trùng với {dupInfo?.id}. Vẫn có thể tiếp tục.</div>}
          </div>

          {/* Thông tin kỹ thuật */}
          <div className="card border-0 shadow-sm p-3 mb-3">
            <h6 className="fw-bold mb-2"><i className="bi bi-building me-2 text-success"></i>Thông Tin Kỹ Thuật</h6>
            <div className="mb-2">
              <label className="form-label small text-muted">Loại BĐS</label>
              <select className="form-select form-select-sm" value={formData.propertyType}
                onChange={e => setFormData({ ...formData, propertyType: e.target.value })}>
                <option>Căn hộ chung cư</option><option>Nhà phố</option>
                <option>Đất nền</option><option>Biệt thự</option><option>Shophouse</option><option>Văn phòng</option>
              </select>
            </div>
            <div className="mb-2">
              <label className="form-label small text-muted">Pháp lý</label>
              <select className="form-select form-select-sm" value={formData.legalStatus}
                onChange={e => setFormData({ ...formData, legalStatus: e.target.value })}>
                <option>Sổ đỏ</option><option>Sổ hồng</option><option>Hợp đồng mua bán</option><option>Đang chờ sổ</option>
              </select>
            </div>
            <div className="row g-2 mb-2">
              <div className="col-12">
                <label className="form-label small text-muted">Diện tích (m²) *</label>
                <input type="text" className="form-control form-control-sm" required
                  placeholder="VD: 60" value={formData.area} onChange={handleAreaChange} />
              </div>
              <div className="col-12">
                <label className="form-label small text-muted">Giá *</label>
                <div className="input-group input-group-sm">
                  <input type="text" className="form-control" required
                    placeholder="VD: 6.7 (Tỷ)" value={formData.price} onChange={handlePriceChange} />
                  <select className="form-select" style={{maxWidth: '110px'}}
                    value={formData.priceUnit} onChange={e => setFormData({ ...formData, priceUnit: e.target.value })}>
                    <option value="tỷ VNĐ">tỷ VNĐ</option>
                    <option value="triệu VNĐ">triệu VNĐ</option>
                    <option value="VNĐ">VNĐ</option>
                    <option value="VNĐ/tháng">VN/tháng</option>
                    <option value="triệu VNĐ/tháng">tr/tháng</option>
                  </select>
                </div>
              </div>
              <div className="col-6">
                <label className="form-label small text-muted">Phòng ngủ</label>
                <input type="number" className="form-control form-control-sm" min="0"
                  value={formData.bedrooms} onChange={e => setFormData({ ...formData, bedrooms: e.target.value })} />
              </div>
              <div className="col-6">
                <label className="form-label small text-muted">Phòng tắm</label>
                <input type="number" className="form-control form-control-sm" min="0"
                  value={formData.bathrooms} onChange={e => setFormData({ ...formData, bathrooms: e.target.value })} />
              </div>
              <div className="col-6">
                <label className="form-label small text-muted">Hướng</label>
                <select className="form-select form-select-sm" value={formData.direction}
                  onChange={e => setFormData({ ...formData, direction: e.target.value })}>
                  <option value="">-- Chọn --</option>
                  <option>Đông</option><option>Tây</option><option>Nam</option><option>Bắc</option>
                  <option>Đông Nam</option><option>Đông Bắc</option><option>Tây Nam</option><option>Tây Bắc</option>
                </select>
              </div>
              <div className="col-6">
                <label className="form-label small text-muted">Tình trạng</label>
                <select className="form-select form-select-sm" value={formData.condition}
                  onChange={e => setFormData({ ...formData, condition: e.target.value })}>
                  <option value="">-- Chọn --</option>
                  <option>Nhà mới</option>
                  <option>Đang sử dụng</option>
                  <option>Cần cải tạo</option>
                </select>
              </div>
              <div className="col-6">
                <label className="form-label small text-muted">Nguồn hàng</label>
                <select className="form-select form-select-sm" value={formData.source}
                  onChange={e => setFormData({ ...formData, source: e.target.value })}>
                  <option value="">-- Chọn --</option>
                  <option>Chuyển nhượng</option>
                  <option>Dự án</option>
                  <option>Cá nhân</option>
                </select>
              </div>
              <div className="col-6">
                <label className="form-label small text-muted">Nội thất</label>
                <select className="form-select form-select-sm" value={formData.furniture}
                  onChange={e => setFormData({ ...formData, furniture: e.target.value })}>
                  <option value="">-- Chọn --</option>
                  <option>Đầy đủ</option>
                  <option>Cơ bản</option>
                  <option>Nhà trống</option>
                </select>
              </div>
              <div className="col-12">
                <label className="form-label small text-muted">Tầng</label>
                <input type="number" className="form-control form-control-sm" min="1" placeholder="Số tầng (nguyên)"
                  value={formData.floor} 
                  onChange={e => {
                    const val = e.target.value;
                    if (!val || /^\d+$/.test(val)) setFormData({ ...formData, floor: val });
                  }} />
              </div>
            </div>
            <textarea className="form-control form-control-sm mb-3" rows="2"
              placeholder="Mô tả thêm..." value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })} />
              
            <h6 className="fw-bold mb-2"><i className="bi bi-paperclip me-2 text-warning"></i>Ảnh &amp; tệp</h6>
            <p className="small text-danger mb-2">* Bắt buộc ít nhất 1 ảnh (JPG/PNG/WebP).</p>
            <div className="border border-2 border-dashed rounded p-3 text-center bg-light text-muted mb-3 position-relative" style={{ cursor: 'pointer' }}>
              <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,image/*"
                className="position-absolute w-100 h-100 opacity-0 top-0 start-0" style={{ cursor: 'pointer' }}
                onChange={handleFileUpload} />
              <i className="bi bi-cloud-arrow-up fs-3 text-primary"></i>
              <p className="mt-1 mb-0 fw-bold text-dark small">Nhấn để tải file lên</p>
              <div style={{ fontSize: '11px' }}>Ảnh bắt buộc + PDF, max 10MB</div>
            </div>
            
            {files.length > 0 && (
              <div className="mb-3">
                <ul className="list-group list-group-flush small">
                  {files.map((f, idx) => (
                    <li key={idx} className="list-group-item bg-transparent px-0 py-1 d-flex justify-content-between align-items-center border-bottom-0">
                      <span className="text-truncate text-primary" style={{maxWidth: '180px', cursor: 'pointer', textDecoration: 'underline'}} 
                            onClick={() => window.open(URL.createObjectURL(f), '_blank')} title="Click để xem file">
                        <i className="bi bi-file-earmark-image me-1"></i>{f.name}
                      </span>
                      <div>
                        <span className="text-muted" style={{fontSize: '11px', marginRight: '8px'}}>{(f.size / (1024 * 1024)).toFixed(1)} MB</span>
                        <i className="bi bi-x-circle-fill text-danger fs-6" style={{cursor: 'pointer'}}
                           onClick={() => {
                             const newFiles = [...files];
                             newFiles.splice(idx, 1);
                             setFiles(newFiles);
                           }}></i>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <button type="submit" className="btn btn-primary w-100 fw-bold py-2" disabled={submitting}>
            {submitting ? <><span className="spinner-border spinner-border-sm me-2"></span>Đang gửi...</> :
              <><i className="bi bi-send me-2"></i>Gửi Duyệt Nhập Kho</>}
          </button>
        </form>
      )}

      {/* Soạn Tin Đăng (F4) - Mobile — đồng bộ UC004 web: tiêu đề/mô tả gen từ TS, SĐT, media → Library */}
      {activeTab === 'create' && listingForm && (
        <div className="card border-info border-2 p-3 mb-3">
          <div className="d-flex flex-column gap-2 mb-3">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm text-start"
              onClick={closeComposeToMyProps}
            >
              <i className="bi bi-arrow-left me-2"></i>Quay lại Tài sản của tôi
            </button>
            <h6 className="fw-bold text-info m-0">
              <i className="bi bi-megaphone me-2"></i>Soạn Tin Đăng (F4)
            </h6>
          </div>
          <form onSubmit={handleCreateListing}>
            <div className="alert alert-info py-2 px-2 small mb-3">
              <i className="bi bi-lightning-charge-fill me-1"></i>
              Tiêu đề &amp; mô tả đã gợi ý từ kho <strong>{listingForm.id}</strong> (giống web). Kiểm tra SĐT và ảnh/video trước khi gửi.
            </div>
            <div className="card bg-light border-0 mb-3 small">
              <div className="card-body py-2">
                <div className="fw-semibold mb-2">Thông tin tài sản</div>
                <div className="mb-1 text-muted text-truncate">{listingForm.address}</div>
                <div className="d-flex flex-wrap gap-2 text-muted">
                  <span>{listingForm.type}</span>
                  <span>·</span>
                  <span>{listingForm.propertyType}</span>
                  <span>·</span>
                  <span>
                    {listingForm.price_display ||
                      `${Number(listingForm.price || 0).toLocaleString('en-US')} ${listingForm.priceUnit || 'VNĐ'}`}
                  </span>
                  <span>·</span>
                  <span>{Number(listingForm.area || 0).toLocaleString('en-US')} m²</span>
                </div>
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 mt-2"
                  onClick={() => {
                    setListingTitle(buildListingTitleFromProperty(listingForm));
                    setListingDesc(buildListingDescriptionFromProperty(listingForm));
                  }}
                >
                  Lấy lại tiêu đề &amp; mô tả từ tài sản
                </button>
              </div>
            </div>
            <div className="mb-2">
              <label className="form-label small text-muted">SĐT liên hệ *</label>
              <input
                className="form-control form-control-sm"
                required
                inputMode="tel"
                autoComplete="tel"
                placeholder="VD: 0901234567"
                value={listingContactPhone}
                onChange={(e) => setListingContactPhone(e.target.value)}
              />
            </div>
            <div className="mb-2">
              <label className="form-label small text-muted">Tiêu đề tin đăng *</label>
              <input
                className="form-control form-control-sm"
                required
                maxLength={100}
                value={listingTitle}
                onChange={(e) => setListingTitle(e.target.value)}
              />
              <div className="form-text text-end">{listingTitle.length}/100</div>
            </div>
            <div className="mb-2">
              <label className="form-label small text-muted">Mô tả tin đăng *</label>
              <textarea
                className="form-control form-control-sm"
                rows={8}
                required
                value={listingDesc}
                onChange={(e) => setListingDesc(e.target.value)}
              />
            </div>
            <div className="mb-3">
              <div className="fw-semibold small mb-2">
                <i className="bi bi-images me-1 text-primary"></i>Ảnh &amp; video (lưu Library như web)
              </div>
              <p className="small text-muted mb-2">
                Ảnh kho đã nạp sẵn; có thể thêm file hoặc URL. File lớn nên dùng URL http(s).
              </p>
              <div className="d-flex flex-wrap gap-1 mb-2">
                {listingComposeMedia.map((m) => (
                  <div key={m.clientKey} className="position-relative border rounded overflow-hidden" style={{ width: 72, height: 54 }}>
                    {m.kind === 'image' ? (
                      <img src={m.url} alt="" className="w-100 h-100" style={{ objectFit: 'cover' }} />
                    ) : (
                      <div className="w-100 h-100 bg-dark d-flex align-items-center justify-content-center text-white small">
                        ▶
                      </div>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm btn-danger position-absolute top-0 end-0 p-0 lh-1"
                      style={{ fontSize: 9, transform: 'translate(25%,-25%)' }}
                      onClick={() =>
                        setListingComposeMedia((prev) => prev.filter((x) => x.clientKey !== m.clientKey))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <input
                type="file"
                className="form-control form-control-sm mb-2"
                accept="image/*,video/*"
                multiple
                onChange={handleListingComposeMediaUpload}
              />
              <label className="form-label small text-muted">Thêm ảnh từ URL (mỗi dòng / cách phẩy)</label>
              <div className="input-group input-group-sm mb-2">
                <input
                  className="form-control"
                  placeholder="https://..."
                  value={listingImageUrlInput}
                  onChange={(e) => setListingImageUrlInput(e.target.value)}
                />
                <button type="button" className="btn btn-outline-primary" onClick={addListingImageUrlsFromInput}>
                  Thêm
                </button>
              </div>
              <label className="form-label small text-muted">Thêm video từ URL</label>
              <div className="input-group input-group-sm mb-2">
                <input
                  className="form-control"
                  placeholder="https://...mp4"
                  value={listingVideoUrlInput}
                  onChange={(e) => setListingVideoUrlInput(e.target.value)}
                />
                <button type="button" className="btn btn-outline-primary" onClick={addListingVideoUrlsFromInput}>
                  Thêm
                </button>
              </div>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm w-100 mb-2"
                onClick={() => setShowListingComposePreview(true)}
              >
                <i className="bi bi-eye me-1"></i>Xem trước bài đăng (website)
              </button>
            </div>
            <div className="d-flex flex-column gap-2">
              <button
                type="submit"
                className="btn btn-info text-white btn-sm fw-bold w-100"
                disabled={listingComposeSubmitting}
              >
                {listingComposeSubmitting ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" />
                    Đang gửi…
                  </>
                ) : (
                  <>
                    <i className="bi bi-send me-1"></i>Gửi MKT duyệt
                  </>
                )}
              </button>
              <button type="button" className="btn btn-outline-secondary btn-sm w-100" onClick={closeComposeToMyProps}>
                Hủy — về Tài sản của tôi
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB: Tài sản của tôi */}
      {activeTab === 'myprops' && (
        <div>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="fw-bold m-0">Tài sản của tôi</h6>
            <button className="btn btn-sm btn-outline-primary" onClick={fetchData} title="Đồng bộ với web / máy chủ">
              <i className="bi bi-arrow-clockwise"></i>
            </button>
          </div>
          {!USER_ID && (
            <div className="alert alert-warning small py-2 mb-3">
              <i className="bi bi-person-lock me-1"></i>
              Chưa có phiên đăng nhập (thiếu <code>user.id</code> trong <code>localStorage</code>). Hãy đăng nhập trên phiên bản web (OTP mặc định <strong>111111</strong>), rồi quay lại đây hoặc bấm làm mới — dữ liệu đồng bộ với cùng tài khoản.
            </div>
          )}
          {fetchError && (
            <div className="alert alert-danger small py-2 mb-3">
              <i className="bi bi-wifi-off me-1"></i>{fetchError}
            </div>
          )}
          {USER_ID && (
            <div className="form-text small text-muted mb-2">
              Đồng bộ: tab khác / đăng nhập web, khi mở lại tab điện thoại, hoặc tự làm mới khoảng 28 giây khi đang ở tab này.
            </div>
          )}
          <div className="mb-3">
            <label className="form-label small text-muted mb-1">Tìm kiếm theo ký tự</label>
            <div className="input-group input-group-sm">
              <span className="input-group-text"><i className="bi bi-search"></i></span>
              <input
                type="search"
                className="form-control"
                placeholder="Mã LS, địa chỉ, loại BĐS, bán/thuê, giá, kho, trạng thái…"
                value={myPropsSearch}
                onChange={(e) => setMyPropsSearch(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="mt-2">
              <label className="form-label small text-muted mb-1">Lọc trạng thái</label>
              <select
                className="form-select form-select-sm"
                value={myPropsStatusFilter}
                onChange={(e) => setMyPropsStatusFilter(e.target.value)}
              >
                {MY_PROPS_STATUS_OPTIONS.map((o) => (
                  <option key={o.value === MY_PROPS_STATUS_ALL ? '__all' : o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-check mt-2">
              <input
                className="form-check-input"
                type="checkbox"
                id="mobMyPropsShowRemoved"
                checked={includeRemovedMyProps}
                onChange={(e) => setIncludeRemovedMyProps(e.target.checked)}
              />
              <label className="form-check-label small" htmlFor="mobMyPropsShowRemoved">
                Hiển thị tài sản <strong className="text-danger">Đã gỡ nguồn</strong> (mặc định ẩn — đồng bộ Web F2)
              </label>
            </div>
            <div className="small text-muted mt-2">
              Hiển thị <strong>{myPropsDisplayed.length}</strong> / {myPropsListBase.length} tài sản
              {!includeRemovedMyProps && (
                <span>
                  {' '}
                  · Đang ẩn <strong>Đã gỡ nguồn</strong>
                </span>
              )}
            </div>
          </div>

          {myRejectedMktListings.length > 0 && (
            <div className="card border-warning border-2 mb-3 p-3">
              <h6 className="fw-bold mb-2">
                <i className="bi bi-megaphone me-1 text-warning"></i>Tin đăng MKT từ chối — gửi lại
              </h6>
              {myRejectedMktListings.map((l) => (
                <div key={l.id} className="border rounded p-2 mb-2 small bg-light">
                  <div className="fw-bold text-primary">{formatListingId(l.listingCode || l.id)}</div>
                  <div className="text-muted text-truncate">{l.title}</div>
                  {(l.rejection_note || l.prev_rejection_note) && (
                    <div className="text-danger small mt-1">
                      <strong>Lý do:</strong> {l.rejection_note || l.prev_rejection_note}
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn btn-warning btn-sm mt-2 fw-bold text-dark w-100"
                    onClick={() => openMktResubmitListing(l)}
                  >
                    <i className="bi bi-send me-1"></i>Chỉnh &amp; gửi lại MKT
                  </button>
                </div>
              ))}
            </div>
          )}

          {USER_ID && myPropsListBase.length === 0 && !fetchError && (
            <div className="text-center text-muted py-5">Chưa có tài sản nào</div>
          )}
          {USER_ID && myPropsListBase.length > 0 && myPropsDisplayed.length === 0 && (
            <div className="text-center text-muted py-4">Không có tài sản khớp bộ lọc / tìm kiếm.</div>
          )}
          {myPropsDisplayed
            .slice()
            .reverse()
            .map((p) => {
              const lv1 = p.level1_status || p.statusLv1 || '—';
              const lv2 = p.level2_status || p.statusLv2 || '—';
              return (
                <div key={p.id} className="card shadow-sm border-0 mb-3 p-3">
                  <div className="d-flex justify-content-between mb-2">
                    <span className="fw-bold text-primary">{formatPropertyId(p.propertyCode || p.id)}</span>
                    {statusBadge(lv1, lv2)}
                  </div>
                  <div className="small text-muted mb-1">{p.address}</div>
                  {p.futureWard && (
                    <div className="small text-info mb-1">
                      <i className="bi bi-map me-1"></i>P.mới: {p.futureWard}
                    </div>
                  )}
                  <div className="small text-muted mb-1">
                    <span className="text-dark fw-semibold">Loại BĐS:</span> {p.propertyType || '—'}
                  </div>
                  <div className="small text-muted mb-1">
                    <span className="text-dark fw-semibold">Loại GD:</span> {p.type || '—'}
                  </div>
                  <div className="small text-muted mb-1">
                    <span className="text-dark fw-semibold">Giá:</span> {formatMyPropsPriceDisplay(p)}
                  </div>
                  <div className="small text-muted mb-1">
                    <span className="text-dark fw-semibold">Kho:</span> {warehouseLabel(p)}
                  </div>
                  <div className="small text-muted mb-2">
                    {Number(p.area || 0).toLocaleString('en-US')} m²
                  </div>
                  {p.update_request_status === UPDATE_REQUEST_PENDING && (
                    <div className="alert alert-info py-2 small mb-2">
                      <i className="bi bi-hourglass-split me-1"></i>Chờ GĐ POS duyệt cập nhật
                    </div>
                  )}
                  {lv1 === 'Bị từ chối' && (p.rejection_reason || p.rejected_reason) && (
                    <div className="alert alert-danger py-2 small mb-2">
                      <strong>Lý do từ chối:</strong> {p.rejection_reason || p.rejected_reason}
                    </div>
                  )}

                  <div className="d-flex flex-column gap-2">
                    {lv1 === 'Mới' && sameUserId(p.createdBy_id, USER_ID) && (
                      <button
                        type="button"
                        className="btn btn-warning btn-sm text-dark fw-bold"
                        onClick={() => openMobileDraftModal(p)}
                      >
                        <i className="bi bi-pencil-square me-1"></i>Hoàn thiện hồ sơ nháp
                      </button>
                    )}
                    {lv1 === 'Chờ KH ký' && sameUserId(p.createdBy_id, USER_ID) && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm fw-bold"
                        onClick={() => handleMobileConfirmKhSigned(p)}
                      >
                        <i className="bi bi-check2-circle me-1"></i>Xác nhận KH đã ký
                      </button>
                    )}
                    {lv1 === 'KH đã ký' && sameUserId(p.createdBy_id, USER_ID) && (
                      <button
                        type="button"
                        className="btn btn-success btn-sm fw-bold"
                        onClick={() => handleMobileSendEsignToPos(p)}
                      >
                        <i className="bi bi-send-check me-1"></i>Gửi duyệt POS
                      </button>
                    )}
                    {lv1 === 'Bị từ chối' && sameUserId(p.createdBy_id, USER_ID) && (
                      <button type="button" className="btn btn-warning btn-sm text-dark fw-bold" onClick={() => openRejectedEdit(p)}>
                        <i className="bi bi-pencil-square me-1"></i>Chỉnh sửa &amp; gửi duyệt lại
                      </button>
                    )}
                    {canRequestPropertyUpdate(p, USER_ID, listings) && (
                      <button type="button" className="btn btn-outline-primary btn-sm fw-bold" onClick={() => openUpModal(p)}>
                        <i className="bi bi-layout-sidebar-reverse me-1"></i>Gửi yêu cầu cập nhật
                      </button>
                    )}
                    {lv1 === 'Được duyệt' && lv2 === 'Chưa niêm yết' && (
                      <button className="btn btn-outline-info btn-sm" onClick={() => openListingCompose(p)}>
                        <i className="bi bi-megaphone me-1"></i>Soạn Tin Đăng (F4)
                      </button>
                    )}
                    {lv2 === 'Đang niêm yết' && (
                      <div>
                        <select
                          className="form-select form-select-sm mb-2"
                          value={unlistTarget?.id === p.id ? unlistReason : ''}
                          onChange={(e) => {
                            setUnlistTarget(p);
                            setUnlistReason(e.target.value);
                          }}
                        >
                          <option value="">-- Chọn lý do gỡ tin --</option>
                          <option value="Đã bán">Đã bán</option>
                          <option value="Chủ ngưng bán">Chủ ngưng bán</option>
                          <option value="Thẩm định phí">Thẩm định phí</option>
                          <option value="Lý do khác">Lý do khác</option>
                        </select>
                        <button
                          className="btn btn-danger btn-sm w-100"
                          onClick={() => {
                            setUnlistTarget(p);
                            handleRequestUnlist();
                          }}
                          disabled={!unlistReason || unlistTarget?.id !== p.id}
                        >
                          <i className="bi bi-sign-stop me-1"></i>Gửi Yêu cầu Gỡ Tin (F6)
                        </button>
                      </div>
                    )}
                    {lv1 === 'Được duyệt' && lv2 !== 'Đang niêm yết' && lv2 !== 'Chờ MKT duyệt' && (
                      <button className="btn btn-outline-danger btn-sm" onClick={() => handleRemoveSource(p)}>
                        <i className="bi bi-x-octagon me-1"></i>Yêu cầu gỡ nguồn
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {upTarget && upForm && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000 }}>
          <div className="modal-dialog modal-dialog-scrollable modal-fullscreen-sm-down">
            <div className="modal-content">
              <div className="modal-header py-2 bg-primary text-white">
                <h6 className="modal-title fw-bold m-0">Cập nhật tài sản — {formatPropertyId(upTarget.propertyCode || upTarget.id)}</h6>
                <button type="button" className="btn-close btn-close-white" onClick={() => { setUpTarget(null); setUpForm(null); setUpExtraFiles([]); }} />
              </div>
              <div className="modal-body small">
                <p className="text-muted small mb-2">
                  Dữ liệu đang lưu so với bản đề xuất. Sau khi gửi, GĐ POS duyệt mới ghi đè.
                </p>
                <div className="card border bg-light mb-3">
                  <div className="card-header py-2 fw-bold">Đang có trên hệ thống</div>
                  <div className="card-body py-2">
                    <dl className="row mb-0 small">
                      <dt className="col-5 text-muted">Địa chỉ</dt>
                      <dd className="col-7">{upTarget.address}</dd>
                      <dt className="col-5 text-muted">Loại</dt>
                      <dd className="col-7">
                        {upTarget.type} · {upTarget.propertyType}
                      </dd>
                      <dt className="col-5 text-muted">Giá</dt>
                      <dd className="col-7">
                        {Number(upTarget.price || 0).toLocaleString('en-US')} {upTarget.priceUnit}
                      </dd>
                      <dt className="col-5 text-muted">DT</dt>
                      <dd className="col-7">{upTarget.area} m²</dd>
                      <dt className="col-5 text-muted">PN / PT</dt>
                      <dd className="col-7">
                        {upTarget.bedrooms} / {upTarget.bathrooms}
                      </dd>
                      <dt className="col-5 text-muted">Tầng</dt>
                      <dd className="col-7">{upTarget.floor ?? '—'}</dd>
                      <dt className="col-5 text-muted">Hướng</dt>
                      <dd className="col-7">{upTarget.direction || '—'}</dd>
                      <dt className="col-5 text-muted">Hiện trạng</dt>
                      <dd className="col-7">{upTarget.condition || '—'}</dd>
                      <dt className="col-5 text-muted">Nguồn</dt>
                      <dd className="col-7">{upTarget.source || '—'}</dd>
                      <dt className="col-5 text-muted">Nội thất</dt>
                      <dd className="col-7">{upTarget.furniture || '—'}</dd>
                      <dt className="col-5 text-muted">Pháp lý</dt>
                      <dd className="col-7">{upTarget.legalStatus || upTarget.legal || '—'}</dd>
                      <dt className="col-5 text-muted">Mô tả</dt>
                      <dd className="col-7" style={{ whiteSpace: 'pre-wrap' }}>
                        {upTarget.description || '—'}
                      </dd>
                    </dl>
                    <div className="mt-2 text-muted small">Ảnh: {(upTarget.images || []).length}</div>
                    <div className="d-flex flex-wrap gap-1 mt-1">
                      {(upTarget.images || []).slice(0, 6).map((url, i) => (
                        <img key={i} src={url} alt="" className="rounded border" style={{ width: 56, height: 42, objectFit: 'cover' }} />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="card border border-primary mb-3">
                  <div className="card-header py-2 fw-bold bg-primary bg-opacity-10">Thông tin cập nhật đề xuất</div>
                  <div className="card-body py-2">
                    <label className="form-label">Địa chỉ</label>
                    <textarea className="form-control form-control-sm mb-2" rows={2} value={upForm.address}
                      onChange={(e) => setUpForm({ ...upForm, address: e.target.value })} />
                    <div className="row g-2 mb-2">
                      <div className="col-6">
                        <label className="form-label">Loại GD</label>
                        <select className="form-select form-select-sm" value={upForm.type}
                          onChange={(e) => setUpForm({ ...upForm, type: e.target.value })}>
                          <option>Bán</option>
                          <option>Thuê</option>
                        </select>
                      </div>
                      <div className="col-6">
                        <label className="form-label">Loại BĐS</label>
                        <select className="form-select form-select-sm" value={upForm.propertyType}
                          onChange={(e) => setUpForm({ ...upForm, propertyType: e.target.value })}>
                          <option>Căn hộ chung cư</option>
                          <option>Nhà phố</option>
                          <option>Đất nền</option>
                          <option>Biệt thự</option>
                          <option>Shophouse</option>
                        </select>
                      </div>
                    </div>
                    <div className="row g-2 mb-2">
                      <div className="col-6">
                        <label className="form-label">DT (m²)</label>
                        <input className="form-control form-control-sm" value={upForm.area}
                          onChange={(e) => setUpForm({ ...upForm, area: e.target.value.replace(/\D/g, '') })} />
                      </div>
                      <div className="col-6">
                        <label className="form-label">Giá</label>
                        <input className="form-control form-control-sm" value={upForm.price}
                          onChange={(e) => {
                            let raw = String(e.target.value).replace(/,/g, '').replace(/[^\d.]/g, '');
                            const parts = raw.split('.');
                            if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
                            if (raw === '' || raw === '.') { setUpForm({ ...upForm, price: raw }); return; }
                            if (raw.endsWith('.') || (parts.length > 1 && parts[1].endsWith('0'))) {
                              const intPart = parts[0] ? parseInt(parts[0], 10).toLocaleString('en-US') : '0';
                              const decPart = parts.length > 1 ? '.' + parts[1] : '';
                              setUpForm({ ...upForm, price: intPart + decPart });
                              return;
                            }
                            const intPart = parts[0] ? parseInt(parts[0], 10).toLocaleString('en-US') : '0';
                            const decPart = parts.length > 1 && parts[1] ? '.' + parts[1] : '';
                            setUpForm({ ...upForm, price: intPart + decPart });
                          }} />
                      </div>
                    </div>
                    <label className="form-label">Đơn vị giá</label>
                    <select className="form-select form-select-sm mb-2" value={upForm.priceUnit}
                      onChange={(e) => setUpForm({ ...upForm, priceUnit: e.target.value })}>
                      <option value="tỷ VNĐ">tỷ VNĐ</option>
                      <option value="triệu VNĐ">triệu VNĐ</option>
                      <option value="VNĐ">VNĐ</option>
                      <option value="VNĐ/tháng">VNĐ/tháng</option>
                      <option value="triệu VNĐ/tháng">triệu VNĐ/tháng</option>
                    </select>
                    <div className="row g-2 mb-2">
                      <div className="col-4">
                        <label className="form-label">PN</label>
                        <input type="number" className="form-control form-control-sm" min="0"
                          value={upForm.bedrooms}
                          onChange={(e) => setUpForm({ ...upForm, bedrooms: e.target.value })} />
                      </div>
                      <div className="col-4">
                        <label className="form-label">PT</label>
                        <input type="number" className="form-control form-control-sm" min="0"
                          value={upForm.bathrooms}
                          onChange={(e) => setUpForm({ ...upForm, bathrooms: e.target.value })} />
                      </div>
                      <div className="col-4">
                        <label className="form-label">Tầng</label>
                        <input type="number" className="form-control form-control-sm" min="0"
                          value={upForm.floor}
                          onChange={(e) => setUpForm({ ...upForm, floor: e.target.value })} />
                      </div>
                    </div>
                    <div className="row g-2 mb-2">
                      <div className="col-6">
                        <label className="form-label">Hướng</label>
                        <select className="form-select form-select-sm" value={upForm.direction}
                          onChange={(e) => setUpForm({ ...upForm, direction: e.target.value })}>
                          <option value="">—</option>
                          <option>Đông</option>
                          <option>Tây</option>
                          <option>Nam</option>
                          <option>Bắc</option>
                          <option>Đông Nam</option>
                          <option>Đông Bắc</option>
                          <option>Tây Nam</option>
                          <option>Tây Bắc</option>
                        </select>
                      </div>
                      <div className="col-6">
                        <label className="form-label">Hiện trạng</label>
                        <select className="form-select form-select-sm" value={upForm.condition}
                          onChange={(e) => setUpForm({ ...upForm, condition: e.target.value })}>
                          <option value="">—</option>
                          <option>Nhà mới</option>
                          <option>Đang sử dụng</option>
                          <option>Cần cải tạo</option>
                        </select>
                      </div>
                    </div>
                    <div className="row g-2 mb-2">
                      <div className="col-6">
                        <label className="form-label">Nguồn hàng</label>
                        <select className="form-select form-select-sm" value={upForm.source}
                          onChange={(e) => setUpForm({ ...upForm, source: e.target.value })}>
                          <option value="">—</option>
                          <option>Chuyển nhượng</option>
                          <option>Dự án</option>
                          <option>Cá nhân</option>
                        </select>
                      </div>
                      <div className="col-6">
                        <label className="form-label">Nội thất</label>
                        <select className="form-select form-select-sm" value={upForm.furniture}
                          onChange={(e) => setUpForm({ ...upForm, furniture: e.target.value })}>
                          <option value="">—</option>
                          <option>Đầy đủ</option>
                          <option>Cơ bản</option>
                          <option>Nhà trống</option>
                        </select>
                      </div>
                    </div>
                    <label className="form-label">Pháp lý</label>
                    <select className="form-select form-select-sm mb-2" value={upForm.legalStatus}
                      onChange={(e) => setUpForm({ ...upForm, legalStatus: e.target.value })}>
                      <option>Sổ đỏ</option>
                      <option>Sổ hồng</option>
                      <option>Hợp đồng mua bán</option>
                      <option>Đang chờ sổ</option>
                    </select>
                    <label className="form-label">Mô tả</label>
                    <textarea className="form-control form-control-sm mb-2" rows={3} maxLength={500}
                      value={upForm.description} onChange={(e) => setUpForm({ ...upForm, description: e.target.value })} />
                    <label className="form-label">Ảnh (giữ / xóa / thêm)</label>
                    <div className="d-flex flex-wrap gap-1 mb-2">
                      {(upForm.images || []).map((url, i) => (
                        <div key={i} className="position-relative">
                          <img src={url} alt="" className="rounded border" style={{ width: 64, height: 48, objectFit: 'cover' }} />
                          <button type="button" className="btn btn-sm btn-danger position-absolute top-0 end-0 p-0 lh-1"
                            style={{ fontSize: 9, transform: 'translate(20%,-20%)' }}
                            onClick={() => setUpForm({ ...upForm, images: upForm.images.filter((_, j) => j !== i) })}>×</button>
                        </div>
                      ))}
                    </div>
                    <input type="file" className="form-control form-control-sm mb-2" accept="image/*" multiple onChange={handleUpExtraUpload} />
                    <label className="form-label">Ghi chú gửi GĐ POS (tuỳ chọn)</label>
                    <textarea className="form-control form-control-sm" rows={2} value={upNote} onChange={(e) => setUpNote(e.target.value)} />
                  </div>
                </div>
              </div>
              <div className="modal-footer py-2">
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => { setUpTarget(null); setUpForm(null); setUpExtraFiles([]); }}>Hủy</button>
                <button type="button" className="btn btn-primary btn-sm fw-bold" onClick={handleUpSubmit}>Gửi phê duyệt</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {mktResubmitCtx && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 2000 }}>
          <div className="modal-dialog modal-dialog-scrollable modal-fullscreen-sm-down">
            <div className="modal-content">
              <div className="modal-header py-2 bg-warning">
                <h6 className="modal-title fw-bold m-0 text-dark">
                  Gửi lại MKT — {formatListingId(mktResubmitCtx.listing.id)}
                </h6>
                <button type="button" className="btn-close" onClick={closeMktResubmit} aria-label="Đóng" />
              </div>
              <div className="modal-body small">
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm mb-3 w-100"
                  onClick={() => setShowMktListingPreview(true)}
                >
                  <i className="bi bi-eye me-1"></i>Xem trước bài đăng (website)
                </button>
                <div className="mb-2">
                  <label className="form-label">Tiêu đề tin *</label>
                  <input
                    className="form-control form-control-sm"
                    maxLength={100}
                    value={mktResubmitForm.title}
                    onChange={(e) => setMktResubmitForm({ ...mktResubmitForm, title: e.target.value })}
                  />
                </div>
                <div className="mb-2">
                  <label className="form-label">Mô tả *</label>
                  <textarea
                    className="form-control form-control-sm"
                    rows={4}
                    value={mktResubmitForm.description}
                    onChange={(e) => setMktResubmitForm({ ...mktResubmitForm, description: e.target.value })}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">SĐT liên hệ *</label>
                  <input
                    className="form-control form-control-sm"
                    value={mktResubmitForm.contact_phone}
                    onChange={(e) => setMktResubmitForm({ ...mktResubmitForm, contact_phone: e.target.value })}
                  />
                </div>
                <div className="mb-2 fw-bold">Ảnh / video</div>
                <div className="d-flex flex-wrap gap-1 mb-2">
                  {mktResubmitMedia.map((m) => (
                    <div key={m.clientKey} className="position-relative border rounded overflow-hidden" style={{ width: 72, height: 54 }}>
                      {m.kind === 'image' ? (
                        <img src={m.url} alt="" className="w-100 h-100" style={{ objectFit: 'cover' }} />
                      ) : (
                        <div className="w-100 h-100 bg-dark d-flex align-items-center justify-content-center text-white small">▶</div>
                      )}
                      <button
                        type="button"
                        className="btn btn-sm btn-danger position-absolute top-0 end-0 p-0 lh-1"
                        style={{ fontSize: 9, transform: 'translate(25%,-25%)' }}
                        onClick={() => setMktResubmitMedia((prev) => prev.filter((x) => x.clientKey !== m.clientKey))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <input
                  type="file"
                  className="form-control form-control-sm mb-3"
                  accept="image/*,video/*"
                  multiple
                  onChange={handleMktResubmitMediaUpload}
                />
                <label className="form-label">
                  Ghi chú gửi lại MKT <span className="text-danger">*</span> (≥ {RESUBMIT_NOTE_MIN} ký tự)
                </label>
                <textarea
                  className="form-control form-control-sm"
                  rows={3}
                  value={mktResubmitNote}
                  onChange={(e) => setMktResubmitNote(e.target.value)}
                  placeholder="Mô tả phần đã chỉnh theo phản hồi MKT…"
                />
              </div>
              <div className="modal-footer py-2">
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={closeMktResubmit} disabled={mktSubmitting}>
                  Hủy
                </button>
                <button
                  type="button"
                  className="btn btn-warning btn-sm fw-bold text-dark"
                  onClick={handleMktResubmitSubmit}
                  disabled={mktSubmitting}
                >
                  {mktSubmitting ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-1" />
                      Đang gửi…
                    </>
                  ) : (
                    <>
                      <i className="bi bi-send-check me-1"></i>Gửi lại MKT
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {mktResubmitCtx && (
        <ListingWebsitePreviewModal
          show={showMktListingPreview}
          onHide={() => setShowMktListingPreview(false)}
          title={mktResubmitForm.title}
          description={mktResubmitForm.description}
          contactPhone={mktResubmitForm.contact_phone}
          property={mktResubmitCtx.property}
          listing={mktResubmitCtx.listing}
          extraImageUrls={mktPreviewImageUrls}
        />
      )}

      {mobileDraftProp && mobileDraftForm && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 2100 }}>
          <div className="modal-dialog modal-dialog-scrollable">
            <div className="modal-content border-0 shadow">
              <div className="modal-header text-white py-2" style={{ background: 'linear-gradient(90deg,#f59e0b,#d97706)' }}>
                <h6 className="modal-title fw-bold m-0">
                  <i className="bi bi-pencil-square me-1"></i>
                  Hoàn thiện nháp — {formatPropertyId(mobileDraftProp.propertyCode || mobileDraftProp.id)}
                </h6>
                <button type="button" className="btn-close btn-close-white" onClick={closeMobileDraftModal} aria-label="Đóng" />
              </div>
              <div className="modal-body small">
                <div className="alert alert-warning py-2 mb-2">
                  <strong>Nháp (Mới)</strong> — Đủ Quận, Phường, Số nhà, Đường, diện tích, giá, <strong>ít nhất 1 ảnh</strong> trước khi Gửi duyệt. Loại <strong>Bán</strong>: kiểm tra trùng địa chỉ (đồng bộ Web F2).
                </div>
                <label className="form-label fw-semibold">
                  Địa chỉ (Quận, Phường, Số nhà, Đường) <span className="text-danger">*</span>
                </label>
                <SmartAddress
                  compact
                  value={mobileDraftForm.addressFields}
                  onChange={(addressFields) => {
                    setMobileDraftForm({ ...mobileDraftForm, addressFields });
                  }}
                />
                <div className="text-muted small mb-2 mt-1">
                  {buildFullAddress(mobileDraftForm.addressFields) || 'Chưa đủ thành phần địa chỉ'}
                </div>
                <div className="row g-2 mb-2">
                  <div className="col-6">
                    <label className="form-label">Loại GD</label>
                    <select
                      className="form-select form-select-sm"
                      value={mobileDraftForm.type}
                      onChange={(e) => setMobileDraftForm({ ...mobileDraftForm, type: e.target.value })}
                    >
                      <option>Bán</option>
                      <option>Thuê</option>
                    </select>
                  </div>
                  <div className="col-6">
                    <label className="form-label">Loại BĐS</label>
                    <select
                      className="form-select form-select-sm"
                      value={mobileDraftForm.propertyType}
                      onChange={(e) => setMobileDraftForm({ ...mobileDraftForm, propertyType: e.target.value })}
                    >
                      <option>Căn hộ chung cư</option>
                      <option>Nhà phố</option>
                      <option>Đất nền</option>
                      <option>Biệt thự</option>
                      <option>Shophouse</option>
                      <option>Văn phòng</option>
                    </select>
                  </div>
                  <div className="col-6">
                    <label className="form-label">
                      Diện tích (m²) <span className="text-danger">*</span>
                    </label>
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      min={1}
                      value={mobileDraftForm.area}
                      onChange={(e) => setMobileDraftForm({ ...mobileDraftForm, area: e.target.value })}
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label">
                      Giá <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="VD: 6.7" value={mobileDraftForm.price}
                      onChange={(e) => setMobileDraftForm({ ...mobileDraftForm, price: e.target.value })}
                    />
                  </div>
                  <div className="col-12">
                    <label className="form-label">Đơn vị giá</label>
                    <select
                      className="form-select form-select-sm"
                      value={mobileDraftForm.priceUnit}
                      onChange={(e) => setMobileDraftForm({ ...mobileDraftForm, priceUnit: e.target.value })}
                    >
                      <option value="tỷ VNĐ">tỷ VNĐ</option>
                      <option value="triệu VNĐ">triệu VNĐ</option>
                      <option value="VNĐ">VNĐ</option>
                      <option value="VNĐ/tháng">VNĐ/tháng</option>
                      <option value="triệu VNĐ/tháng">triệu VNĐ/tháng</option>
                    </select>
                  </div>
                  <div className="col-6">
                    <label className="form-label">Phòng ngủ</label>
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      min={0}
                      value={mobileDraftForm.bedrooms}
                      onChange={(e) => setMobileDraftForm({ ...mobileDraftForm, bedrooms: e.target.value })}
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label">Phòng tắm</label>
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      min={0}
                      value={mobileDraftForm.bathrooms}
                      onChange={(e) => setMobileDraftForm({ ...mobileDraftForm, bathrooms: e.target.value })}
                    />
                  </div>
                  <div className="col-12">
                    <label className="form-label">Tầng</label>
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      value={mobileDraftForm.floor}
                      onChange={(e) => setMobileDraftForm({ ...mobileDraftForm, floor: e.target.value })}
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label">Hướng</label>
                    <select
                      className="form-select form-select-sm"
                      value={mobileDraftForm.direction}
                      onChange={(e) => setMobileDraftForm({ ...mobileDraftForm, direction: e.target.value })}
                    >
                      <option value="">— Chọn —</option>
                      <option>Đông</option>
                      <option>Tây</option>
                      <option>Nam</option>
                      <option>Bắc</option>
                      <option>Đông Nam</option>
                      <option>Đông Bắc</option>
                      <option>Tây Nam</option>
                      <option>Tây Bắc</option>
                    </select>
                  </div>
                  <div className="col-6">
                    <label className="form-label">Tình trạng</label>
                    <select
                      className="form-select form-select-sm"
                      value={mobileDraftForm.condition}
                      onChange={(e) => setMobileDraftForm({ ...mobileDraftForm, condition: e.target.value })}
                    >
                      <option value="">— Chọn —</option>
                      <option>Nhà mới</option>
                      <option>Đang sử dụng</option>
                      <option>Cần cải tạo</option>
                    </select>
                  </div>
                  <div className="col-6">
                    <label className="form-label">Nội thất</label>
                    <select
                      className="form-select form-select-sm"
                      value={mobileDraftForm.furniture}
                      onChange={(e) => setMobileDraftForm({ ...mobileDraftForm, furniture: e.target.value })}
                    >
                      <option value="">— Chọn —</option>
                      <option>Đầy đủ</option>
                      <option>Cơ bản</option>
                      <option>Nhà trống</option>
                    </select>
                  </div>
                  <div className="col-6">
                    <label className="form-label">Nguồn hàng</label>
                    <select
                      className="form-select form-select-sm"
                      value={mobileDraftForm.source}
                      onChange={(e) => setMobileDraftForm({ ...mobileDraftForm, source: e.target.value })}
                    >
                      <option value="">— Chọn —</option>
                      <option>Chuyển nhượng</option>
                      <option>Dự án</option>
                      <option>Cá nhân</option>
                    </select>
                  </div>
                  <div className="col-12">
                    <label className="form-label">Pháp lý</label>
                    <select
                      className="form-select form-select-sm"
                      value={mobileDraftForm.legalStatus}
                      onChange={(e) => setMobileDraftForm({ ...mobileDraftForm, legalStatus: e.target.value })}
                    >
                      <option>Sổ đỏ</option>
                      <option>Sổ hồng riêng</option>
                      <option>Hợp đồng mua bán</option>
                      <option>Đang chờ sổ</option>
                    </select>
                  </div>
                </div>
                <label className="form-label fw-semibold">Mô tả thêm</label>
                <textarea
                  className="form-control form-control-sm mb-2"
                  rows={3}
                  maxLength={500}
                  value={mobileDraftForm.description}
                  onChange={(e) => setMobileDraftForm({ ...mobileDraftForm, description: e.target.value })}
                  placeholder="Mô tả thêm về tài sản (vị trí, ưu điểm…)"
                />
                <div className="form-text text-end small text-muted mb-2">
                  {(mobileDraftForm.description || '').length}/500 ký tự
                </div>
                <label className="form-label fw-semibold">
                  Ảnh minh họa tài sản <span className="text-danger">*</span>
                </label>
                <p className="small text-danger mb-1">
                  Bắt buộc ít nhất <strong>1 ảnh</strong> (JPG/PNG/WebP, tối đa 10MB/file) trước khi Gửi duyệt.
                  {countMobileDraftImages(mobileDraftForm, mobileDraftExtraFiles) > 0 && (
                    <span className="text-success ms-1">
                      Đã có {countMobileDraftImages(mobileDraftForm, mobileDraftExtraFiles)} ảnh.
                    </span>
                  )}
                </p>
                {(mobileDraftForm.images || []).length > 0 && (
                  <div className="d-flex flex-wrap gap-1 mb-2">
                    {(mobileDraftForm.images || []).map((url, i) => (
                      <div key={`mob-d-img-${i}`} className="position-relative">
                        <img src={url} alt="" className="rounded border" style={{ width: 64, height: 48, objectFit: 'cover' }} />
                        <button
                          type="button"
                          className="btn btn-sm btn-danger position-absolute top-0 end-0 p-0 lh-1"
                          style={{ fontSize: 9, transform: 'translate(20%,-20%)' }}
                          onClick={() =>
                            setMobileDraftForm({
                              ...mobileDraftForm,
                              images: (mobileDraftForm.images || []).filter((_, j) => j !== i),
                            })
                          }
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {mobileDraftExtraFiles.length > 0 && (
                  <ul className="list-unstyled small text-muted mb-2">
                    {mobileDraftExtraFiles.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="d-flex justify-content-between">
                        <span className="text-truncate">{f.name}</span>
                        <button
                          type="button"
                          className="btn btn-link btn-sm p-0 text-danger"
                          onClick={() => setMobileDraftExtraFiles((prev) => prev.filter((_, j) => j !== i))}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="border border-dashed rounded p-2 text-center bg-light position-relative mb-3">
                  <input
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.webp,image/*"
                    className="position-absolute w-100 h-100 opacity-0 top-0 start-0"
                    style={{ cursor: 'pointer' }}
                    onChange={handleMobileDraftFileChange}
                  />
                  <i className="bi bi-cloud-arrow-up text-primary" />
                  <div className="small fw-semibold">Thêm ảnh — click hoặc kéo thả</div>
                  <small className="text-muted">JPG, PNG, WebP · tối đa 10MB/file</small>
                </div>
                <div className="fw-semibold mb-1">Nhánh gửi duyệt (bắt buộc)</div>
                <div className="d-grid gap-1 mb-1">
                  <button
                    type="button"
                    className={`btn btn-sm ${mobileDraftBranch === 1 ? 'btn-primary' : 'btn-outline-primary'}`}
                    onClick={() => setMobileDraftBranch(1)}
                  >
                    1 — Gửi KH ký online (eSign) → Chờ KH ký
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${mobileDraftBranch === 2 ? 'btn-warning' : 'btn-outline-warning'} text-dark`}
                    onClick={() => setMobileDraftBranch(2)}
                  >
                    2 — Gửi duyệt Kho đảm bảo
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${mobileDraftBranch === 3 ? 'btn-success' : 'btn-outline-success'}`}
                    onClick={() => setMobileDraftBranch(3)}
                  >
                    3 — Đã ký / Gửi duyệt POS
                  </button>
                </div>
              </div>
              <div className="modal-footer py-2 flex-wrap gap-1">
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={closeMobileDraftModal} disabled={mobileDraftSubmitting}>
                  Hủy
                </button>
                <button
                  type="button"
                  className="btn btn-outline-warning btn-sm"
                  disabled={mobileDraftSubmitting}
                  onClick={handleMobileDraftSaveOnly}
                >
                  {mobileDraftSubmitting ? <span className="spinner-border spinner-border-sm" /> : <i className="bi bi-floppy me-1"></i>}
                  Lưu nháp
                </button>
                <button
                  type="button"
                  className="btn btn-success btn-sm fw-bold"
                  disabled={mobileDraftSubmitting}
                  onClick={handleMobileDraftSubmitForApproval}
                >
                  {mobileDraftSubmitting ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-send-check me-1"></i>}
                  Gửi duyệt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {reopenRejected && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000 }}>
          <div className="modal-dialog modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h6 className="modal-title fw-bold">Chỉnh sửa sau từ chối — {reopenRejected.id}</h6>
                <button type="button" className="btn-close" onClick={() => setReopenRejected(null)} aria-label="Đóng" />
              </div>
              <div className="modal-body small">
                <label className="form-label">Mô tả tài sản</label>
                <textarea className="form-control form-control-sm mb-3" rows={4} value={rejectedDesc} onChange={(e) => setRejectedDesc(e.target.value)} />
                <label className="form-label">Thêm ảnh (nếu cần bổ sung)</label>
                <input type="file" className="form-control form-control-sm mb-2" accept="image/*" multiple onChange={handleRejectedExtraUpload} />
                {rejectedExtraFiles.length > 0 && (
                  <ul className="list-unstyled small text-muted mb-2">
                    {rejectedExtraFiles.map((f, i) => (
                      <li key={i}>
                        {f.name}{' '}
                        <button type="button" className="btn btn-link btn-sm p-0 text-danger" onClick={() => setRejectedExtraFiles((a) => a.filter((_, j) => j !== i))}>
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="text-muted small mb-2">
                  Ảnh hiện có: {(reopenRejected.images || []).length} — sau khi gửi vẫn cần tổng cộng ít nhất 1 ảnh.
                </div>
                <label className="form-label">
                  Ghi chú gửi lại <span className="text-danger">*</span> (≥ {RESUBMIT_NOTE_MIN} ký tự)
                </label>
                <textarea className="form-control form-control-sm" rows={3} value={rejectedNote} onChange={(e) => setRejectedNote(e.target.value)} placeholder="Mô tả phần đã chỉnh theo phản hồi GĐ POS…" />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setReopenRejected(null)}>
                  Hủy
                </button>
                <button type="button" className="btn btn-primary btn-sm fw-bold" onClick={handleRejectedResubmit}>
                  Gửi lại duyệt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SalesMobile;
