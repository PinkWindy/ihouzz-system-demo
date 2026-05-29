import { API_BASE_URL } from '../config.js';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import SmartAddress from '../components/SmartAddress';
import { DEFAULT_PROVINCE } from '../data/hcmAdminUnits';
import { readFileAsDataURL, MAX_IMAGE_BYTES } from '../utils/mediaLibraryApi';
import { propertySequenceNumber, formatPropertyId, postEntityAudit, AUDIT_ACTION_TYPE } from '../utils/listingWorkflow';
import {
  MY_PROPS_STATUS_ALL,
  MY_PROPS_STATUS_OPTIONS,
  filterMyPropsForTab,
  formatMyPropsPriceDisplay,
  normalizeJsonServerList,
  warehouseLabel,
} from '../utils/myPropsTab';
import {
  UPDATE_REQUEST_PENDING,
  diffPropertyUpdate,
  pickPendingPayloadFromForm,
  canRequestPropertyUpdate,
  shrinkPendingForJsonServer,
  propertyHasLiveListingForUpdateLock,
  initialPendingUpdateFormState,
  buildPriceDisplayFromFields,
} from '../utils/propertyUpdateWorkflow';
import { formatPropertyPriceDisplay } from '../utils/permissions';
import { normalizeUserId, sameUserId } from '../utils/userId';
import {
  buildFullAddress,
  validatePropertySubmit,
  findDuplicateProperties,
  propertyToAddressFields,
} from '../utils/propertyCreateWorkflow';
import AppToast from '../components/AppToast';
import { useAppToast } from '../hooks/useAppToast';
import {
  matchesNotificationRecipient,
  isSalesInboxNotification,
  isRejectNotification,
} from '../utils/approvalNotifications';

