import React, { useState, useEffect, useMemo } from 'react';
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
import {
  API,
  readSessionUser,
  postAuditLog,
  buildLogAction,
  RESUBMIT_NOTE_MIN,
  propertySequenceNumber,
  listingSequenceNumber,
  formatListingId,
  buildListingTitleFromProperty,
  buildListingDescriptionFromProperty,
  mergePreviewImageUrls,
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

function newMediaClientKey() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Tìm theo chuỗi con trên mọi trường hiển thị / kỹ thuật phổ biến của tài sản. */
function propertyMatchesOwnerSearch(property, rawQuery) {
  const q = String(rawQuery || '').trim().toLowerCase();
  if (!q) return true;
  const parts = [
    property.id,
    property.propertyCode,
    property.address,
    property.district,
    property.ward,
    property.type,
    property.propertyType,
    property.level1_status,
    property.level2_status,
    property.statusLv1,
    property.statusLv2,
    property.pos_name,
    property.manager_name,
    property.pos_manager,
    property.createdBy,
    property.price_display,
    property.description,
    property.rejection_reason,
    property.rejected_reason,
    property.update_request_status,
    property.legalStatus,
    property.legal,
    property.condition,
    property.source,
    property.furniture,
    property.direction,
    property.futureWard,
    String(property.price ?? ''),
    String(property.area ?? ''),
    String(property.bedrooms ?? ''),
    String(property.bathrooms ?? ''),
    String(property.floor ?? ''),
  ].filter((x) => x != null && String(x).trim() !== '');
  const hay = parts.join(' ').toLowerCase();
  return hay.indexOf(q) >= 0;
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
    let rawValue = e.target.value.replace(/,/g, '');
    if (/[^\d]/.test(rawValue) && rawValue !== '') alert("❌ Lỗi: Giá trị chỉ được phép chứa số nguyên.");
    rawValue = rawValue.replace(/\D/g, '');
    if (rawValue === '') { setFormData({ ...formData, price: '' }); return; }
    const numValue = parseInt(rawValue, 10);
    if (numValue <= 0) { alert("❌ Lỗi: Giá trị số tiền phải lớn hơn 0."); setFormData({ ...formData, price: '' }); return; }
    setFormData({ ...formData, price: numValue.toLocaleString('en-US') });
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

  const userStr0 = localStorage.getItem('user');
  const currentUserObj = userStr0 ? JSON.parse(userStr0) : {};
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

  const myPropsListBase = useMemo(
    () => (USER_ID ? properties.filter((p) => p.createdBy_id === USER_ID) : properties),
    [properties, USER_ID],
  );

  const myPropsList = useMemo(
    () => myPropsListBase.filter((p) => propertyMatchesOwnerSearch(p, myPropsSearch)),
    [myPropsListBase, myPropsSearch],
  );

  const myRejectedMktListings = useMemo(() => {
    if (!USER_ID) return [];
    const name = currentUserObj.name || '';
    return listings.filter(
      (l) =>
        l &&
        l.listing_status === 'Từ chối' &&
        (l.createdBy_id === USER_ID || (name && l.createdBy === name)),
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
    try {
      await axios.patch(`http://localhost:5000/properties/${encodeURIComponent(upTarget.id)}`, {
        ...meta,
        pending_update_payload: pendingToSend,
      });
      await logAudit('Gửi yêu cầu phê duyệt cập nhật TS (Mobile)', upTarget.id);
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
        listingId: listing.id,
        userName: u.name || u.email || 'User',
        userId: u.id || '',
        propertyId: listing.property_id,
        oldStatus: 'Từ chối',
        newStatus: 'Chờ duyệt chỉnh sửa',
        detail: mktResubmitNote.trim(),
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

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const [resP, resL] = await Promise.all([
      axios.get('http://localhost:5000/properties'),
      axios.get('http://localhost:5000/listings'),
    ]);
    setProperties(resP.data);
    setListings(resL.data);
  };

  const logAudit = async (action, entityId) => {
    await axios.post('http://localhost:5000/logs', {
      timestamp: new Date().toISOString(), action, entityId, user: 'Đầu chủ (Mobile)'
    });
  };

  const fullAddress = [address.houseNumber, address.street && `đường ${address.street}`,
    address.ward, address.district, address.province].filter(Boolean).join(', ');

  const handleDupCheck = async () => {
    if (formData.type !== 'Bán' || !address.houseNumber || !address.street) return;
    const res = await axios.get('http://localhost:5000/properties');
    const q = `${address.houseNumber} ${address.street}`.toLowerCase();
    const dups = res.data.filter(p => p.type === 'Bán' && p.address?.toLowerCase().includes(q));
    if (dups.length > 0) { setDupAlert('dup'); setDupInfo(dups[0]); }
    else { setDupAlert('clear'); }
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
      const res = await axios.get('http://localhost:5000/properties');
      const maxId = res.data.reduce((max, p) => {
        const n = propertySequenceNumber(p.id);
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

      await axios.post('http://localhost:5000/properties', {
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
      await logAudit('Tạo tài sản mới (Mobile)', newId);
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
      const n = listingSequenceNumber(l.id);
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
    setListingComposeSubmitting(true);
    try {
      const newLTId = await nextLTIdForMobile();
      const now = new Date().toISOString();
      await fetch(`${API}/listings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newLTId,
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
        }),
      });
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
    if (!unlistReason) { alert('❌ Bắt buộc chọn lý do gỡ tin! (BR-005)'); return; }
    const p = unlistTarget;
    await axios.put(`http://localhost:5000/properties/${p.id}`, { ...p, statusLv2: `Yêu cầu gỡ: ${unlistReason}` });
    await logAudit(`Yêu cầu gỡ tin: ${unlistReason}`, p.id);
    alert('✅ Đã gửi yêu cầu gỡ tin!');
    setUnlistTarget(null); setUnlistReason('');
    fetchData();
  };

  const handleRemoveSource = async (p) => {
    const lv2 = p.level2_status || p.statusLv2;
    if (lv2 === 'Đang niêm yết') {
      alert('❌ Tài sản đang niêm yết! Phải gỡ tin trước (BR-010)');
      return;
    }
    if (!window.confirm('⚠️ Yêu cầu Gỡ Nguồn sẽ gửi đến GĐ POS duyệt. Xác nhận?')) return;
    await axios.put(`http://localhost:5000/properties/${p.id}`, { ...p, statusLv1: 'Chờ duyệt gỡ nguồn', level1_status: 'Chờ duyệt gỡ nguồn' });
    await logAudit('Yêu cầu gỡ nguồn (Mobile F8)', p.id);
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
    await axios.patch(`http://localhost:5000/properties/${reopenRejected.id}`, {
      description: rejectedDesc,
      images: merged,
      level1_status: 'Chờ POS duyệt',
      statusLv1: 'Chờ POS duyệt',
      rejection_reason: null,
      resubmit_property_note: rejectedNote.trim(),
      updatedAt: new Date().toISOString(),
    });
    await logAudit('Đầu chủ chỉnh sửa TS sau từ chối POS & gửi lại duyệt', reopenRejected.id);
    setReopenRejected(null);
    setRejectedExtraFiles([]);
    fetchData();
    alert('✅ Đã gửi lại GĐ POS duyệt.');
  };

  const statusBadge = (lv1, lv2) => {
    const colorMap = {
      'Chờ POS duyệt': 'warning',
      'Chờ duyệt đảm bảo': 'warning',
      'Được duyệt': 'success',
      'Được đảm bảo': 'success',
      'Bị từ chối': 'danger',
      'Từ chối': 'danger',
      'Chờ KH ký': 'info',
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
        <span className="badge bg-primary">F2 · F4 · F6 · F8</span>
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
          <span className="badge bg-white text-primary ms-2">{myPropsListBase.length}</span>
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
                <option>Đất nền</option><option>Biệt thự</option><option>Shophouse</option>
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
                    placeholder="VD: 1,000,000" value={formData.price} onChange={handlePriceChange} />
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
            <button className="btn btn-sm btn-outline-primary" onClick={fetchData}>
              <i className="bi bi-arrow-clockwise"></i>
            </button>
          </div>
          <div className="mb-3">
            <label className="form-label small text-muted mb-1">Tìm kiếm</label>
            <div className="input-group input-group-sm">
              <span className="input-group-text"><i className="bi bi-search"></i></span>
              <input
                type="search"
                className="form-control"
                placeholder="Mã, địa chỉ, loại, trạng thái, POS, giá, mô tả…"
                value={myPropsSearch}
                onChange={(e) => setMyPropsSearch(e.target.value)}
                autoComplete="off"
              />
            </div>
            {myPropsSearch.trim() && (
              <div className="form-text small">
                Hiển thị {myPropsList.length} / {myPropsListBase.length} tài sản
              </div>
            )}
          </div>

          {myRejectedMktListings.length > 0 && (
            <div className="card border-warning border-2 mb-3 p-3">
              <h6 className="fw-bold mb-2">
                <i className="bi bi-megaphone me-1 text-warning"></i>Tin đăng MKT từ chối — gửi lại
              </h6>
              {myRejectedMktListings.map((l) => (
                <div key={l.id} className="border rounded p-2 mb-2 small bg-light">
                  <div className="fw-bold text-primary">{formatListingId(l.id)}</div>
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

          {myPropsListBase.length === 0 && <div className="text-center text-muted py-5">Chưa có tài sản nào</div>}
          {myPropsListBase.length > 0 && myPropsList.length === 0 && (
            <div className="text-center text-muted py-4">Không có tài sản khớp tìm kiếm.</div>
          )}
          {myPropsList
            .slice()
            .reverse()
            .map((p) => {
              const lv1 = p.level1_status || p.statusLv1 || '—';
              const lv2 = p.level2_status || p.statusLv2 || '—';
              return (
                <div key={p.id} className="card shadow-sm border-0 mb-3 p-3">
                  <div className="d-flex justify-content-between mb-2">
                    <span className="fw-bold text-primary">{p.propertyCode || p.id}</span>
                    {statusBadge(lv1, lv2)}
                  </div>
                  <div className="small text-muted mb-1">{p.address}</div>
                  {p.futureWard && (
                    <div className="small text-info mb-1">
                      <i className="bi bi-map me-1"></i>P.mới: {p.futureWard}
                    </div>
                  )}
                  <div className="small text-muted mb-2">
                    {p.propertyType} • {Number(p.area).toLocaleString('en-US')}m² • {Number(p.price).toLocaleString('en-US')}{' '}
                    {p.priceUnit || 'VNĐ'}
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
                    {lv1 === 'Bị từ chối' && p.createdBy_id === USER_ID && (
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
                        <i className="bi bi-x-octagon me-1"></i>Yêu cầu Gỡ Nguồn (F8 · BR-010)
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
                <h6 className="modal-title fw-bold m-0">Cập nhật tài sản — {upTarget.id}</h6>
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
                            let raw = e.target.value.replace(/,/g, '').replace(/\D/g, '');
                            if (raw === '') { setUpForm({ ...upForm, price: '' }); return; }
                            setUpForm({ ...upForm, price: parseInt(raw, 10).toLocaleString('en-US') });
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