function Feature2_Create() {
  const navigate = useNavigate();

  // Lấy thông tin user hiện tại
  const userStr = localStorage.getItem('user');
  const currentUser = userStr ? JSON.parse(userStr) : {};
  const rawRole = currentUser.role || 'sales';
  const ROLE = rawRole === 'pos' ? 'pos_manager' : rawRole === 'mkt' ? 'marketing' : rawRole;
  const rawPid = currentUser.pos_id;
  const POS_ID_NUM = rawPid === '' || rawPid == null ? null : Number(rawPid);
  const POS_ID = Number.isNaN(POS_ID_NUM) ? null : POS_ID_NUM;
  const POS_NAME = currentUser.pos_name || '';

  // managerName mặc định = người tạo, Admin có thể đổi
  const [managerName, setManagerName] = (useState)(currentUser.name || '');
  const [address, setAddress] = useState({
    province: DEFAULT_PROVINCE,
    district: '',
    ward: '',
    futureWard: '',
    houseNumber: '',
    street: '',
  });

  const [formData, setFormData] = useState({
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

  const [files, setFiles] = useState([]);

  const handleFileUpload = (e) => {
    const selectedFiles = Array.from(e.target.files);
    for (let file of selectedFiles) {
      if (file.size > 10 * 1024 * 1024) { // 10MB
        alert(`❌ Lỗi: File "${file.name}" vượt quá dung lượng cho phép (10MB).`);
        e.target.value = ''; // reset input
        return;
      }
    }
    setFiles([...files, ...selectedFiles]);
    // Hướng dẫn lưu trữ cho bé:
    // Trong thực tế, hệ thống Frontend sẽ gửi các file này lên Storage Server qua API
    // như AWS S3, Google Cloud Storage, hoặc lưu thẳng vào thư mục `public/uploads` của Backend.
  };

  const handleAreaChange = (e) => {
    let rawValue = e.target.value.replace(/,/g, '');
    if (/[^\d]/.test(rawValue) && rawValue !== '') alert("❌ Lỗi: Diện tích chỉ được phép chứa số nguyên.");
    rawValue = rawValue.replace(/\D/g, '');
    if (rawValue === '') { setFormData({ ...formData, area: '' }); return; }
    const numValue = parseInt(rawValue, 10);
    if (numValue <= 0) { alert("❌ Lỗi: Diện tích phải lớn hơn 0."); setFormData({ ...formData, area: '' }); return; }
    if (numValue > 1000000) { alert("❌ Lỗi: Diện tích không hợp lệ (vượt quá giới hạn 1,000,000 m²)."); setFormData({ ...formData, area: '' }); return; }
    setFormData({ ...formData, area: numValue.toLocaleString('en-US') });
  };

  const handlePriceChange = (e) => {
    let rawValue = e.target.value.replace(/,/g, ''); // Xóa dấu phẩy cũ
    
    // Nếu nhập chữ hoặc ký tự lạ
    if (/[^\d]/.test(rawValue) && rawValue !== '') {
      alert("❌ Lỗi: Giá trị chỉ được phép chứa số nguyên.");
    }
    
    rawValue = rawValue.replace(/\D/g, ''); // Loại bỏ toàn bộ ký tự không phải số
    
    if (rawValue === '') {
      setFormData({ ...formData, price: '' });
      return;
    }
    
    const numValue = parseInt(rawValue, 10);
    if (numValue <= 0) {
      alert("❌ Lỗi: Giá trị số tiền phải lớn hơn 0.");
      setFormData({ ...formData, price: '' });
      return;
    }

    // Kiểm tra giá thấp (TC_F2_12)
    if (formData.type === 'Bán' && formData.priceUnit === 'VNĐ' && numValue < 100000000) {
      console.warn("Giá bán quá thấp!");
    }

    // Format lại theo phân cách hàng nghìn (VD: 1,000,000)
    const formattedPrice = numValue.toLocaleString('en-US');
    setFormData({ ...formData, price: formattedPrice });
  };

  const [dupStatus, setDupStatus] = useState(null); // null | 'checking' | {dup} | 'clear'
  const [dupAcknowledged, setDupAcknowledged] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [pendingSubmitPropertyId, setPendingSubmitPropertyId] = useState(null);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [dupInfo, setDupInfo] = useState(null);
  /** Nhánh 1 (eSign): theo dõi LS- vừa gửi link ký KH — AC2-004 / Screen 2.4.4 */
  const [esignFlowPropId, setEsignFlowPropId] = useState(null);
  const [showEsignFlowModal, setShowEsignFlowModal] = useState(false);

  const [mainTab, setMainTab] = useState('create');
  const [properties, setProperties] = useState([]);
  const [listings, setListings] = useState([]);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateTarget, setUpdateTarget] = useState(null);
  const [updateForm, setUpdateForm] = useState(null);
  const [updateNote, setUpdateNote] = useState('');
  const [updateExtraFiles, setUpdateExtraFiles] = useState([]);

  // Draft completion states
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [draftTarget, setDraftTarget] = useState(null);
  const [draftEditForm, setDraftEditForm] = useState(null);
  const [draftSubmitting, setDraftSubmitting] = useState(false);
  const [draftExtraFiles, setDraftExtraFiles] = useState([]);

  const USER_ID = normalizeUserId(currentUser.id) ?? '';

  const [myPropsSearch, setMyPropsSearch] = useState('');
  const [myPropsStatusFilter, setMyPropsStatusFilter] = useState(MY_PROPS_STATUS_ALL);
  const [myPropsTypeFilter, setMyPropsTypeFilter] = useState('all');
  const [includeRemovedMyProps, setIncludeRemovedMyProps] = useState(false);
  const { toast, showToast, dismissToast } = useAppToast(12000);
  const shownNotifIdsRef = useRef(new Set());

  useEffect(() => {
    if (mainTab !== 'myprops') return;
    (async () => {
      try {
        const [resP, resL] = await Promise.all([
          axios.get(`\${API_BASE_URL}/properties`),
          axios.get(`\${API_BASE_URL}/listings`),
        ]);
        setProperties(normalizeJsonServerList(resP.data));
        setListings(normalizeJsonServerList(resL.data));
      } catch (e) {
        console.error(e);
      }
    })();
  }, [mainTab]);

  const myPropsListRaw = useMemo(
    () => (USER_ID ? properties.filter((p) => sameUserId(p.createdBy_id, USER_ID)) : properties),
    [properties, USER_ID],
  );

  const esignFlowProperty = useMemo(() => {
    if (!esignFlowPropId) return null;
    return properties.find((p) => p.id === esignFlowPropId || p.propertyCode === esignFlowPropId) || null;
  }, [properties, esignFlowPropId]);

  const reloadPropertiesAndListings = async () => {
    const [resP, resL] = await Promise.all([
      axios.get(`\${API_BASE_URL}/properties`),
      axios.get(`\${API_BASE_URL}/listings`),
    ]);
    setProperties(normalizeJsonServerList(resP.data));
    setListings(normalizeJsonServerList(resL.data));
  };

  const propertyDisplayCode = (p) => formatPropertyId(p?.propertyCode || p?.id || '');

  const handleConfirmKhSigned = async (prop) => {
    const pid = prop?.id || prop;
    const row = typeof prop === 'object' ? prop : properties.find((p) => p.id === pid);
    if (!row) return;
    if (!window.confirm(`Xác nhận Khách hàng đã ký HĐMG cho ${propertyDisplayCode(row)}?`)) return;
    const now = new Date().toISOString();
    try {
      await axios.patch(`\${API_BASE_URL}/properties/${encodeURIComponent(row.id)}`, {
        level1_status: 'KH đã ký',
        statusLv1: 'KH đã ký',
        kh_signed_at: now,
        updatedAt: now,
      });
      await postEntityAudit({
        action: `[F2] Nhánh 1 — Xác nhận KH đã ký ${propertyDisplayCode(row)}`,
        actionType: AUDIT_ACTION_TYPE.PROPERTY_F2_ESIGN_CONFIRMED,
        entityId: row.id,
        property_id: row.propertyCode || row.id,
        user: currentUser.name || 'Sales (F2)',
        user_id: USER_ID,
        old_status: row.level1_status || row.statusLv1,
        new_status: 'KH đã ký',
      });
      await reloadPropertiesAndListings();
      setEsignFlowPropId(row.id);
      alert(`✅ ${propertyDisplayCode(row)}: trạng thái «KH đã ký». Bạn có thể bấm «Gửi duyệt POS».`);
    } catch {
      alert('Lỗi cập nhật trạng thái. Kiểm tra API port 5000.');
    }
  };

  const handleSendEsignToPos = async (prop) => {
    const row = typeof prop === 'object' ? prop : properties.find((p) => p.id === prop);
    if (!row) return;
    if (row.level1_status !== 'KH đã ký') {
      alert('Chỉ gửi POS sau khi trạng thái là «KH đã ký».');
      return;
    }
    const now = new Date().toISOString();
    try {
      await axios.patch(`\${API_BASE_URL}/properties/${encodeURIComponent(row.id)}`, {
        level1_status: 'Chờ POS duyệt',
        statusLv1: 'Chờ POS duyệt',
        submitted_to_pos_at: now,
        updatedAt: now,
      });
      await postEntityAudit({
        action: `[F2] Nhánh 1 — Gửi duyệt POS ${propertyDisplayCode(row)}`,
        actionType: AUDIT_ACTION_TYPE.PROPERTY_F2_SEND_POS_ESIGN,
        entityId: row.id,
        property_id: row.propertyCode || row.id,
        user: currentUser.name || 'Sales (F2)',
        user_id: USER_ID,
        old_status: 'KH đã ký',
        new_status: 'Chờ POS duyệt',
      });
      await axios.post(`\${API_BASE_URL}/notifications`, {
        propertyId: row.propertyCode || row.id,
        recipient: row.pos_manager || 'GĐ POS',
        message: `Tài sản ${propertyDisplayCode(row)} (KH đã ký HĐMG) chờ phê duyệt nhập kho.`,
        type: 'info',
        createdAt: now,
        isRead: false,
      });
      await reloadPropertiesAndListings();
      setShowEsignFlowModal(false);
      setEsignFlowPropId(null);
      alert(`✅ Đã gửi ${propertyDisplayCode(row)} tới Giám đốc POS (Chờ POS duyệt).`);
    } catch {
      alert('Lỗi khi gửi duyệt POS.');
    }
  };

  const myPropsListFiltered = useMemo(() => {
    const list = filterMyPropsForTab(myPropsListRaw, {
      statusKey: myPropsStatusFilter,
      hideRemovedSource: !includeRemovedMyProps,
      search: myPropsSearch,
    });
    if (myPropsTypeFilter === 'all') return list;
    return list.filter((p) => p.type === myPropsTypeFilter);
  }, [myPropsListRaw, myPropsStatusFilter, includeRemovedMyProps, myPropsSearch, myPropsTypeFilter]);

  const openUpdateRequestModal = (p) => {
    setUpdateTarget(p);
    setUpdateForm(initialPendingUpdateFormState(p));
    setUpdateNote('');
    setUpdateExtraFiles([]);
    setShowUpdateModal(true);
  };

  const handleUpdateExtraUpload = (e) => {
    const sel = Array.from(e.target.files || []);
    e.target.value = '';
    for (const file of sel) {
      if (file.size > 10 * 1024 * 1024) {
        alert(`File "${file.name}" vượt quá 10MB.`);
        return;
      }
    }
    setUpdateExtraFiles((prev) => [...prev, ...sel]);
  };

  const handleSubmitUpdateRequest = async () => {
    if (!updateTarget || !updateForm) return;
    if (!canRequestPropertyUpdate(updateTarget, USER_ID, listings)) {
      if (propertyHasLiveListingForUpdateLock(updateTarget, listings)) {
        alert('Không thể gửi cập nhật kho: tài sản đang có bài đăng niêm yết (Lv2 Đang niêm yết hoặc tin Đã duyệt). Vui lòng gỡ / tạm dừng tin trước.');
      } else {
        alert('Không thể gửi yêu cầu cập nhật cho tài sản này.');
      }
      return;
    }
    const imgNew = updateExtraFiles.filter((f) => f.type.startsWith('image/'));
    const newUrls = [];
    for (const f of imgNew.slice(0, 12)) {
      try {
        newUrls.push(await readFileAsDataURL(f, MAX_IMAGE_BYTES));
      } catch (err) {
        alert(err?.message || f.name);
        return;
      }
    }
    const mergedImages = [...(updateForm.images || []).filter(Boolean), ...newUrls];
    if (mergedImages.length < 1) {
      alert('Cần ít nhất 1 ảnh minh họa trong bản cập nhật (giữ ảnh cũ hoặc tải thêm).');
      return;
    }
    const pendingRaw = pickPendingPayloadFromForm({
      ...updateForm,
      area: Number(String(updateForm.area).replace(/,/g, '')),
      price: Number(String(updateForm.price).replace(/,/g, '')),
      bedrooms: Number(updateForm.bedrooms) || 0,
      bathrooms: Number(updateForm.bathrooms) || 0,
      floor: updateForm.floor === '' || updateForm.floor == null ? null : parseInt(String(updateForm.floor), 10),
      images: mergedImages,
    });
    if (diffPropertyUpdate(updateTarget, pendingRaw).length < 1) {
      alert('Không có thay đổi nào so với dữ liệu hiện tại. Vui lòng chỉnh ít nhất một trường.');
      return;
    }
    const meta = {
      update_request_status: UPDATE_REQUEST_PENDING,
      update_requested_at: new Date().toISOString(),
      update_requested_by: currentUser.name || 'Đầu chủ',
      update_requested_by_id: USER_ID || null,
      update_request_note: updateNote.trim() || null,
    };
    const { pending: pendingToSend, didSubstituteImages } = shrinkPendingForJsonServer(
      meta,
      pendingRaw,
      updateTarget.id,
    );
    const changes = diffPropertyUpdate(updateTarget, pendingToSend);
    try {
      await axios.patch(`\${API_BASE_URL}/properties/${encodeURIComponent(updateTarget.id)}`, {
        ...meta,
        pending_update_payload: pendingToSend,
      });
      await postEntityAudit({
        action: '[F2] Đầu chủ gửi yêu cầu phê duyệt cập nhật tài sản (chờ GĐ POS)',
        actionType: AUDIT_ACTION_TYPE.PROPERTY_F2_UPDATE_REQUEST,
        entityId: updateTarget.id,
        property_id: updateTarget.propertyCode || updateTarget.id,
        user: currentUser.name || 'Đầu chủ (F2)',
        user_id: USER_ID,
        modified_fields:
          changes.length > 0
            ? Object.fromEntries(changes.map((c) => [String(c.field), { old: c.old, new: c.new }]))
            : undefined,
        extra: { changesPreview: changes.map((c) => c.field) },
      });
      setShowUpdateModal(false);
      setUpdateTarget(null);
      setUpdateForm(null);
      setUpdateExtraFiles([]);
      const res = await axios.get(`\${API_BASE_URL}/properties`);
      setProperties(normalizeJsonServerList(res.data));
      alert(
        didSubstituteImages
          ? '✅ Đã gửi yêu cầu cập nhật. (Demo: json-server giới hạn ~100KB/request — ảnh tải lên được thay bằng URL minh họa.)'
          : '✅ Đã gửi yêu cầu cập nhật tới Giám đốc POS.',
      );
    } catch (err) {
      console.error(err);
      const detail = err?.response?.data?.error || err?.response?.data?.message || err?.message || '';
      alert(
        detail
          ? `Lỗi khi gửi yêu cầu: ${detail}`
          : 'Lỗi khi gửi yêu cầu (kiểm tra API `npm run api` đang chạy port 5000).',
      );
    }
  };

  const openDraftModal = (p) => {
    setDraftTarget(p);
    setDupAcknowledged(false);
    setDraftExtraFiles([]);
    setDraftEditForm({
      type: p.type || 'Bán',
      propertyType: p.propertyType || 'Căn hộ chung cư',
      area: p.area || '',
      price: p.price ? Number(p.price).toLocaleString('en-US') : '',
      priceUnit: p.priceUnit || 'tỷ VNĐ',
      direction: p.direction || '',
      condition: p.condition || '',
      source: p.source || '',
      furniture: p.furniture || '',
      floor: p.floor || '',
      bedrooms: p.bedrooms || '',
      bathrooms: p.bathrooms || '',
      description: p.description || '',
      legalStatus: p.legalStatus || p.legal || 'Sổ đỏ',
      addressFields: propertyToAddressFields(p),
      images: Array.isArray(p.images) ? p.images.filter(Boolean) : [],
    });
    setShowDraftModal(true);
  };

  const countDraftImages = (form, extraFiles) => {
    const existing = (form?.images || []).filter(Boolean).length;
    const pending = (extraFiles || []).filter((f) => f.type.startsWith('image/')).length;
    return existing + pending;
  };

  const handleDraftExtraUpload = (e) => {
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
    setDraftExtraFiles((prev) => [...prev, ...sel]);
  };

  const resolveDraftImages = async (propertyId, form, extraFiles) => {
    const kept = (form?.images || []).filter(Boolean);
    const imgNew = (extraFiles || []).filter((f) => f.type.startsWith('image/'));
    const newUrls = [];
    for (let i = 0; i < imgNew.length; i++) {
      try {
        newUrls.push(await readFileAsDataURL(imgNew[i], MAX_IMAGE_BYTES));
      } catch {
        newUrls.push(
          `https://picsum.photos/seed/draft-${encodeURIComponent(propertyId)}-${Date.now()}-${i}/1200/800`,
        );
      }
    }
    return [...kept, ...newUrls].slice(0, 20);
  };

  const openDraftModalRef = useRef(null);
  openDraftModalRef.current = openDraftModal;

  useEffect(() => {
    if (ROLE !== 'sales') return undefined;
    let cancelled = false;

    const openFromNotif = async (propId, openForEdit) => {
      setMainTab('myprops');
      try {
        const res = await axios.get(`\${API_BASE_URL}/properties`);
        if (cancelled) return;
        const list = normalizeJsonServerList(res.data);
        setProperties(list);
        const prop = list.find((p) => p.id === propId || p.propertyCode === propId);
        if (prop && openForEdit) {
          openDraftModalRef.current?.(prop);
        }
      } catch (e) {
        console.error(e);
      }
    };

    (async () => {
      try {
        const res = await axios.get(`\${API_BASE_URL}/notifications`);
        if (cancelled) return;
        const list = normalizeJsonServerList(res.data);
        const unread = list
          .filter(
            (n) =>
              !n.isRead &&
              matchesNotificationRecipient(n, currentUser.name, currentUser.email) &&
              isSalesInboxNotification(n) &&
              n.id &&
              !shownNotifIdsRef.current.has(n.id),
          )
          .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        for (const n of unread) {
          if (cancelled) return;
          shownNotifIdsRef.current.add(n.id);
          const isReject = isRejectNotification(n);
          showToast({
            msg: n.message,
            type: n.type === 'danger' ? 'danger' : 'success',
            actionLabel: 'Mở hồ sơ',
            onAction: () => openFromNotif(n.propertyId, isReject),
            durationMs: 14000,
          });
          try {
            await axios.patch(`\${API_BASE_URL}/notifications/${encodeURIComponent(n.id)}`, {
              isRead: true,
            });
          } catch (patchErr) {
            console.warn('Không đánh dấu đã đọc notification:', patchErr);
          }
        }
      } catch (e) {
        console.error('pollApprovalNotifications', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ROLE, currentUser.name, currentUser.email, mainTab, showToast]);

  const fullAddress = useMemo(() => buildFullAddress(address), [address]);

  const fetchDuplicateMatches = async (addr, listingType, excludeId) => {
    const res = await axios.get(`\${API_BASE_URL}/properties`);
    return findDuplicateProperties(res.data, {
      type: listingType,
      address: addr,
      excludeId,
    });
  };

  const requireDuplicateGate = async (addr, listingType, excludeId) => {
    if (listingType !== 'Bán') return true;
    setDupStatus('checking');
    try {
      const dups = await fetchDuplicateMatches(addr, listingType, excludeId);
      if (dups.length > 0 && !dupAcknowledged) {
        setDupInfo(dups[0]);
        setDupStatus('dup');
        setShowDuplicateModal(true);
        return false;
      }
      setDupStatus(dups.length > 0 ? 'dup' : 'clear');
      return true;
    } catch {
      setDupStatus(null);
      alert('Không kiểm tra được trùng địa chỉ. Vui lòng thử lại.');
      return false;
    }
  };

  const handleBlurDupCheck = async () => {
    if (formData.type !== 'Bán') return;
    setDupAcknowledged(false);
    await requireDuplicateGate(address, formData.type, pendingSubmitPropertyId);
  };

  const handleCompleteDraft = async (submitToPOS = false) => {
    if (!draftTarget || !draftEditForm) return;
    const draftAddr = draftEditForm.addressFields || propertyToAddressFields(draftTarget);
    const draftImageCount = countDraftImages(draftEditForm, draftExtraFiles);

    if (submitToPOS) {
      const v = validatePropertySubmit({
        address: draftAddr,
        formData: draftEditForm,
        imageCount: draftImageCount,
        requireImages: true,
      });
      if (!v.ok) {
        alert(v.message);
        return;
      }
      const dupOk = await requireDuplicateGate(draftAddr, draftEditForm.type, draftTarget.id);
      if (!dupOk) return;

      setDraftSubmitting(true);
      try {
        const mergedImages = await resolveDraftImages(draftTarget.id, draftEditForm, draftExtraFiles);
        const now = new Date().toISOString();
        await axios.patch(`\${API_BASE_URL}/properties/${encodeURIComponent(draftTarget.id)}`, {
          type: draftEditForm.type,
          propertyType: draftEditForm.propertyType,
          area: Number(String(draftEditForm.area).replace(/,/g, '')) || 0,
          price: Number(String(draftEditForm.price).replace(/,/g, '')) || 0,
          priceUnit: draftEditForm.priceUnit,
          direction: draftEditForm.direction,
          condition: draftEditForm.condition,
          source: draftEditForm.source,
          furniture: draftEditForm.furniture,
          floor: draftEditForm.floor ? parseInt(draftEditForm.floor, 10) : null,
          bedrooms: Number(draftEditForm.bedrooms) || 0,
          bathrooms: Number(draftEditForm.bathrooms) || 0,
          description: draftEditForm.description,
          legalStatus: draftEditForm.legalStatus,
          address: buildFullAddress(draftAddr) || draftTarget.address,
          district: draftAddr.district || '',
          ward: draftAddr.ward || '',
          houseNumber: draftAddr.houseNumber || '',
          street: draftAddr.street || '',
          province: draftAddr.province || DEFAULT_PROVINCE,
          futureWard: draftAddr.futureWard || null,
          images: mergedImages,
          updatedAt: now,
        });
        await reloadPropertiesAndListings();
      } catch {
        alert('Lỗi lưu ảnh / hồ sơ trước khi gửi duyệt. Kiểm tra API port 5000.');
        setDraftSubmitting(false);
        return;
      }
      setDraftSubmitting(false);

      setPendingSubmitPropertyId(draftTarget.id);
      setAddress(draftAddr);
      setFiles([]);
      setFormData((prev) => ({
        ...prev,
        type: draftEditForm.type,
        propertyType: draftEditForm.propertyType,
        area: draftEditForm.area,
        price: draftEditForm.price,
        priceUnit: draftEditForm.priceUnit,
        direction: draftEditForm.direction,
        condition: draftEditForm.condition,
        source: draftEditForm.source,
        furniture: draftEditForm.furniture,
        floor: draftEditForm.floor,
        bedrooms: draftEditForm.bedrooms,
        bathrooms: draftEditForm.bathrooms,
        description: draftEditForm.description,
        legalStatus: draftEditForm.legalStatus,
      }));
      setShowDraftModal(false);
      setDraftTarget(null);
      setDraftEditForm(null);
      setDraftExtraFiles([]);
      setShowBranchModal(true);
      return;
    }

    if (!draftEditForm.area && !draftEditForm.price && !buildFullAddress(draftAddr)) {
      alert('Vui lòng nhập ít nhất một số thông tin (địa chỉ, diện tích hoặc giá) trước khi lưu nháp.');
      return;
    }

    setDraftSubmitting(true);
    const now = new Date().toISOString();
    let mergedImages = (draftEditForm.images || []).filter(Boolean);
    if (draftExtraFiles.length > 0) {
      try {
        mergedImages = await resolveDraftImages(draftTarget.id, draftEditForm, draftExtraFiles);
      } catch (err) {
        alert(err?.message || 'Không xử lý được file ảnh.');
        setDraftSubmitting(false);
        return;
      }
    }
    const payload = {
      type: draftEditForm.type,
      propertyType: draftEditForm.propertyType,
      area: Number(String(draftEditForm.area).replace(/,/g, '')) || 0,
      price: Number(String(draftEditForm.price).replace(/,/g, '')) || 0,
      priceUnit: draftEditForm.priceUnit,
      direction: draftEditForm.direction,
      condition: draftEditForm.condition,
      source: draftEditForm.source,
      furniture: draftEditForm.furniture,
      floor: draftEditForm.floor ? parseInt(draftEditForm.floor, 10) : null,
      bedrooms: Number(draftEditForm.bedrooms) || 0,
      bathrooms: Number(draftEditForm.bathrooms) || 0,
      description: draftEditForm.description,
      legalStatus: draftEditForm.legalStatus,
      address: buildFullAddress(draftAddr) || draftTarget.address,
      district: draftAddr.district || '',
      ward: draftAddr.ward || '',
      houseNumber: draftAddr.houseNumber || '',
      street: draftAddr.street || '',
      province: draftAddr.province || DEFAULT_PROVINCE,
      futureWard: draftAddr.futureWard || null,
      images: mergedImages,
      level1_status: 'Mới',
      is_draft: true,
      updatedAt: now,
    };
    try {
      await axios.patch(`\${API_BASE_URL}/properties/${encodeURIComponent(draftTarget.id)}`, payload);
      await postEntityAudit({
        action: `[F2] Đầu chủ cập nhật nháp ${draftTarget.id}`,
        actionType: AUDIT_ACTION_TYPE.PROPERTY_F2_DRAFT_UPDATE,
        entityId: draftTarget.id,
        property_id: draftTarget.propertyCode || draftTarget.id,
        user: currentUser.name || 'Sales (F2)',
        user_id: USER_ID,
      });
      const res = await axios.get(`\${API_BASE_URL}/properties`);
      setProperties(normalizeJsonServerList(res.data));
      setShowDraftModal(false);
      setDraftTarget(null);
      setDraftEditForm(null);
      setDraftExtraFiles([]);
      alert(`✅ Đã cập nhật nháp ${draftTarget.id}.`);
    } catch {
      alert('Đã xảy ra lỗi. Kiểm tra API đang chạy.');
    }
    setDraftSubmitting(false);
  };

  const handleSaveDraft = async () => {
    if (!address.district && !address.houseNumber && !formData.area && !formData.price) {
      alert('Vui lòng nhập ít nhất một số thông tin (ví dụ: địa chỉ hoặc diện tích) trước khi lưu nháp.');
      return;
    }
    try {
      const res = await axios.get(`\${API_BASE_URL}/properties`);
      const maxId = res.data.reduce((max, p) => {
        const idToCheck = p.propertyCode || p.id;
        const n = propertySequenceNumber(idToCheck);
        return n != null ? Math.max(max, n) : max;
      }, 0);
      const newId = `LS-${String(maxId + 1).padStart(5, '0')}`;
      const draftAddress = fullAddress || '(Chưa nhập địa chỉ)';
      await axios.post(`\${API_BASE_URL}/properties`, {
        id: newId,
        propertyCode: newId,
        address: draftAddress,
        district: address.district || '',
        ward: address.ward || '',
        houseNumber: address.houseNumber || '',
        street: address.street || '',
        province: address.province || DEFAULT_PROVINCE,
        futureWard: address.futureWard || null,
        type: formData.type,
        propertyType: formData.propertyType,
        price: formData.price ? Number(String(formData.price).replace(/,/g, '')) : 0,
        priceUnit: formData.priceUnit,
        price_display: buildPriceDisplayFromFields({
          price: formData.price ? Number(String(formData.price).replace(/,/g, '')) : 0,
          priceUnit: formData.priceUnit,
          type: formData.type,
        }),
        area: formData.area ? Number(String(formData.area).replace(/,/g, '')) : 0,
        bedrooms: Number(formData.bedrooms) || 0,
        bathrooms: Number(formData.bathrooms) || 0,
        direction: formData.direction,
        condition: formData.condition,
        source: formData.source,
        furniture: formData.furniture,
        floor: formData.floor ? parseInt(formData.floor, 10) : null,
        legalStatus: formData.legalStatus,
        description: formData.description,
        images: [],
        level1_status: 'Mới',
        level2_status: 'Chưa niêm yết',
        is_draft: true,
        createdBy: currentUser.name || 'Sales',
        createdBy_id: normalizeUserId(currentUser.id) ?? USER_ID ?? null,
        manager_name: managerName || currentUser.name || '',
        pos_name: currentUser.pos_name || 'POS Q1',
        pos_id: currentUser.pos_id || 1,
        createdAt: new Date().toISOString(),
      });
      await postEntityAudit({
        action: `[F2] Đầu chủ lưu nháp tài sản ${newId} (TRẠNG THÁI: Mới)`,
        actionType: AUDIT_ACTION_TYPE.PROPERTY_F2_DRAFT_SAVE,
        entityId: newId,
        property_id: newId,
        user: currentUser.name || 'Sales (F2)',
        user_id: USER_ID,
        new_status: 'Mới',
      });
      alert(`✅ Đã lưu nháp ${newId}! Bạn có thể tiếp tục chỉnh sửa và gửi duyệt sau.`);
      setMainTab('myprops');
    } catch (err) {
      const detail = err?.response?.data?.error || err?.message || '';
      alert(detail ? `Lỗi lưu nháp: ${detail}` : 'Lỗi khi lưu nháp. Kiểm tra API đang chạy port 5000.');
    }
  };

  const handleContinueToBranch = async (e) => {
    e.preventDefault();
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    const v = validatePropertySubmit({
      address,
      formData,
      imageCount: imageFiles.length,
      requireImages: true,
    });
    if (!v.ok) {
      alert(v.message);
      return;
    }

    const numPrice = Number(String(formData.price).replace(/,/g, ''));
    if (formData.type === 'Bán' && formData.priceUnit === 'VNĐ' && numPrice < 100000000) {
      if (!window.confirm('Cảnh báo: Giá bán quá thấp (< 100tr). Bạn có chắc chắn không?')) return;
    }

    const dupOk = await requireDuplicateGate(address, formData.type, pendingSubmitPropertyId);
    if (!dupOk) return;

    setPendingSubmitPropertyId(null);
    setShowBranchModal(true);
  };

  const handleSubmitBranch = async () => {
    if (!selectedBranch) return;

    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    const existingProp = pendingSubmitPropertyId
      ? properties.find((p) => p.id === pendingSubmitPropertyId)
      : null;
    const existingImageCount = existingProp?.images?.filter(Boolean).length || 0;
    const imageCount = pendingSubmitPropertyId ? existingImageCount : imageFiles.length;

    const v = validatePropertySubmit({
      address,
      formData,
      imageCount,
      requireImages: true,
    });
    if (!v.ok) {
      alert(v.message);
      return;
    }

    const dupOk = await requireDuplicateGate(address, formData.type, pendingSubmitPropertyId);
    if (!dupOk) return;

    let lv1Status = '';
    if (selectedBranch === 1) lv1Status = 'Chờ KH ký';
    else if (selectedBranch === 2) lv1Status = 'Chờ duyệt đảm bảo';
    else if (selectedBranch === 3) lv1Status = 'Chờ POS duyệt';

    const dummyImageUrls = [];
    if (!pendingSubmitPropertyId) {
      for (let i = 0; i < imageFiles.length; i++) {
        dummyImageUrls.push(`https://picsum.photos/seed/ihz-create-${Date.now()}-${i}/1200/800`);
      }
    }

    const body = {
      address: fullAddress,
      futureWard: address.futureWard || null,
      district: address.district,
      ward: address.ward,
      houseNumber: address.houseNumber,
      street: address.street,
      province: address.province || DEFAULT_PROVINCE,
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
      statusLv1: lv1Status,
      level1_status: lv1Status,
      statusLv2: 'Chưa niêm yết',
      level2_status: 'Chưa niêm yết',
      price_display: buildPriceDisplayFromFields({
        price: Number(String(formData.price).replace(/,/g, '')),
        priceUnit: formData.priceUnit,
        type: formData.type,
      }),
      is_draft: false,
      updatedAt: new Date().toISOString(),
    };

    const now = new Date().toISOString();
    body.approval_branch = selectedBranch;
    if (selectedBranch === 1) {
      body.esign_sent_at = now;
      body.esign_link_demo = `https://esign.ihouzz.demo/kh-ky/${Date.now()}`;
    }

    let savedId = pendingSubmitPropertyId;
    if (pendingSubmitPropertyId) {
      if (dummyImageUrls.length) body.images = dummyImageUrls;
      await axios.patch(
        `\${API_BASE_URL}/properties/${encodeURIComponent(pendingSubmitPropertyId)}`,
        body,
      );
    } else {
      const res = await axios.get(`\${API_BASE_URL}/properties`);
      const maxId = res.data.reduce((max, p) => {
        const idToCheck = p.propertyCode || p.id;
        const n = propertySequenceNumber(idToCheck);
        return n != null ? Math.max(max, n) : max;
      }, 0);
      savedId = `LS-${String(maxId + 1).padStart(5, '0')}`;
      await axios.post(`\${API_BASE_URL}/properties`, {
        id: savedId,
        propertyCode: savedId,
        ...body,
        images: dummyImageUrls,
        createdBy: currentUser.name || 'Sales 1',
        createdBy_id: normalizeUserId(currentUser.id) ?? USER_ID ?? null,
        manager_name: managerName || currentUser.name || 'Sales 1',
        pos_name: currentUser.pos_name || 'POS Q1',
        pos_id: currentUser.pos_id || 1,
        createdAt: now,
      });
    }

    const logAction =
      selectedBranch === 1
        ? `[F2] Nhánh 1 — Gửi link eSign KH, ${savedId} → Chờ KH ký`
        : selectedBranch === 2
          ? `[F2] Nhánh 2 — Gửi duyệt đảm bảo ${savedId}`
          : `[F2] Nhánh 3 — Gửi duyệt (đã ký sẵn) ${savedId}`;
    await postEntityAudit({
      action: logAction,
      actionType: AUDIT_ACTION_TYPE.PROPERTY_F2_SUBMIT_WAREHOUSE,
      entityId: savedId,
      property_id: savedId,
      user: currentUser.name || 'Sales (F2)',
      user_id: USER_ID,
      extra: { selectedBranch },
    });

    if (selectedBranch === 1) {
      await axios.post(`\${API_BASE_URL}/notifications`, {
        propertyId: savedId,
        recipient: 'Khách hàng (demo)',
        message: `[Demo eSign] Link ký HĐMG đã gửi qua Zalo OA / Email cho ${savedId}.`,
        type: 'info',
        createdAt: now,
        isRead: false,
      });
    } else if (selectedBranch === 2 || selectedBranch === 3) {
      await axios.post(`\${API_BASE_URL}/notifications`, {
        propertyId: savedId,
        recipient: currentUser.pos_name ? 'GĐ POS' : 'Giám đốc POS',
        message:
          selectedBranch === 2
            ? `Tài sản ${savedId} chờ phê duyệt Kho Đảm bảo.`
            : `Tài sản ${savedId} chờ phê duyệt nhập Kho Chuẩn (HĐMG đã ký).`,
        type: 'info',
        createdAt: now,
        isRead: false,
      });
    }

    setShowBranchModal(false);
    setSelectedBranch(null);
    setPendingSubmitPropertyId(null);
    setDupAcknowledged(false);
    await reloadPropertiesAndListings();

    if (selectedBranch === 1) {
      setEsignFlowPropId(savedId);
      setShowEsignFlowModal(true);
      setMainTab('myprops');
      return;
    }

    const code = formatPropertyId(savedId);
    if (selectedBranch === 2) {
      alert(`✅ ${code} — Đã gửi «Chờ duyệt đảm bảo». GĐ POS sẽ xử lý tại mục Duyệt kho.`);
    } else {
      alert(`✅ ${code} — Đã gửi «Chờ POS duyệt». GĐ POS sẽ xử lý tại mục Duyệt kho.`);
    }
    setMainTab('myprops');
  };

  const dupIconClass = dupStatus === 'checking'
    ? 'text-warning' : dupStatus === 'dup'
    ? 'text-danger' : dupStatus === 'clear'
    ? 'text-success' : 'd-none';

  return (
    <div className="container-fluid p-4">
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item"><a href="/dashboard">Kho hàng</a></li>
          <li className="breadcrumb-item active">Tạo Hồ sơ Tài sản (F2)</li>
        </ol>
      </nav>

      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
        <div>
          <h3 className="fw-bold m-0">Khởi tạo &amp; Quản lý Tài sản (F2)</h3>
          <small className="text-muted">Chuyên viên Đầu chủ thực hiện</small>
        </div>
        <div className="btn-group shadow-sm" role="group">
          <button type="button" className={`btn ${mainTab === 'create' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setMainTab('create')}>
            <i className="bi bi-plus-circle me-1"></i>Tạo mới
          </button>
          <button type="button" className={`btn ${mainTab === 'myprops' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setMainTab('myprops')}>
            <i className="bi bi-building me-1"></i>Tài sản của tôi
            <span className="badge bg-white text-primary ms-2">{myPropsListFiltered.length}</span>
          </button>
        </div>
      </div>

      {mainTab === 'create' && (
      <>
      <div className="d-flex justify-content-end mb-3">
        <span className="badge bg-secondary fs-6">Trạng thái: Mới</span>
      </div>

      <form onSubmit={handleContinueToBranch}>
        <div className="row">
          {/* Cột trái */}
          <div className="col-md-8">

            {/* Section 1: Loại giao dịch */}
            <div className="card shadow-sm border-0 mb-4 p-4">
              <h5 className="fw-bold mb-3 border-bottom pb-2">
                <i className="bi bi-tags-fill text-primary me-2"></i>1. Loại hình Giao dịch
              </h5>
              <div className="d-flex gap-4">
                {['Bán', 'Thuê'].map(t => (
                  <div className="form-check" key={t}>
                    <input className="form-check-input" type="radio" name="gdType"
                      id={`gd${t}`} value={t}
                      checked={formData.type === t}
                      onChange={e => {
                        setFormData({ ...formData, type: e.target.value });
                        setDupStatus(null);
                        setDupAcknowledged(false);
                      }} />
                    <label className="form-check-label" htmlFor={`gd${t}`}>
                      {t === 'Bán' ? '🏷️ Mua Bán (kiểm tra trùng địa chỉ)' : '🔑 Cho Thuê'}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 2: Thông tin Địa chỉ (SmartAddress) */}
            <div className="card shadow-sm border-0 mb-4 p-4">
              <h5 className="fw-bold mb-3 border-bottom pb-2">
                <i className="bi bi-geo-alt-fill text-danger me-2"></i>2. Vị trí Bất động sản
              </h5>

              <SmartAddress
                value={address}
                onChange={(newAddr) => {
                  setAddress(newAddr);
                  setDupStatus(null);
                  setDupAcknowledged(false);
                }}
              />

              {/* Inline duplicate check indicator */}
              <div className="mt-2" onBlur={handleBlurDupCheck}>
                {dupStatus === 'checking' && (
                  <div className="alert alert-warning py-2 px-3">
                    <span className="spinner-border spinner-border-sm me-2"></span>
                    Đang kiểm tra trùng địa chỉ...
                  </div>
                )}
                {dupStatus === 'clear' && (
                  <div className="alert alert-success py-2 px-3">
                    <i className="bi bi-check-circle-fill me-2"></i>Địa chỉ chưa có trong hệ thống. Bạn có thể tiếp tục.
                  </div>
                )}
                {dupStatus === 'dup' && (
                  <div className="alert alert-danger py-2 px-3">
                    <i className="bi bi-exclamation-triangle-fill me-2"></i>
                    Phát hiện địa chỉ trùng lặp! Vui lòng kiểm tra lại.
                    <button type="button" className="btn btn-sm btn-outline-danger ms-3"
                      onClick={() => setShowDuplicateModal(true)}>Xem chi tiết</button>
                  </div>
                )}
              </div>
              <div className="d-flex justify-content-end mt-2">
                <button type="button" className="btn btn-sm btn-outline-primary"
                  onClick={handleBlurDupCheck} disabled={!address.houseNumber || !address.street}>
                  <i className="bi bi-search me-1"></i>Kiểm tra trùng địa chỉ
                </button>
              </div>
            </div>

            {/* Section 3: Thông tin kỹ thuật */}
            <div className="card shadow-sm border-0 mb-4 p-4">
              <h5 className="fw-bold mb-3 border-bottom pb-2">
                <i className="bi bi-building me-2 text-success"></i>3. Thông tin Kỹ thuật & Giá
              </h5>
              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label small text-muted">Loại BĐS <span className="text-danger">*</span></label>
                  <select className="form-select" value={formData.propertyType}
                    onChange={e => setFormData({ ...formData, propertyType: e.target.value })}>
                    <option>Căn hộ chung cư</option>
                    <option>Nhà phố</option>
                    <option>Đất nền</option>
                    <option>Biệt thự</option>
                    <option>Shophouse</option>
                    <option>Văn phòng</option>
                  </select>
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label small text-muted">Pháp lý <span className="text-danger">*</span></label>
                  <select className="form-select" value={formData.legalStatus}
                    onChange={e => setFormData({ ...formData, legalStatus: e.target.value })}>
                    <option>Sổ đỏ</option>
                    <option>Sổ hồng</option>
                    <option>Hợp đồng mua bán</option>
                    <option>Đang chờ sổ</option>
                  </select>
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label small text-muted">Diện tích (m²) <span className="text-danger">*</span></label>
                  <input type="text" className="form-control" placeholder="VD: 60" required
                    value={formData.area} onChange={handleAreaChange} />
                </div>
                <div className="col-md-5 mb-3">
                  <label className="form-label small text-muted">Giá <span className="text-danger">*</span></label>
                  <div className="input-group">
                    <input type="text" className="form-control" placeholder="VD: 1,000,000" required
                      value={formData.price} onChange={handlePriceChange} />
                    <select className="form-select" style={{maxWidth: '140px'}}
                      value={formData.priceUnit} onChange={e => setFormData({ ...formData, priceUnit: e.target.value })}>
                      <option value="tỷ VNĐ">tỷ VNĐ</option>
                      <option value="triệu VNĐ">triệu VNĐ</option>
                      <option value="VNĐ">VNĐ</option>
                      <option value="VNĐ/tháng">VNĐ/tháng</option>
                      <option value="triệu VNĐ/tháng">triệu VNĐ/tháng</option>
                    </select>
                  </div>
                </div>
                <div className="col-md-2 mb-3">
                  <label className="form-label small text-muted">Phòng ngủ</label>
                  <input type="number" className="form-control" min="0"
                    value={formData.bedrooms} onChange={e => setFormData({ ...formData, bedrooms: e.target.value })} />
                </div>
                <div className="col-md-2 mb-3">
                  <label className="form-label small text-muted">Phòng tắm</label>
                  <input type="number" className="form-control" min="0"
                    value={formData.bathrooms} onChange={e => setFormData({ ...formData, bathrooms: e.target.value })} />
                </div>

                {/* Các trường mở rộng */}
                <div className="col-md-3 mb-3">
                  <label className="form-label small text-muted">Hướng</label>
                  <select className="form-select" value={formData.direction}
                    onChange={e => setFormData({ ...formData, direction: e.target.value })}>
                    <option value="">-- Chọn --</option>
                    <option>Đông</option><option>Tây</option><option>Nam</option><option>Bắc</option>
                    <option>Đông Nam</option><option>Đông Bắc</option><option>Tây Nam</option><option>Tây Bắc</option>
                  </select>
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label small text-muted">Tình trạng</label>
                  <select className="form-select" value={formData.condition}
                    onChange={e => setFormData({ ...formData, condition: e.target.value })}>
                    <option value="">-- Chọn --</option>
                    <option>Nhà mới</option>
                    <option>Đang sử dụng</option>
                    <option>Cần cải tạo</option>
                  </select>
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label small text-muted">Nguồn hàng</label>
                  <select className="form-select" value={formData.source}
                    onChange={e => setFormData({ ...formData, source: e.target.value })}>
                    <option value="">-- Chọn --</option>
                    <option>Chuyển nhượng</option>
                    <option>Dự án</option>
                    <option>Cá nhân</option>
                  </select>
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label small text-muted">Nội thất</label>
                  <select className="form-select" value={formData.furniture}
                    onChange={e => setFormData({ ...formData, furniture: e.target.value })}>
                    <option value="">-- Chọn --</option>
                    <option>Đầy đủ</option>
                    <option>Cơ bản</option>
                    <option>Nhà trống</option>
                  </select>
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label small text-muted">Tầng (VD: 5)</label>
                  <input type="number" className="form-control" min="1" placeholder="Số tầng (nguyên)"
                    value={formData.floor} 
                    onChange={e => {
                      const val = e.target.value;
                      if (!val || /^\d+$/.test(val)) setFormData({ ...formData, floor: val });
                    }} />
                </div>
                <div className="col-12 mb-1">
                  <label className="form-label small text-muted">Mô tả chi tiết</label>
                  <textarea className="form-control" rows="3"
                    placeholder="Nhập mô tả thêm về tài sản..."
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })} />
                  <div className="form-text text-end">{formData.description.length}/500 ký tự</div>
                </div>

                {/* Thông tin Quản lý Tài sản */}
                <div className="col-12 mb-1">
                  <div className="card border-0 bg-light p-3 rounded">
                    <div className="row g-2 align-items-center">
                      <div className="col-md-6">
                        <label className="form-label small fw-semibold mb-1">
                          <i className="bi bi-person-badge me-1 text-primary"></i>Người tạo hồ sơ
                        </label>
                        <input type="text" className="form-control bg-white" readOnly
                          value={currentUser.name || '(Chưa đăng nhập)'} />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label small fw-semibold mb-1">
                          <i className="bi bi-person-check me-1 text-success"></i>
                          Quản lý Tài sản
                          {ROLE === 'admin' && <span className="badge bg-warning text-dark ms-1" style={{fontSize:10}}>Admin có thể sửa</span>}
                        </label>
                        {ROLE === 'admin' ? (
                          <input type="text" className="form-control border-success"
                            placeholder="Nhập tên người quản lý tài sản..."
                            value={managerName}
                            onChange={e => setManagerName(e.target.value)} />
                        ) : (
                          <input type="text" className="form-control bg-white" readOnly
                            value={currentUser.name || '(Người tạo)'} />
                        )}
                        <div className="form-text">Mặc định là người tạo hồ sơ. Admin có thể thay đổi khi bàn giao tài sản.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Cột phải: Đính kèm & Actions */}
          <div className="col-md-4">
            <div className="card shadow-sm border-0 mb-4 p-4 sticky-top" style={{ top: 20 }}>
              <h5 className="fw-bold mb-3 border-bottom pb-2">
                <i className="bi bi-paperclip me-2 text-warning"></i>4. Ảnh &amp; tệp pháp lý
              </h5>
              <p className="small text-danger mb-2">
                <span className="text-danger">*</span> Bắt buộc ít nhất <strong>1 ảnh</strong> (JPG/PNG/WebP) minh họa tài sản.
              </p>
              <div className="border border-2 border-dashed rounded p-4 text-center bg-light text-muted mb-3 position-relative" style={{ cursor: 'pointer' }}>
                <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,image/*"
                  className="position-absolute w-100 h-100 opacity-0 top-0 start-0" style={{ cursor: 'pointer' }}
                  onChange={handleFileUpload} />
                <i className="bi bi-cloud-arrow-up fs-2 text-primary"></i>
                <p className="mt-2 mb-1 fw-bold text-dark">Click hoặc kéo thả file vào đây</p>
                <small>Ảnh bắt buộc + tệp pháp lý (PDF/JPG, max 10MB/file)</small>
              </div>

              {files.length > 0 && (
                <div className="mb-3">
                  <p className="small fw-bold mb-2">Đã đính kèm ({files.length} file):</p>
                  <ul className="list-group list-group-flush small">
                    {files.map((f, idx) => (
                      <li key={idx} className="list-group-item bg-transparent px-0 py-1 d-flex justify-content-between align-items-center">
                        <span className="text-truncate text-primary" style={{maxWidth: '200px', cursor: 'pointer', textDecoration: 'underline'}} 
                              onClick={() => window.open(URL.createObjectURL(f), '_blank')} title="Click để xem file">
                          <i className="bi bi-file-earmark-image me-2"></i>{f.name}
                        </span>
                        <div>
                          <span className="text-muted small me-3">{(f.size / (1024 * 1024)).toFixed(1)} MB</span>
                          <i className="bi bi-x-circle-fill text-danger fs-5" style={{cursor: 'pointer'}} title="Xóa file"
                             onClick={() => {
                               const newFiles = [...files];
                               newFiles.splice(idx, 1);
                               setFiles(newFiles);
                             }}></i>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="alert alert-info mt-2 py-2 px-2 small mb-0 border-0 rounded-3">
                    <i className="bi bi-info-circle-fill me-1"></i>Hệ thống sẽ lưu file qua CSDL Backend / Cloud Storage (AWS S3) khi Submit.
                  </div>
                </div>
              )}

              {/* Summary card */}
              <div className="card bg-light border-0 p-3 mb-3">
                <div className="small text-muted mb-1">📍 Địa chỉ tạm:</div>
                <div className="small fw-semibold">
                  {fullAddress || <span className="text-muted fst-italic">Chưa nhập địa chỉ</span>}
                </div>
                {address.futureWard && (
                  <div className="small mt-1 text-info">
                    <i className="bi bi-arrow-right me-1"></i>Phường mới: <strong>{address.futureWard}</strong>
                  </div>
                )}
              </div>

              <div className="d-grid gap-2">
                <button type="button" className="btn btn-outline-secondary"
                  onClick={handleSaveDraft}>
                  <i className="bi bi-floppy me-2"></i>Lưu nháp
                </button>
                <button type="submit" className="btn btn-primary fw-bold">
                  Tiếp tục → Chọn Nhánh Gửi Duyệt
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* Modal: Cảnh báo trùng lặp (BR-001) */}
      {showDuplicateModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content border-warning border-2">
              <div className="modal-header bg-warning bg-opacity-10 border-0">
                <h5 className="modal-title fw-bold text-warning-emphasis">
                  <i className="bi bi-exclamation-triangle-fill text-warning me-2"></i>
                  Phát hiện địa chỉ có thể trùng lặp
                </h5>
              </div>
              <div className="modal-body">
                <p>Địa chỉ bạn nhập tương đồng với tài sản đang hoạt động trong hệ thống:</p>
                <table className="table table-sm table-bordered">
                  <thead className="table-light">
                    <tr><th>Mã LS-</th><th>POS Sở hữu</th><th>Kho (Lv1)</th><th>Niêm yết (Lv2)</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="fw-bold text-primary">{formatPropertyId(dupInfo?.propertyCode || dupInfo?.id || '')}</td>
                      <td>{dupInfo?.pos_name || '—'}</td>
                      <td><span className="badge bg-success">{dupInfo?.level1_status || dupInfo?.statusLv1}</span></td>
                      <td><span className="badge bg-info text-dark">{dupInfo?.level2_status || dupInfo?.statusLv2}</span></td>
                    </tr>
                  </tbody>
                </table>
                <p className="small text-danger fst-italic">
                  * Địa chỉ chi tiết bị ẩn do tài sản thuộc chi nhánh khác.
                </p>
              </div>
              <div className="modal-footer border-0">
                <button type="button" className="btn btn-outline-secondary"
                  onClick={() => { setShowDuplicateModal(false); setDupStatus(null); setDupAcknowledged(false); }}>
                  Quay lại chỉnh sửa
                </button>
                <button type="button" className="btn btn-warning fw-bold"
                  onClick={() => { setShowDuplicateModal(false); setDupAcknowledged(true); }}>
                  Xác nhận, tiếp tục tạo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Chọn nhánh gửi duyệt (FR2-004, FR2-005, FR2-006) */}
      {showBranchModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-primary text-white">
                <h5 className="modal-title fw-bold">
                  <i className="bi bi-diagram-3 me-2"></i>Chọn Nhánh Gửi Duyệt Hồ sơ
                </h5>
                <button type="button" className="btn-close btn-close-white"
                  onClick={() => setShowBranchModal(false)}></button>
              </div>
              <div className="modal-body p-4">
                <p className="mb-4 text-center text-muted">
                  Chọn 1 trong 3 nhánh quy trình theo tình trạng Hợp đồng Môi giới (HĐMG)
                </p>
                <div className="row g-3">
                  {[
                    { id: 1, icon: 'bi-pen', color: 'primary', label: 'Gửi KH ký online', desc: 'Hệ thống gửi link eSign qua Zalo. Chờ KH ký mới gửi duyệt tiếp.', badge: 'Kho Chuẩn', badgeColor: 'success' },
                    { id: 2, icon: 'bi-shield-check', color: 'warning', label: 'Gửi duyệt Đảm bảo', desc: 'Cam kết không ký HĐMG. Gửi thẳng lên GĐ POS duyệt ngay.', badge: 'Kho Đảm bảo', badgeColor: 'warning' },
                    { id: 3, icon: 'bi-file-earmark-check', color: 'success', label: 'Gửi (đã ký sẵn)', desc: 'Đã có hợp đồng giấy/online. Đính kèm file HĐMG để gửi duyệt.', badge: 'Kho Chuẩn', badgeColor: 'success' },
                  ].map(b => (
                    <div key={b.id} className="col-md-4">
                      <div
                        className={`card h-100 text-center p-3 border-2 ${selectedBranch === b.id ? `border-${b.color} bg-${b.color} bg-opacity-10` : 'border-light'}`}
                        style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                        onClick={() => setSelectedBranch(b.id)}
                      >
                        <i className={`bi ${b.icon} fs-1 text-${b.color} mb-2`}></i>
                        <h6 className="fw-bold">{b.label}</h6>
                        <p className="small text-muted mb-3">{b.desc}</p>
                        <span className={`badge bg-${b.badgeColor} ${b.badgeColor === 'warning' ? 'text-dark' : ''}`}>→ {b.badge}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer bg-light border-0">
                <button type="button" className="btn btn-secondary"
                  onClick={() => setShowBranchModal(false)}>Hủy</button>
                <button type="button" className="btn btn-primary fw-bold px-4"
                  disabled={!selectedBranch} onClick={handleSubmitBranch}>
                  <i className="bi bi-send me-2"></i>Xác nhận Gửi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </>
      )}

      {mainTab === 'myprops' && (
        <div className="card border-0 shadow-sm">
          {esignFlowProperty && (
            <div className="card-body border-bottom py-3 bg-primary bg-opacity-10">
              <div className="d-flex flex-wrap align-items-start justify-content-between gap-3">
                <div className="flex-grow-1">
                  <h6 className="fw-bold text-primary mb-2">
                    <i className="bi bi-pen me-2"></i>
                    Nhánh 1 — eSign HĐMG · {propertyDisplayCode(esignFlowProperty)}
                  </h6>
                  {esignFlowProperty.level1_status === 'Chờ KH ký' && (
                    <>
                      <p className="small mb-2">
                        Đang chờ Khách hàng ký. Link eSign đã gửi qua <strong>Zalo OA / Email</strong> (demo).
                        {esignFlowProperty.esign_link_demo && (
                          <span className="d-block mt-1 text-muted">
                            Link: <code className="user-select-all">{esignFlowProperty.esign_link_demo}</code>
                          </span>
                        )}
                      </p>
                      <span className="badge bg-warning text-dark">Chờ KH ký</span>
                    </>
                  )}
                  {esignFlowProperty.level1_status === 'KH đã ký' && (
                    <>
                      <p className="small mb-2">KH đã ký HĐMG — bấm <strong>Gửi duyệt POS</strong> để sang «Chờ POS duyệt».</p>
                      <span className="badge bg-success">KH đã ký</span>
                    </>
                  )}
                </div>
                <div className="d-flex flex-wrap gap-2">
                  {esignFlowProperty.level1_status === 'Chờ KH ký' && (
                    <button type="button" className="btn btn-primary btn-sm fw-bold"
                      onClick={() => handleConfirmKhSigned(esignFlowProperty)}>
                      <i className="bi bi-check2-circle me-1"></i>Xác nhận KH đã ký
                    </button>
                  )}
                  {esignFlowProperty.level1_status === 'KH đã ký' && (
                    <button type="button" className="btn btn-success btn-sm fw-bold"
                      onClick={() => handleSendEsignToPos(esignFlowProperty)}>
                      <i className="bi bi-send-check me-1"></i>Gửi duyệt POS
                    </button>
                  )}
                  <button type="button" className="btn btn-outline-secondary btn-sm"
                    onClick={() => { setEsignFlowPropId(null); setShowEsignFlowModal(false); }}>
                    Đóng theo dõi
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="card-header bg-white d-flex justify-content-between align-items-center py-3">
            <span className="fw-bold"><i className="bi bi-building me-2 text-primary"></i>Tài sản của tôi</span>
            <button type="button" className="btn btn-sm btn-outline-primary"
              onClick={async () => {
                try {
                  const [resP, resL] = await Promise.all([
                    axios.get(`\${API_BASE_URL}/properties`),
                    axios.get(`\${API_BASE_URL}/listings`),
                  ]);
                  setProperties(normalizeJsonServerList(resP.data));
                  setListings(normalizeJsonServerList(resL.data));
                } catch (e) { console.error(e); }
              }}>
              <i className="bi bi-arrow-clockwise"></i>
            </button>
          </div>
          <div className="card-body py-2 border-bottom bg-light">
            <div className="row g-2 align-items-end">
              <div className="col-lg-3 col-md-6">
                <label className="form-label small mb-0 text-muted">Tìm kiếm theo ký tự</label>
                <input
                  type="search"
                  className="form-control form-control-sm"
                  placeholder="Tìm mã LS / địa chỉ…"
                  value={myPropsSearch}
                  onChange={(e) => setMyPropsSearch(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="col-lg-3 col-md-6">
                <label className="form-label small mb-0 text-muted d-block">Loại giao dịch</label>
                <div className="btn-group btn-group-sm w-100">
                  {['all', 'Bán', 'Thuê'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`btn ${myPropsTypeFilter === t ? 'btn-info text-white' : 'btn-outline-info'}`}
                      onClick={() => setMyPropsTypeFilter(t)}
                      style={{ flex: 1 }}
                    >
                      {t === 'all' ? 'Tất cả' : t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="col-lg-3 col-md-6">
                <label className="form-label small mb-0 text-muted">Lọc trạng thái</label>
                <select
                  className="form-select form-select-sm"
                  value={myPropsStatusFilter}
                  onChange={(e) => setMyPropsStatusFilter(e.target.value)}
                >
                  {MY_PROPS_STATUS_OPTIONS.map((o) => (
                    <option key={o.value === MY_PROPS_STATUS_ALL ? '__all' : o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="col-lg-3 col-md-12">
                <div className="form-check pb-1">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="f2MyPropsShowRemoved"
                    checked={includeRemovedMyProps}
                    onChange={(e) => setIncludeRemovedMyProps(e.target.checked)}
                  />
                  <label className="form-check-label small" htmlFor="f2MyPropsShowRemoved">
                    Hiển thị tài sản <strong className="text-danger">Đã gỡ nguồn</strong> (mặc định ẩn)
                  </label>
                </div>
              </div>
            </div>
            <div className="small text-muted mt-2">
              Hiển thị <strong>{myPropsListFiltered.length}</strong> / {myPropsListRaw.length} tài sản
              {!includeRemovedMyProps && <span> · Đang ẩn <strong>Đã gỡ nguồn</strong></span>}
            </div>
          </div>
          <div className="table-responsive">
            <table className="table table-sm align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>Mã</th>
                  <th>Loại BĐS</th>
                  <th>Địa chỉ</th>
                  <th>Loại GD</th>
                  <th>Giá</th>
                  <th>Kho</th>
                  <th>Trạng thái kho</th>
                  <th>Yêu cầu cập nhật</th>
                  <th className="text-end">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {myPropsListFiltered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center text-muted py-4">
                      {myPropsListRaw.length === 0
                        ? 'Chưa có tài sản thuộc tài khoản của bạn.'
                        : 'Không có tài sản khớp bộ lọc hoặc từ khóa tìm kiếm.'}
                    </td>
                  </tr>
                )}
                {myPropsListFiltered.slice().reverse().map((p) => {
                  const lv1 = p.level1_status || p.statusLv1 || '—';
                  const lv2 = p.level2_status || p.statusLv2 || '—';
                  const pendingUp = p.update_request_status === UPDATE_REQUEST_PENDING;
                  return (
                    <tr key={p.id} style={lv1 === 'Mới' ? { background: '#fffbeb' } : {}}>
                      <td className="fw-semibold text-primary text-nowrap">{formatPropertyId(p.propertyCode || p.id)}</td>
                      <td className="small">{p.propertyType || '—'}</td>
                      <td className="small" style={{ minWidth: 200 }}>
                        <div>{p.address || '—'}</div>
                      </td>
                      <td>
                        <span className={`badge ${p.type === 'Thuê' ? 'bg-info text-dark' : 'bg-danger'}`}>{p.type || '—'}</span>
                      </td>
                      <td className="small text-nowrap">{formatPropertyPriceDisplay(ROLE, p, POS_ID, POS_NAME)}</td>
                      <td className="small">{warehouseLabel(p)}</td>
                      <td className="small">
                        <div>
                          <span className={`badge ${lv1 === 'Mới' ? 'bg-warning text-dark' : 'bg-secondary'}`}>
                            {lv1 === 'Mới' ? '📝 Nháp' : lv1}
                          </span>
                        </div>
                        <div className="mt-1">
                          <span className="badge bg-light text-dark border" title="Level 2 niêm yết">Lv2: {lv2}</span>
                        </div>
                      </td>
                      <td>
                        {pendingUp ? (
                          <span className="badge bg-info text-dark">Chờ GĐ POS duyệt cập nhật</span>
                        ) : propertyHasLiveListingForUpdateLock(p, listings) ? (
                          <span className="badge bg-warning text-dark">Đang niêm yết — không chỉnh kho</span>
                        ) : lv1 === 'Mới' ? (
                          <span className="badge bg-warning text-dark">⏳ Chưa gửi duyệt</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="text-end">
                        {(lv1 === 'Mới' || lv1 === 'Bị từ chối') && (
                          <button type="button" className={`btn btn-sm me-1 ${lv1 === 'Bị từ chối' ? 'btn-outline-danger' : 'btn-warning'}`}
                            onClick={() => openDraftModal(p)}>
                            <i className="bi bi-pencil-square me-1"></i>
                            {lv1 === 'Bị từ chối' ? 'Chỉnh sửa & gửi lại' : 'Hoàn thiện hồ sơ'}
                          </button>
                        )}
                        {lv1 === 'Chờ KH ký' && (
                          <button type="button" className="btn btn-sm btn-primary me-1"
                            onClick={() => handleConfirmKhSigned(p)}>
                            <i className="bi bi-check2-circle me-1"></i>Xác nhận KH đã ký
                          </button>
                        )}
                        {lv1 === 'KH đã ký' && (
                          <button type="button" className="btn btn-sm btn-success me-1"
                            onClick={() => handleSendEsignToPos(p)}>
                            <i className="bi bi-send-check me-1"></i>Gửi duyệt POS
                          </button>
                        )}
                        {canRequestPropertyUpdate(p, USER_ID, listings) && (
                          <button type="button" className="btn btn-sm btn-outline-primary"
                            onClick={() => openUpdateRequestModal(p)}>
                            <i className="bi bi-layout-sidebar-reverse me-1"></i>Gửi yêu cầu cập nhật
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Hoàn thiện hồ sơ nháp */}
      {showDraftModal && draftTarget && draftEditForm && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 1055 }}>
          <div className="modal-dialog modal-xl modal-dialog-scrollable">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header text-white" style={{ background: 'linear-gradient(90deg,#f59e0b,#d97706)' }}>
                <h5 className="modal-title fw-bold">
                  <i className="bi bi-pencil-square me-2"></i>Hoàn thiện hồ sơ Nháp — {draftTarget.propertyCode || draftTarget.id}
                </h5>
                <button type="button" className="btn-close btn-close-white"
                  onClick={() => {
                    setShowDraftModal(false);
                    setDraftTarget(null);
                    setDraftEditForm(null);
                    setDraftExtraFiles([]);
                  }} />
              </div>
              <div className="modal-body">
                <div className="alert alert-warning py-2 mb-3">
                  <i className="bi bi-info-circle me-2"></i>
                  <strong>Trạng thái Hiện tại: Nháp (Mới)</strong> — Bổ sung đủ Quận, <strong>Phường</strong>, Số nhà, Đường, Diện tích, Giá và ít nhất 1 ảnh trước khi <strong>Gửi duyệt</strong>. Loại <strong>Bán</strong> sẽ bắt buộc kiểm tra trùng địa chỉ.
                </div>
                <div className="row g-3">
                  <div className="col-12">
                    <label className="form-label fw-semibold">Địa chỉ (Quận, Phường, Số nhà, Đường) <span className="text-danger">*</span></label>
                    <SmartAddress
                      value={draftEditForm.addressFields}
                      onChange={(addressFields) => {
                        setDraftEditForm({ ...draftEditForm, addressFields });
                        setDupAcknowledged(false);
                      }}
                    />
                    <div className="small text-muted mt-1">
                      {buildFullAddress(draftEditForm.addressFields) || 'Chưa đủ thành phần địa chỉ'}
                    </div>
                  </div>
                  <div className="col-md-3">
                    <label className="form-label fw-semibold">Loại GD</label>
                    <select className="form-select" value={draftEditForm.type}
                      onChange={e => {
                        setDraftEditForm({ ...draftEditForm, type: e.target.value });
                        setDupAcknowledged(false);
                      }}>
                      <option>Bán</option><option>Thuê</option>
                    </select>
                  </div>
                  <div className="col-md-3">
                    <label className="form-label fw-semibold">Loại BĐS</label>
                    <select className="form-select" value={draftEditForm.propertyType}
                      onChange={e => setDraftEditForm({ ...draftEditForm, propertyType: e.target.value })}>
                      <option>Căn hộ chung cư</option><option>Nhà phố</option>
                      <option>Đất nền</option><option>Biệt thự</option>
                      <option>Shophouse</option><option>Văn phòng</option>
                    </select>
                  </div>
                  <div className="col-md-2">
                    <label className="form-label fw-semibold">Diện tích (m²) <span className="text-danger">*</span></label>
                    <input type="number" className="form-control" min="1" value={draftEditForm.area}
                      onChange={e => setDraftEditForm({ ...draftEditForm, area: e.target.value })} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label fw-semibold">Giá <span className="text-danger">*</span></label>
                    <input type="text" className="form-control" value={draftEditForm.price}
                      onChange={e => setDraftEditForm({ ...draftEditForm, price: e.target.value })} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label fw-semibold">Đơn vị giá</label>
                    <select className="form-select" value={draftEditForm.priceUnit}
                      onChange={e => setDraftEditForm({ ...draftEditForm, priceUnit: e.target.value })}>
                      <option value="tỷ VNĐ">tỷ VNĐ</option>
                      <option value="triệu VNĐ">triệu VNĐ</option>
                      <option value="VNĐ">VNĐ</option>
                      <option value="VNĐ/tháng">VNĐ/tháng</option>
                      <option value="triệu VNĐ/tháng">triệu VNĐ/tháng</option>
                    </select>
                  </div>
                  <div className="col-md-2">
                    <label className="form-label fw-semibold">Phòng ngủ</label>
                    <input type="number" className="form-control" min="0" value={draftEditForm.bedrooms}
                      onChange={e => setDraftEditForm({ ...draftEditForm, bedrooms: e.target.value })} />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label fw-semibold">Phòng tắm</label>
                    <input type="number" className="form-control" min="0" value={draftEditForm.bathrooms}
                      onChange={e => setDraftEditForm({ ...draftEditForm, bathrooms: e.target.value })} />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label fw-semibold">Tầng</label>
                    <input type="number" className="form-control" value={draftEditForm.floor}
                      onChange={e => setDraftEditForm({ ...draftEditForm, floor: e.target.value })} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label fw-semibold">Hướng</label>
                    <select className="form-select" value={draftEditForm.direction}
                      onChange={e => setDraftEditForm({ ...draftEditForm, direction: e.target.value })}>
                      <option value="">— Chọn —</option>
                      <option>Đông</option><option>Tây</option><option>Nam</option><option>Bắc</option>
                      <option>Đông Nam</option><option>Đông Bắc</option><option>Tây Nam</option><option>Tây Bắc</option>
                    </select>
                  </div>
                  <div className="col-md-3">
                    <label className="form-label fw-semibold">Tình trạng</label>
                    <select className="form-select" value={draftEditForm.condition}
                      onChange={e => setDraftEditForm({ ...draftEditForm, condition: e.target.value })}>
                      <option value="">— Chọn —</option>
                      <option>Nhà mới</option><option>Đang sử dụng</option><option>Cần cải tạo</option>
                    </select>
                  </div>
                  <div className="col-md-3">
                    <label className="form-label fw-semibold">Nội thất</label>
                    <select className="form-select" value={draftEditForm.furniture}
                      onChange={e => setDraftEditForm({ ...draftEditForm, furniture: e.target.value })}>
                      <option value="">— Chọn —</option>
                      <option>Đầy đủ</option><option>Cơ bản</option><option>Nhà trống</option>
                    </select>
                  </div>
                  <div className="col-md-3">
                    <label className="form-label fw-semibold">Nguồn hàng</label>
                    <select className="form-select" value={draftEditForm.source}
                      onChange={e => setDraftEditForm({ ...draftEditForm, source: e.target.value })}>
                      <option value="">— Chọn —</option>
                      <option>Chuyển nhượng</option><option>Dự án</option><option>Cá nhân</option>
                    </select>
                  </div>
                  <div className="col-md-3">
                    <label className="form-label fw-semibold">Pháp lý</label>
                    <select className="form-select" value={draftEditForm.legalStatus}
                      onChange={e => setDraftEditForm({ ...draftEditForm, legalStatus: e.target.value })}>
                      <option>Sổ đỏ</option><option>Sổ hồng riêng</option>
                      <option>Hợp đồng mua bán</option><option>Đang chờ sổ</option>
                    </select>
                  </div>
                  <div className="col-12">
                    <label className="form-label fw-semibold">Mô tả thêm</label>
                    <textarea className="form-control" rows={3} value={draftEditForm.description}
                      onChange={e => setDraftEditForm({ ...draftEditForm, description: e.target.value })}
                      placeholder="Mô tả thêm về tài sản (vị trí, ưu điểm...)"></textarea>
                  </div>
                  <div className="col-12">
                    <label className="form-label fw-semibold">
                      Ảnh minh họa tài sản <span className="text-danger">*</span>
                    </label>
                    <p className="small text-danger mb-2">
                      Bắt buộc ít nhất <strong>1 ảnh</strong> (JPG/PNG/WebP, tối đa 10MB/file) trước khi Gửi duyệt.
                      {countDraftImages(draftEditForm, draftExtraFiles) > 0 && (
                        <span className="text-success ms-1">
                          — Đã có {countDraftImages(draftEditForm, draftExtraFiles)} ảnh.
                        </span>
                      )}
                    </p>
                    {(draftEditForm.images || []).length > 0 && (
                      <div className="d-flex flex-wrap gap-2 mb-2">
                        {(draftEditForm.images || []).map((url, i) => (
                          <div key={`draft-saved-${i}`} className="position-relative">
                            <img src={url} alt="" className="rounded border" style={{ width: 88, height: 66, objectFit: 'cover' }} />
                            <button
                              type="button"
                              className="btn btn-sm btn-danger position-absolute top-0 end-0 p-0 lh-1"
                              style={{ fontSize: 10, transform: 'translate(25%,-25%)' }}
                              title="Xóa ảnh"
                              onClick={() =>
                                setDraftEditForm({
                                  ...draftEditForm,
                                  images: (draftEditForm.images || []).filter((_, j) => j !== i),
                                })
                              }
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {draftExtraFiles.length > 0 && (
                      <ul className="list-group list-group-flush small mb-2">
                        {draftExtraFiles.map((f, idx) => (
                          <li
                            key={`draft-new-${idx}-${f.name}`}
                            className="list-group-item d-flex justify-content-between align-items-center py-1 px-2"
                          >
                            <span className="text-truncate">
                              <i className="bi bi-image me-1 text-primary" />
                              {f.name}
                            </span>
                            <button
                              type="button"
                              className="btn btn-link btn-sm text-danger p-0"
                              onClick={() =>
                                setDraftExtraFiles((prev) => prev.filter((_, j) => j !== idx))
                              }
                            >
                              Xóa
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div
                      className="border border-2 border-dashed rounded p-3 text-center bg-light position-relative"
                      style={{ cursor: 'pointer' }}
                    >
                      <input
                        type="file"
                        multiple
                        accept=".jpg,.jpeg,.png,.webp,image/*"
                        className="position-absolute w-100 h-100 opacity-0 top-0 start-0"
                        style={{ cursor: 'pointer' }}
                        onChange={handleDraftExtraUpload}
                      />
                      <i className="bi bi-cloud-arrow-up fs-4 text-primary" />
                      <p className="mb-0 small fw-semibold mt-1">Thêm ảnh — click hoặc kéo thả</p>
                      <small className="text-muted">JPG, PNG, WebP · tối đa 10MB/file</small>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer border-0 d-flex justify-content-between">
                <button type="button" className="btn btn-outline-secondary"
                  onClick={() => {
                    setShowDraftModal(false);
                    setDraftTarget(null);
                    setDraftEditForm(null);
                    setDraftExtraFiles([]);
                  }}>
                  Hủy
                </button>
                <div className="d-flex gap-2">
                  <button type="button" className="btn btn-outline-warning" disabled={draftSubmitting}
                    onClick={() => handleCompleteDraft(false)}>
                    <i className="bi bi-floppy me-1"></i>Lưu nháp
                  </button>
                  <button type="button" className="btn btn-success fw-bold" disabled={draftSubmitting}
                    onClick={() => handleCompleteDraft(true)}>
                    {draftSubmitting ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-send-check me-1"></i>}
                    Gửi duyệt → Giám đốc POS
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showUpdateModal && updateTarget && updateForm && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 1050 }}>
          <div className="modal-dialog modal-xl modal-dialog-scrollable">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-primary text-white">
                <h5 className="modal-title fw-bold">
                  <i className="bi bi-columns-gap me-2"></i>Gửi yêu cầu cập nhật — {updateTarget.propertyCode || updateTarget.id}
                </h5>
                <button type="button" className="btn-close btn-close-white"
                  onClick={() => { setShowUpdateModal(false); setUpdateTarget(null); setUpdateForm(null); }} />
              </div>
              <div className="modal-body">
                <p className="small text-muted">
                  Bên trái: dữ liệu đang lưu. Bên phải: chỉnh sửa đề xuất. Sau khi gửi, GĐ POS duyệt mới ghi đè; từ chối thì dữ liệu giữ nguyên.
                </p>
                <div className="row g-3">
                  <div className="col-lg-6">
                    <div className="card h-100 border bg-light">
                      <div className="card-header py-2 fw-bold small">Đang có trên hệ thống</div>
                      <div className="card-body small">
                        <dl className="row mb-0">
                          <dt className="col-4 text-muted">Địa chỉ</dt><dd className="col-8">{updateTarget.address}</dd>
                          <dt className="col-4 text-muted">Loại</dt><dd className="col-8">{updateTarget.type} · {updateTarget.propertyType}</dd>
                          <dt className="col-4 text-muted">Giá</dt><dd className="col-8">{Number(updateTarget.price).toLocaleString('en-US')} {updateTarget.priceUnit}</dd>
                          <dt className="col-4 text-muted">Diện tích</dt><dd className="col-8">{updateTarget.area} m²</dd>
                          <dt className="col-4 text-muted">PN / PT</dt><dd className="col-8">{updateTarget.bedrooms} / {updateTarget.bathrooms}</dd>
                          <dt className="col-4 text-muted">Tầng</dt><dd className="col-8">{updateTarget.floor ?? '—'}</dd>
                          <dt className="col-4 text-muted">Hướng</dt><dd className="col-8">{updateTarget.direction || '—'}</dd>
                          <dt className="col-4 text-muted">Hiện trạng</dt><dd className="col-8">{updateTarget.condition || '—'}</dd>
                          <dt className="col-4 text-muted">Nguồn</dt><dd className="col-8">{updateTarget.source || '—'}</dd>
                          <dt className="col-4 text-muted">Nội thất</dt><dd className="col-8">{updateTarget.furniture || '—'}</dd>
                          <dt className="col-4 text-muted">Pháp lý</dt><dd className="col-8">{updateTarget.legalStatus || updateTarget.legal}</dd>
                          <dt className="col-4 text-muted">Mô tả</dt><dd className="col-8" style={{ whiteSpace: 'pre-wrap' }}>{updateTarget.description || '—'}</dd>
                        </dl>
                        <div className="mt-2 small text-muted">Ảnh hiện tại: {(updateTarget.images || []).length}</div>
                        <div className="d-flex flex-wrap gap-1 mt-1">
                          {(updateTarget.images || []).slice(0, 6).map((url, i) => (
                            <img key={i} src={url} alt="" className="rounded border" style={{ width: 72, height: 54, objectFit: 'cover' }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="col-lg-6">
                    <div className="card h-100 border border-primary">
                      <div className="card-header py-2 fw-bold small bg-primary bg-opacity-10">Thông tin cập nhật đề xuất</div>
                      <div className="card-body small">
                        <label className="form-label">Địa chỉ</label>
                        <textarea className="form-control form-control-sm mb-2" rows={2}
                          value={updateForm.address}
                          onChange={(e) => setUpdateForm({ ...updateForm, address: e.target.value })} />
                        <div className="row g-2 mb-2">
                          <div className="col-6">
                            <label className="form-label">Loại GD</label>
                            <select className="form-select form-select-sm" value={updateForm.type}
                              onChange={(e) => setUpdateForm({ ...updateForm, type: e.target.value })}>
                              <option>Bán</option><option>Thuê</option>
                            </select>
                          </div>
                          <div className="col-6">
                            <label className="form-label">Loại BĐS</label>
                            <select className="form-select form-select-sm" value={updateForm.propertyType}
                              onChange={(e) => setUpdateForm({ ...updateForm, propertyType: e.target.value })}>
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
                            <label className="form-label">Diện tích (m²)</label>
                            <input className="form-control form-control-sm" value={updateForm.area}
                              onChange={(e) => setUpdateForm({ ...updateForm, area: e.target.value.replace(/\D/g, '') })} />
                          </div>
                          <div className="col-6">
                            <label className="form-label">Giá</label>
                            <input className="form-control form-control-sm" value={updateForm.price}
                              onChange={(e) => {
                                let raw = e.target.value.replace(/,/g, '').replace(/\D/g, '');
                                if (raw === '') { setUpdateForm({ ...updateForm, price: '' }); return; }
                                setUpdateForm({ ...updateForm, price: parseInt(raw, 10).toLocaleString('en-US') });
                              }} />
                          </div>
                        </div>
                        <div className="row g-2 mb-2">
                          <div className="col-12">
                            <label className="form-label">Đơn vị giá</label>
                            <select className="form-select form-select-sm" value={updateForm.priceUnit}
                              onChange={(e) => setUpdateForm({ ...updateForm, priceUnit: e.target.value })}>
                              <option value="tỷ VNĐ">tỷ VNĐ</option>
                              <option value="triệu VNĐ">triệu VNĐ</option>
                              <option value="VNĐ">VNĐ</option>
                              <option value="VNĐ/tháng">VNĐ/tháng</option>
                              <option value="triệu VNĐ/tháng">triệu VNĐ/tháng</option>
                            </select>
                          </div>
                        </div>
                        <div className="row g-2 mb-2">
                          <div className="col-4">
                            <label className="form-label">PN</label>
                            <input type="number" className="form-control form-control-sm" min="0"
                              value={updateForm.bedrooms}
                              onChange={(e) => setUpdateForm({ ...updateForm, bedrooms: e.target.value })} />
                          </div>
                          <div className="col-4">
                            <label className="form-label">PT</label>
                            <input type="number" className="form-control form-control-sm" min="0"
                              value={updateForm.bathrooms}
                              onChange={(e) => setUpdateForm({ ...updateForm, bathrooms: e.target.value })} />
                          </div>
                          <div className="col-4">
                            <label className="form-label">Tầng</label>
                            <input type="number" className="form-control form-control-sm" min="0"
                              value={updateForm.floor}
                              onChange={(e) => setUpdateForm({ ...updateForm, floor: e.target.value })} />
                          </div>
                        </div>
                        <div className="row g-2 mb-2">
                          <div className="col-6">
                            <label className="form-label">Hướng</label>
                            <select className="form-select form-select-sm" value={updateForm.direction}
                              onChange={(e) => setUpdateForm({ ...updateForm, direction: e.target.value })}>
                              <option value="">—</option>
                              <option>Đông</option><option>Tây</option><option>Nam</option><option>Bắc</option>
                              <option>Đông Nam</option><option>Đông Bắc</option><option>Tây Nam</option><option>Tây Bắc</option>
                            </select>
                          </div>
                          <div className="col-6">
                            <label className="form-label">Hiện trạng</label>
                            <select className="form-select form-select-sm" value={updateForm.condition}
                              onChange={(e) => setUpdateForm({ ...updateForm, condition: e.target.value })}>
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
                            <select className="form-select form-select-sm" value={updateForm.source}
                              onChange={(e) => setUpdateForm({ ...updateForm, source: e.target.value })}>
                              <option value="">—</option>
                              <option>Chuyển nhượng</option>
                              <option>Dự án</option>
                              <option>Cá nhân</option>
                            </select>
                          </div>
                          <div className="col-6">
                            <label className="form-label">Nội thất</label>
                            <select className="form-select form-select-sm" value={updateForm.furniture}
                              onChange={(e) => setUpdateForm({ ...updateForm, furniture: e.target.value })}>
                              <option value="">—</option>
                              <option>Đầy đủ</option>
                              <option>Cơ bản</option>
                              <option>Nhà trống</option>
                            </select>
                          </div>
                        </div>
                        <label className="form-label">Pháp lý</label>
                        <select className="form-select form-select-sm mb-2" value={updateForm.legalStatus}
                          onChange={(e) => setUpdateForm({ ...updateForm, legalStatus: e.target.value })}>
                          <option>Sổ đỏ</option>
                          <option>Sổ hồng</option>
                          <option>Hợp đồng mua bán</option>
                          <option>Đang chờ sổ</option>
                        </select>
                        <label className="form-label">Mô tả</label>
                        <textarea className="form-control form-control-sm mb-2" rows={3} maxLength={500}
                          value={updateForm.description}
                          onChange={(e) => setUpdateForm({ ...updateForm, description: e.target.value })} />
                        <label className="form-label">Ảnh (giữ / xóa / thêm)</label>
                        <div className="d-flex flex-wrap gap-1 mb-2">
                          {(updateForm.images || []).map((url, i) => (
                            <div key={i} className="position-relative">
                              <img src={url} alt="" className="rounded border" style={{ width: 72, height: 54, objectFit: 'cover' }} />
                              <button type="button" className="btn btn-sm btn-danger position-absolute top-0 end-0 p-0 lh-1"
                                style={{ fontSize: 10, transform: 'translate(25%,-25%)' }}
                                onClick={() => setUpdateForm({
                                  ...updateForm,
                                  images: updateForm.images.filter((_, j) => j !== i),
                                })}>×</button>
                            </div>
                          ))}
                        </div>
                        <input type="file" className="form-control form-control-sm mb-2" accept="image/*" multiple
                          onChange={handleUpdateExtraUpload} />
                        <label className="form-label">Ghi chú gửi GĐ POS (tuỳ chọn)</label>
                        <textarea className="form-control form-control-sm mb-0" rows={2} value={updateNote}
                          onChange={(e) => setUpdateNote(e.target.value)} placeholder="Ví dụ: đã cập nhật theo chỉnh sửa chủ nhà…" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer bg-light">
                <button type="button" className="btn btn-secondary"
                  onClick={() => { setShowUpdateModal(false); setUpdateTarget(null); setUpdateForm(null); setUpdateExtraFiles([]); }}>
                  Hủy
                </button>
                <button type="button" className="btn btn-primary fw-bold" onClick={handleSubmitUpdateRequest}>
                  <i className="bi bi-send-check me-1"></i>Gửi phê duyệt cập nhật
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <AppToast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}

export default Feature2_Create;
