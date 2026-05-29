import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { sameUserId } from '../utils/userId';
import {
  API,
  readSessionUser,
  posScopedProperty,
  postAuditLog,
  buildLogAction,
  AUDIT_ACTION_TYPE,
  RESUBMIT_NOTE_MIN,
  formatListingId,
  listingSequenceNumber,
  buildListingTitleFromProperty,
  buildListingDescriptionFromProperty,
  buildListingCopyFromProperty,
  mergePreviewImageUrls,
  formatPropertyId,
  confirmDuplicateListingWarningAsync,
  listingRequestHeaders,
  resolveDuplicateListing409,
  SESSION_CHANGED_EVENT,
} from '../utils/listingWorkflow';
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  readFileAsDataURL,
  isHttpUrl,
  fetchMediaByListing,
  deleteMediaRows,
  persistMediaItems,
  splitUrls,
} from '../utils/mediaLibraryApi';
import ListingWebsitePreviewModal from '../components/ListingWebsitePreviewModal';
import { formatPropertyPriceDisplay } from '../utils/permissions';

const LV1_COLOR = {
  'Được duyệt': 'success',
  'Được đảm bảo': 'warning',
  'Chờ POS duyệt': 'secondary',
  'Bị từ chối': 'danger',
  'Đã gỡ nguồn': 'dark',
};
const LV2_COLOR = {
  'Chưa niêm yết': 'secondary',
  'Đang niêm yết': 'success',
  'Thẩm định phí': 'info',
  'Đã gỡ': 'dark',
  'Chờ chỉnh sửa': 'warning',
  'Chờ duyệt chỉnh sửa': 'info',
};

/** json-server / proxy có thể trả `{ data: [...] }` thay vì mảng thuần. */
function normalizeJsonList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

/** Tương phản badge — đồng bộ F9/F4 (`warning` / `light`). */
function statusBadgeClass(bgKey) {
  const k = bgKey || 'secondary';
  if (k === 'light') return 'badge bg-light text-dark border';
  if (k === 'warning') return 'badge bg-warning text-dark';
  return `badge bg-${k}`;
}

/** Một dòng ảnh/video trong form (clientKey bất biến trong phiên; mediaLibId khi đã lưu DB) */
function newClientKey() {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function MediaPreviewCarousel({ items, slide, setSlide }) {
  const images = items.filter((x) => x.kind === 'image');
  const videos = items.filter((x) => x.kind === 'video');
  const main = images[slide] || images[0];
  return (
    <div className="mb-4">
      <div className="fw-semibold mb-2">Ảnh & video (xem trước)</div>
      {images.length === 0 && videos.length === 0 && (
        <div className="rounded-3 border bg-light p-4 text-center text-muted small">Chưa có ảnh/video. Thêm ở bước soạn tin.</div>
      )}
      {main && (
        <div className="position-relative rounded-3 overflow-hidden border bg-dark" style={{ minHeight: 220 }}>
          <img src={main.url} alt="" className="w-100 d-block" style={{ maxHeight: 360, objectFit: 'contain' }} />
          {images.length > 1 && (
            <>
              <button
                type="button"
                className="btn btn-light btn-sm position-absolute top-50 start-0 translate-middle-y ms-2"
                onClick={() => setSlide((s) => (s - 1 + images.length) % images.length)}
              >
                ‹
              </button>
              <button
                type="button"
                className="btn btn-light btn-sm position-absolute top-50 end-0 translate-middle-y me-2"
                onClick={() => setSlide((s) => (s + 1) % images.length)}
              >
                ›
              </button>
              <div className="position-absolute bottom-0 start-0 w-100 py-2 px-2 text-white small text-center" style={{ background: 'linear-gradient(transparent,rgba(0,0,0,.75))' }}>
                Ảnh {Math.min(slide + 1, images.length)} / {images.length}
              </div>
            </>
          )}
        </div>
      )}
      {images.length > 1 && (
        <div className="d-flex gap-2 flex-wrap mt-2">
          {images.map((im, i) => (
            <button
              key={im.clientKey}
              type="button"
              className={`p-0 border-2 rounded overflow-hidden bg-white ${i === slide ? 'border-primary' : 'border-transparent'}`}
              style={{ width: 72, height: 54 }}
              onClick={() => setSlide(i)}
            >
              <img src={im.url} alt="" className="w-100 h-100" style={{ objectFit: 'cover' }} />
            </button>
          ))}
        </div>
      )}
      {videos.length > 0 && (
        <div className="mt-3">
          <div className="small fw-semibold text-muted mb-2">Video</div>
          <div className="row g-2">
            {videos.map((v) => (
              <div key={v.clientKey} className="col-md-6">
                <div className="border rounded-3 overflow-hidden bg-black">
                  <video src={v.url} controls className="w-100" style={{ maxHeight: 240 }} playsInline />
                  <div className="px-2 py-1 small text-white-50 text-truncate bg-dark">{v.fileName}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MediaEditorBlock({
  localMedia,
  setLocalMedia,
  imageUrlInput,
  setImageUrlInput,
  videoUrlInput,
  setVideoUrlInput,
  showToast,
  disabled,
}) {
  const fileInputRef = useRef(null);
  const dragDepth = useRef(0);
  const [isOver, setIsOver] = useState(false);

  const ingestFiles = useCallback(
    async (fileList) => {
      const files = Array.from(fileList || []);
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          try {
            const url = await readFileAsDataURL(file, MAX_IMAGE_BYTES);
            setLocalMedia((prev) => [
              ...prev,
              {
                clientKey: newClientKey(),
                kind: 'image',
                url,
                fileName: file.name,
                mimeType: file.type,
                fileSize: file.size,
                source: 'upload',
              },
            ]);
          } catch (err) {
            showToast(err.message || `Không tải được ảnh: ${file.name}`, 'danger');
          }
        } else if (file.type.startsWith('video/')) {
          try {
            const url = await readFileAsDataURL(file, MAX_VIDEO_BYTES);
            setLocalMedia((prev) => [
              ...prev,
              {
                clientKey: newClientKey(),
                kind: 'video',
                url,
                fileName: file.name,
                mimeType: file.type,
                fileSize: file.size,
                source: 'upload',
              },
            ]);
          } catch (err) {
            showToast(err.message || `Không tải được video: ${file.name}`, 'danger');
          }
        } else {
          showToast(`Bỏ qua (chỉ nhận ảnh/video): ${file.name}`, 'warning');
        }
      }
    },
    [setLocalMedia, showToast],
  );

  const openFilePicker = () => {
    if (!disabled) fileInputRef.current?.click();
  };

  const onFileInputChange = (e) => {
    ingestFiles(e.target.files);
    e.target.value = '';
  };

  const addImageUrls = () => {
    const urls = splitUrls(imageUrlInput).filter(isHttpUrl);
    if (!urls.length) {
      showToast('Nhập ít nhất một URL ảnh hợp lệ (http/https).', 'danger');
      return;
    }
    setLocalMedia((prev) => [
      ...prev,
      ...urls.map((url) => ({
        clientKey: newClientKey(),
        kind: 'image',
        url,
        fileName: url.split('/').pop() || 'image',
        mimeType: 'image/url',
        fileSize: null,
        source: 'url',
      })),
    ]);
    setImageUrlInput('');
    showToast(`Đã thêm ${urls.length} ảnh từ URL.`, 'success');
  };

  const addVideoUrls = () => {
    const urls = splitUrls(videoUrlInput).filter(isHttpUrl);
    if (!urls.length) {
      showToast('Nhập ít nhất một URL video hợp lệ (http/https).', 'danger');
      return;
    }
    setLocalMedia((prev) => [
      ...prev,
      ...urls.map((url) => ({
        clientKey: newClientKey(),
        kind: 'video',
        url,
        fileName: url.split('/').pop() || 'video',
        mimeType: 'video/url',
        fileSize: null,
        source: 'url',
      })),
    ]);
    setVideoUrlInput('');
    showToast(`Đã thêm ${urls.length} video từ URL.`, 'success');
  };

  const remove = async (item) => {
    if (item.mediaLibId) {
      try {
        await fetch(`${API}/mediaLibrary/${item.mediaLibId}`, { method: 'DELETE' });
      } catch {
        /* ignore */
      }
    }
    setLocalMedia((prev) => prev.filter((x) => x.clientKey !== item.clientKey));
  };

  return (
    <div className="mb-4 p-3 rounded-3 border bg-white">
      <div className="fw-semibold mb-2">
        <i className="bi bi-images me-2 text-primary" />
        Ảnh & video → Library Media
      </div>
      <p className="small text-muted mb-3">
        Kéo thả hoặc đính kèm file. Ảnh tối đa ~{Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB; video ~{Math.round(MAX_VIDEO_BYTES / 1024 / 1024)}MB (demo lưu qua
        Library). File lớn hơn dùng URL bên dưới.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        className="d-none"
        accept="image/*,video/*"
        multiple
        disabled={disabled}
        onChange={onFileInputChange}
      />

      <div
        className={`rounded-3 border border-2 border-dashed p-4 text-center mb-3 position-relative ${disabled ? 'opacity-50' : 'cursor-pointer'} ${
          isOver ? 'border-primary bg-primary bg-opacity-10' : 'border-secondary'
        }`}
        style={{ minHeight: 160 }}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (disabled) return;
          dragDepth.current += 1;
          setIsOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (disabled) return;
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) {
            dragDepth.current = 0;
            setIsOver(false);
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (disabled) return;
          dragDepth.current = 0;
          setIsOver(false);
          ingestFiles(e.dataTransfer.files);
        }}
        onClick={() => openFilePicker()}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openFilePicker();
          }
        }}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Kéo thả hoặc bấm để chọn ảnh và video"
      >
        <i className="bi bi-cloud-arrow-up display-4 text-primary d-block mb-2" />
        <div className="fw-semibold text-dark">Kéo thả ảnh hoặc video vào đây</div>
        <div className="small text-muted mb-3">hoặc bấm vùng này để chọn file từ máy</div>
        <button
          type="button"
          className="btn btn-primary btn-sm px-4"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            openFilePicker();
          }}
        >
          <i className="bi bi-paperclip me-1" />
          Đính kèm
        </button>
      </div>

      {localMedia.length > 0 && (
        <div className="mb-3">
          <div className="small fw-semibold text-muted mb-2">Đã chọn ({localMedia.length}) — bấm × để gỡ</div>
          <div className="d-flex flex-wrap gap-2">
            {localMedia.map((m) => (
              <div key={m.clientKey} className="position-relative border rounded overflow-hidden bg-light" style={{ width: 100, height: 76 }}>
                {m.kind === 'image' ? (
                  <img src={m.url} alt="" className="w-100 h-100" style={{ objectFit: 'cover' }} />
                ) : (
                  <div className="w-100 h-100 d-flex align-items-center justify-content-center small bg-dark text-white">
                    <i className="bi bi-film fs-4" />
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-danger btn-sm position-absolute top-0 end-0 m-1 py-0 px-1"
                  style={{ fontSize: 11 }}
                  disabled={disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(m);
                  }}
                  title="Gỡ khỏi tin"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <details className="small">
        <summary className="fw-semibold text-primary" style={{ cursor: 'pointer' }}>
          Thêm từ URL (tuỳ chọn)
        </summary>
        <div className="row g-2 mt-2 pt-2 border-top">
          <div className="col-md-6">
            <label className="form-label small">URL ảnh (mỗi dòng / phẩy)</label>
            <textarea
              className="form-control form-control-sm"
              rows={2}
              disabled={disabled}
              placeholder="https://…/a.jpg"
              value={imageUrlInput}
              onChange={(e) => setImageUrlInput(e.target.value)}
            />
            <button type="button" className="btn btn-sm btn-outline-primary mt-1" disabled={disabled} onClick={addImageUrls}>
              Thêm ảnh URL
            </button>
          </div>
          <div className="col-md-6">
            <label className="form-label small">URL video</label>
            <textarea
              className="form-control form-control-sm"
              rows={2}
              disabled={disabled}
              placeholder="https://…/clip.mp4"
              value={videoUrlInput}
              onChange={(e) => setVideoUrlInput(e.target.value)}
            />
            <button type="button" className="btn btn-sm btn-outline-primary mt-1" disabled={disabled} onClick={addVideoUrls}>
              Thêm video URL
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}

export default function Feature4_CreateListing() {
  const [user, setUser] = useState(() => readSessionUser());
  const [properties, setProperties] = useState([]);
  const [listings, setListings] = useState([]);
  const [mediaLibraryAll, setMediaLibraryAll] = useState([]);
  const [workspaceTab, setWorkspaceTab] = useState('compose'); // compose | mine | library
  const [filterType, setFilterType] = useState('all');
  const [filterCreator, setFilterCreator] = useState(() => readSessionUser().name || 'all');
  const [filterTab, setFilterTab] = useState('eligible');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', contact_phone: '' });
  const [localMedia, setLocalMedia] = useState([]);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [previewSlide, setPreviewSlide] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [step, setStep] = useState('select');
  const [resubmitTarget, setResubmitTarget] = useState(null);
  const [resubmitNote, setResubmitNote] = useState('');
  const [showResubmitWebsitePreview, setShowResubmitWebsitePreview] = useState(false);
  const [createdListingId, setCreatedListingId] = useState('');

  useEffect(() => {
    const bump = () => setUser(readSessionUser());
    window.addEventListener('storage', bump);
    window.addEventListener(SESSION_CHANGED_EVENT, bump);
    return () => {
      window.removeEventListener('storage', bump);
      window.removeEventListener(SESSION_CHANGED_EVENT, bump);
    };
  }, []);

  const loadData = useCallback(async () => {
    const [pRaw, lRaw] = await Promise.all([
      fetch(`${API}/properties`).then((r) => r.json()),
      fetch(`${API}/listings`).then((r) => r.json()),
    ]);
    setProperties(normalizeJsonList(pRaw));
    setListings(normalizeJsonList(lRaw));
  }, []);

  const loadMediaLibrary = useCallback(async () => {
    const rows = await fetch(`${API}/mediaLibrary`).then((r) => r.json());
    setMediaLibraryAll(normalizeJsonList(rows));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (workspaceTab === 'library') loadMediaLibrary();
  }, [workspaceTab, loadMediaLibrary]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const posProps = useMemo(
    () => properties.filter((p) => posScopedProperty(p, user)),
    [properties, user],
  );

  const creators = useMemo(() => [...new Set(posProps.map((p) => p.createdBy).filter(Boolean))], [posProps]);

  const eligible = useMemo(
    () =>
      posProps.filter((p) => {
        const s1 = p.level1_status || p.statusLv1;
        const s2 = p.level2_status || p.statusLv2;
        return (
          (s1 === 'Được duyệt' || s1 === 'Được đảm bảo') &&
          s2 === 'Chưa niêm yết' &&
          (filterType === 'all' || p.type === filterType) &&
          (filterCreator === 'all' || p.createdBy === filterCreator) &&
          (search === '' ||
            p.address?.toLowerCase().includes(search.toLowerCase()) ||
            String(p.id).toLowerCase().includes(search.toLowerCase()))
        );
      }),
    [posProps, filterType, filterCreator, search],
  );

  const allProps = useMemo(
    () =>
      posProps.filter((p) => {
        return (
          (filterType === 'all' || p.type === filterType) &&
          (filterCreator === 'all' || p.createdBy === filterCreator) &&
          (search === '' ||
            p.address?.toLowerCase().includes(search.toLowerCase()) ||
            String(p.id).toLowerCase().includes(search.toLowerCase()))
        );
      }),
    [posProps, filterType, filterCreator, search],
  );

  const displayList = filterTab === 'eligible' ? eligible : allProps;

  const myListings = useMemo(() => {
    return listings.filter((l) => {
      if (user.role === 'admin') return true;
      if (l.createdBy_id && user.id) return sameUserId(l.createdBy_id, user.id);
      return l.createdBy === user.name;
    });
  }, [listings, user]);

  const scopedMediaLibrary = useMemo(() => {
    if (user.role === 'admin') return mediaLibraryAll;
    const myLt = new Set(myListings.map((l) => l.id));
    return mediaLibraryAll.filter((m) => myLt.has(m.listingId));
  }, [mediaLibraryAll, myListings, user.role]);

  const pendingMktCount = useMemo(
    () => listings.filter((l) => l.listing_status === 'Chờ duyệt' || l.listing_status === 'Chờ duyệt chỉnh sửa').length,
    [listings],
  );

  const resubmitPreviewImageUrls = useMemo(
    () => localMedia.filter((m) => m.kind === 'image').map((m) => m.url).filter(Boolean),
    [localMedia],
  );

  const listingActor = useMemo(() => {
    const rawPid = user.pos_id;
    const posIdNum = rawPid === '' || rawPid == null ? null : Number(rawPid);
    return {
      role: user.role,
      posId: Number.isNaN(posIdNum) ? null : posIdNum,
      posName: user.pos_name || '',
    };
  }, [user.role, user.pos_id, user.pos_name]);

  const displayPrice = (p) =>
    p ? formatPropertyPriceDisplay(listingActor.role, p, listingActor.posId, listingActor.posName) : '—';

  const autoFill = (prop) => {
    const copy = buildListingCopyFromProperty(prop, listingActor);
    setForm({
      title: copy.title,
      description: copy.description,
      contact_phone: '',
    });
    setLocalMedia([]);
    setImageUrlInput('');
    setVideoUrlInput('');
    setPreviewSlide(0);
    setSelected(prop);
    setStep('form');
  };

  const nextLTId = async () => {
    const raw = await fetch(`${API}/listings`).then((r) => r.json());
    const list = normalizeJsonList(raw);
    let maxId = 0;
    for (const l of list) {
      const idToCheck = l.listingCode || l.id;
      const n = listingSequenceNumber(idToCheck);
      if (n != null) maxId = Math.max(maxId, n);
    }
    return formatListingId(String(maxId + 1));
  };

  const syncListingMediaFields = async (listingId, propertyId, u, mediaRows) => {
    const items = mediaRows.map((m) => ({
      kind: m.kind,
      url: m.url,
      fileName: m.fileName,
      mimeType: m.mimeType,
      fileSize: m.fileSize,
      source: m.source || 'upload',
    }));
    const saved = await persistMediaItems({
      listingId,
      propertyId,
      user: u,
      items,
    });
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

  const handleSubmitNew = async () => {
    if (!form.title.trim() || !form.description.trim() || !form.contact_phone.trim()) {
      showToast('Vui lòng điền đầy đủ tiêu đề, mô tả và SĐT liên hệ.', 'danger');
      return;
    }
    
    const u = readSessionUser();
    const dupConfirm = await confirmDuplicateListingWarningAsync({
      listings,
      propertyRef: selected.id,
      propertyCode: selected.propertyCode || selected.id,
      actionPrompt:
        'Bạn có chắc chắn muốn GỬI DUYỆT thêm tin đăng cho tài sản này không? (Chọn OK để tiếp tục.)',
      audit: {
        userName: u.name || u.email || 'Sales',
        userId: u.id || '',
        propertyId: selected.id,
        screen: 'F4',
        action: 'LISTING_SUBMIT',
      },
    });
    if (!dupConfirm.ok) return;

    setSubmitting(true);
    try {
      const rawId = await nextLTId();
      const newLTId = formatListingId(rawId);
      const now = new Date().toISOString();
      const postBody = JSON.stringify({
          id: newLTId,
          listingCode: newLTId,
          property_id: selected.id,
          title: form.title.trim(),
          description: form.description.trim(),
          contact_phone: form.contact_phone.trim(),
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
            propertyRef: selected.id,
            propertyCode: selected.propertyCode || selected.id,
            actionPrompt:
              'Bạn có chắc chắn muốn GỬI DUYỆT thêm tin đăng cho tài sản này không? (Chọn OK để tiếp tục.)',
            audit: {
              userName: u.name || u.email || 'Sales',
              userId: u.id || '',
              propertyId: selected.id,
              listingId: newLTId,
              screen: 'F4',
              action: 'LISTING_SUBMIT',
            },
          },
        );
        if (retried === null) {
          setSubmitting(false);
          return;
        }
        res = retried;
      }
      if (!res.ok) throw new Error(`POST listings ${res.status}`);
      if (localMedia.length) {
        const safeMedia = localMedia.map((m, i) => {
          if (m.url && m.url.startsWith('data:')) {
            return { ...m, url: `https://picsum.photos/seed/ihz-listing-${Date.now()}-${i}/1200/800` };
          }
          return m;
        });
        await syncListingMediaFields(newLTId, selected.id, u, safeMedia);
      }
      const patchRes = await fetch(`${API}/properties/${encodeURIComponent(selected.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level2_status: 'Chờ MKT duyệt',
          statusLv2: 'Chờ MKT duyệt',
          updatedAt: now,
        }),
      });
      if (!patchRes.ok) throw new Error(`PATCH property ${patchRes.status}`);
      await postAuditLog({
        actionText: buildLogAction('Tạo & gửi duyệt bài đăng', newLTId, `TS ${selected.id}`),
        actionType: AUDIT_ACTION_TYPE.LISTING_SUBMIT_FOR_REVIEW,
        listingId: newLTId,
        userName: u.name || u.email || 'User',
        userId: u.id || '',
        propertyId: selected.id,
        oldStatus: '—',
        newStatus: 'Chờ duyệt',
        detail: `Tiêu đề: ${form.title.slice(0, 80)}${form.title.length > 80 ? '…' : ''} · Media: ${localMedia.length}`,
      });
      setCreatedListingId(newLTId);
      setSubmitting(false);
      setStep('success');
      loadData();
      if (workspaceTab === 'library') loadMediaLibrary();
    } catch {
      setSubmitting(false);
      showToast('Lỗi khi gửi bài đăng.', 'danger');
    }
  };

  const openResubmit = async (listing) => {
    const prop = properties.find((p) => p.id === listing.property_id);
    setResubmitTarget({ listing, property: prop });
    const copy = prop ? buildListingCopyFromProperty(prop, listingActor) : { title: '', description: '' };
    setForm({
      title: copy.title || listing.title || '',
      description: copy.description,
      contact_phone: (listing.contact_phone || '').trim(),
    });
    setResubmitNote('');
    setShowResubmitWebsitePreview(false);
    setImageUrlInput('');
    setVideoUrlInput('');
    setPreviewSlide(0);
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
        clientKey: `resubmit-seed-${i}`,
        kind: 'image',
        url,
        fileName: `anh-thuc-te-${i + 1}.jpg`,
        mimeType: 'image/jpeg',
        fileSize: null,
        source: 'url',
      }));
    }
    setLocalMedia(media);
  };

  const handleResubmit = async () => {
    if (!resubmitTarget) return;
    if (resubmitNote.trim().length < RESUBMIT_NOTE_MIN) {
      showToast(`Ghi chú gửi lại bắt buộc tối thiểu ${RESUBMIT_NOTE_MIN} ký tự (mô tả phần đã chỉnh theo phản hồi MKT).`, 'danger');
      return;
    }
    if (!form.title.trim() || !form.description.trim() || !form.contact_phone.trim()) {
      showToast('Tiêu đề, mô tả và SĐT không được để trống.', 'danger');
      return;
    }
    const u = readSessionUser();
    const { listing } = resubmitTarget;
    const now = new Date().toISOString();
    setSubmitting(true);
    try {
      const existing = await fetchMediaByListing(listing.id);
      await deleteMediaRows(existing);
      const saved = await persistMediaItems({
        listingId: listing.id,
        propertyId: listing.property_id,
        user: u,
        items: localMedia.map((m, i) => {
          let safeUrl = m.url;
          if (safeUrl && safeUrl.startsWith('data:')) {
            safeUrl = `https://picsum.photos/seed/ihz-listing-resubmit-${Date.now()}-${i}/1200/800`;
          }
          return {
            kind: m.kind,
            url: safeUrl,
            fileName: m.fileName,
            mimeType: m.mimeType,
            fileSize: m.fileSize,
            source: m.source || 'upload',
          };
        }),
      });
      const imageUrls = saved.filter((s) => s.kind === 'image').map((s) => s.url);
      const videoUrls = saved.filter((s) => s.kind === 'video').map((s) => s.url);
      const mediaLibraryIds = saved.map((s) => s.id).filter(Boolean);

      await fetch(`${API}/listings/${listing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          contact_phone: form.contact_phone.trim(),
          listing_status: 'Chờ duyệt chỉnh sửa',
          prev_rejection_note: listing.rejection_note || listing.prev_rejection_note || null,
          resubmit_note: resubmitNote.trim(),
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
      const propPatch = resubmitTarget.property;
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
        actionText: buildLogAction('Đầu chủ chỉnh sửa & gửi lại duyệt', listing.id, `Ghi chú: ${resubmitNote.trim().slice(0, 120)}`),
        actionType: AUDIT_ACTION_TYPE.LISTING_RESUBMIT_FOR_REVIEW,
        listingId: listing.id,
        userName: u.name || u.email || 'User',
        userId: u.id || '',
        propertyId: listing.property_id,
        oldStatus: 'Từ chối',
        newStatus: 'Chờ duyệt chỉnh sửa',
        detail: resubmitNote.trim(),
        modifiedFields: {
          title: { from: listing.title || '', to: form.title.trim() },
          description: { from: listing.description || '', to: form.description.trim() },
          resubmit_note: resubmitNote.trim(),
        },
      });
      setResubmitTarget(null);
      setResubmitNote('');
      setLocalMedia([]);
      setSubmitting(false);
      showToast('Đã gửi lại MKT duyệt.', 'success');
      loadData();
      loadMediaLibrary();
    } catch {
      setSubmitting(false);
      showToast('Lỗi khi gửi lại.', 'danger');
    }
  };

  const resetCompose = () => {
    setStep('select');
    setSelected(null);
    setForm({ title: '', description: '', contact_phone: '' });
    setLocalMedia([]);
    setImageUrlInput('');
    setVideoUrlInput('');
    setPreviewSlide(0);
    setCreatedListingId('');
    loadData();
  };

  useEffect(() => {
    setPreviewSlide(0);
  }, [step]);

  useEffect(() => {
    const n = localMedia.filter((x) => x.kind === 'image').length;
    setPreviewSlide((s) => (n === 0 ? 0 : Math.min(s, n - 1)));
  }, [localMedia]);

  return (
    <div className="p-0" style={{ minHeight: '100vh', background: 'var(--ih-main-bg, #f1f5f9)' }}>
      <div className="p-4 mx-auto" style={{ maxWidth: 1280 }}>
        <header className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4">
          <div>
            <div className="text-uppercase small fw-bold mb-1 text-secondary" style={{ letterSpacing: '0.12em' }}>
              Niêm yết cấp tin
            </div>
            <h3 className="fw-bold text-dark mb-1">Soạn tin đăng</h3>
            <p className="text-muted mb-0 small" style={{ maxWidth: 560 }}>
              Media lưu tại <strong>Library</strong> (json-server). Mã tin chuẩn <strong>LT-00001</strong>. Xem trước có gallery ảnh + video.
            </p>
          </div>
          <div className="d-flex gap-2 flex-wrap">
            <span className="badge rounded-pill px-3 py-2 bg-light text-dark border">
              {user.name || 'Chưa đăng nhập'}
            </span>
            <span className="badge rounded-pill px-3 py-2 bg-info bg-opacity-10 text-info border border-info border-opacity-25">
              Chờ MKT: {pendingMktCount}
            </span>
          </div>
        </header>

        {toast && (
          <div 
            className={`alert alert-${toast.type} shadow`} 
            style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, minWidth: 300 }}
            role="alert"
          >
            {toast.msg}
          </div>
        )}

        <div className="mb-4 bg-white border rounded-3 shadow-sm p-2 d-inline-flex flex-wrap align-items-center gap-1">
          <div className="btn-group shadow-sm flex-wrap">
          <button
            type="button"
            className={`btn px-3 ${workspaceTab === 'compose' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setWorkspaceTab('compose')}
          >
            Soạn tin mới
          </button>
          <button
            type="button"
            className={`btn px-3 ${workspaceTab === 'mine' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setWorkspaceTab('mine')}
          >
            Bài đăng của tôi ({myListings.length})
          </button>
          <button
            type="button"
            className={`btn px-3 ${workspaceTab === 'library' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setWorkspaceTab('library')}
          >
            Library Media ({scopedMediaLibrary.length})
          </button>
          </div>
        </div>

        {workspaceTab === 'library' && (
          <div className="card border-0 shadow-lg mb-4" style={{ background: '#f8fafc', borderRadius: 16 }}>
            <div className="card-header border-0 fw-semibold py-3" style={{ background: '#e2e8f0' }}>
              Thư viện Media (ảnh / video theo tin đăng)
            </div>
            <div className="card-body">
              {scopedMediaLibrary.length === 0 && <p className="text-muted small mb-0">Chưa có file trong thư viện.</p>}
              <div className="row g-3">
                {scopedMediaLibrary.map((m) => (
                  <div key={m.id} className="col-6 col-md-4 col-lg-3">
                    <div className="border rounded overflow-hidden bg-white shadow-sm">
                      {m.kind === 'video' ? (
                        <video src={m.url} className="w-100" style={{ height: 120, objectFit: 'cover' }} muted playsInline />
                      ) : (
                        <img src={m.url} alt="" className="w-100" style={{ height: 120, objectFit: 'cover' }} />
                      )}
                      <div className="p-2 small">
                        <div className="text-truncate fw-semibold" title={m.fileName}>
                          {m.fileName}
                        </div>
                        <div className="text-muted text-truncate">Tin: {formatListingId(m.listingCode || m.listingId)}</div>
                        <span className="badge bg-secondary mt-1">{m.kind}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {workspaceTab === 'mine' && (
          <div className="card border-0 shadow-lg mb-4" style={{ background: '#f8fafc', borderRadius: 16 }}>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead style={{ background: '#e2e8f0' }}>
                    <tr className="small text-muted text-uppercase">
                      <th className="ps-4">Mã tin</th>
                      <th>Tài sản</th>
                      <th>Tiêu đề</th>
                      <th>Trạng thái</th>
                      <th className="text-end pe-4">Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myListings.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center py-5 text-muted">
                          Chưa có bài đăng nào.
                        </td>
                      </tr>
                    )}
                    {myListings.map((l) => (
                      <tr key={l.id}>
                        <td className="ps-4 fw-mono">
                          <span className="badge bg-dark">{formatListingId(l.listingCode || l.id)}</span>
                        </td>
                        <td className="small">{formatPropertyId(properties.find(p => String(p.id) === String(l.property_id))?.propertyCode || l.property_id)}</td>
                        <td className="text-truncate" style={{ maxWidth: 280 }} title={l.title}>
                          {l.title}
                        </td>
                        <td>
                          <span className="badge bg-secondary">{l.listing_status}</span>
                        </td>
                        <td className="text-end pe-4">
                          {l.listing_status === 'Từ chối' && (user.role === 'admin' || sameUserId(l.createdBy_id, user.id) || l.createdBy === user.name) && (
                            <button type="button" className="btn btn-sm btn-primary" onClick={() => openResubmit(l)}>
                              Gửi lại sau từ chối
                            </button>
                          )}
                          <a href="/feature5" className="btn btn-sm btn-outline-secondary ms-1">
                            Xem F5
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {workspaceTab === 'compose' && (
          <>
            <div className="row g-3 mb-4">
              {[
                { label: 'Sẵn sàng soạn tin', value: eligible.length, color: '#38bdf8' },
                {
                  label: 'Đang niêm yết (POS)',
                  value: posProps.filter((p) => (p.level2_status || p.statusLv2) === 'Đang niêm yết').length,
                  color: '#4ade80',
                },
                { label: 'Chờ duyệt MKT', value: pendingMktCount, color: '#fbbf24' },
                { label: 'Tài sản POS', value: posProps.length, color: '#c084fc' },
              ].map((s) => (
                <div key={s.label} className="col-6 col-md-3">
                  <div
                    className="p-3 border-0 h-100 bg-white shadow-sm"
                    style={{ borderRadius: 14, border: `1px solid ${s.color}40` }}
                  >
                    <div className="fw-bold fs-4" style={{ color: s.color }}>
                      {s.value}
                    </div>
                    <div className="small text-muted">
                      {s.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="card border-0 shadow-lg mb-4" style={{ background: '#f8fafc', borderRadius: 16 }}>
              <div className="card-body py-3 d-flex flex-wrap gap-2 align-items-center">
                <div className="btn-group btn-group-sm">
                  <button
                    type="button"
                    className={`btn ${filterTab === 'eligible' ? 'btn-primary' : 'btn-outline-primary'}`}
                    onClick={() => setFilterTab('eligible')}
                  >
                    Đủ điều kiện ({eligible.length})
                  </button>
                  <button
                    type="button"
                    className={`btn ${filterTab === 'all' ? 'btn-secondary' : 'btn-outline-secondary'}`}
                    onClick={() => setFilterTab('all')}
                  >
                    Tất cả TS
                  </button>
                </div>
                <input
                  className="form-control form-control-sm"
                  style={{ maxWidth: 220 }}
                  placeholder="Tìm mã LS / địa chỉ…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="btn-group btn-group-sm">
                  {['all', 'Bán', 'Thuê'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`btn ${filterType === t ? 'btn-info' : 'btn-outline-info'}`}
                      onClick={() => setFilterType(t)}
                    >
                      {t === 'all' ? 'Tất cả' : t}
                    </button>
                  ))}
                </div>
                <select
                  className="form-select form-select-sm"
                  style={{ maxWidth: 200 }}
                  value={filterCreator}
                  onChange={(e) => setFilterCreator(e.target.value)}
                >
                  <option value="all">Mọi người tạo TS</option>
                  {user.name && !creators.includes(user.name) && (
                    <option value={user.name}>{user.name}</option>
                  )}
                  {creators.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="card border-0 shadow-lg" style={{ background: '#f8fafc', borderRadius: 16 }}>
              <div className="card-header border-0 py-3 fw-semibold d-flex align-items-center" style={{ background: '#e2e8f0', borderRadius: '16px 16px 0 0' }}>
                <span>Danh sách tài sản · {displayList.length}</span>
                <span className="ms-auto small text-muted fw-normal">Chọn dòng để soạn tin</span>
              </div>
              <div className="card-body p-0" style={{ maxHeight: '58vh', overflowY: 'auto' }}>
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0" style={{ whiteSpace: 'nowrap' }}>
                    <thead className="table-light sticky-top">
                      <tr className="small text-muted">
                        <th className="ps-3">Mã LS</th>
                        <th>Loại BĐS</th>
                        <th>Địa chỉ</th>
                        <th>Loại</th>
                        <th>Giá</th>
                        <th>Kho</th>
                        <th>Lv1</th>
                        <th>Lv2</th>
                        <th>POS</th>
                        <th>Người tạo TS</th>
                        <th className="text-end pe-3">Hành động</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayList.length === 0 && (
                        <tr>
                          <td colSpan={11} className="text-center py-5 text-muted">
                            Không có tài sản.
                          </td>
                        </tr>
                      )}
                      {displayList.map((p) => {
                        const s1 = p.level1_status || p.statusLv1;
                        const s2 = p.level2_status || p.statusLv2;
                        const canCreate = (s1 === 'Được duyệt' || s1 === 'Được đảm bảo') && s2 === 'Chưa niêm yết';
                        return (
                          <tr
                            key={p.id}
                            style={{ cursor: canCreate ? 'pointer' : 'default', opacity: canCreate ? 1 : 0.55 }}
                            onClick={() => canCreate && autoFill(p)}
                          >
                            <td className="ps-3">
                              <span className="badge bg-dark">{p.propertyCode || p.id}</span>
                            </td>
                            <td className="small">{p.propertyType}</td>
                            <td className="text-truncate" style={{ maxWidth: 200 }} title={p.address}>
                              {p.address}
                            </td>
                            <td>
                              <span className={`badge bg-${p.type === 'Bán' ? 'danger' : 'info'}`}>{p.type}</span>
                            </td>
                            <td className="small fw-semibold text-primary">{displayPrice(p)}</td>
                            <td>
                              <span className="badge bg-light text-dark border">{p.warehouse_type || '—'}</span>
                            </td>
                            <td>
                              <span className={statusBadgeClass(LV1_COLOR[s1] || 'secondary')}>{s1}</span>
                            </td>
                            <td>
                              <span className={statusBadgeClass(LV2_COLOR[s2] || 'secondary')}>{s2}</span>
                            </td>
                            <td className="small text-muted">{p.pos_name}</td>
                            <td className="small">{p.createdBy}</td>
                            <td className="text-end pe-3">
                              {canCreate ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    autoFill(p);
                                  }}
                                >
                                  Soạn tin
                                </button>
                              ) : (
                                <span className="badge bg-light text-muted border">Không đủ ĐK</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {selected && step === 'form' && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 1050 }}>
          <div className="modal-dialog modal-xl modal-dialog-scrollable">
            <div className="modal-content border-0" style={{ borderRadius: 16 }}>
              <div className="modal-header border-0 text-white" style={{ background: 'linear-gradient(90deg,#0ea5e9,#6366f1)' }}>
                <h5 className="modal-title fw-bold">Soạn tin đăng — {formatPropertyId(selected.propertyCode || selected.id)}</h5>
                <button type="button" className="btn-close btn-close-white" onClick={resetCompose} aria-label="Đóng" />
              </div>
              <div className="modal-body p-0">
                <div className="bg-light p-3 border-bottom d-flex flex-wrap gap-2 align-items-center">
                  <span className="badge bg-dark">{formatPropertyId(selected.propertyCode || selected.id)}</span>
                  <span className={`badge bg-${selected.type === 'Bán' ? 'danger' : 'info'}`}>{selected.type}</span>
                  <span className="small text-truncate" style={{ maxWidth: 400 }}>
                    {selected.address}
                  </span>
                </div>
                <div className="container-fluid py-4">
                  <div className="row g-4">
                    <div className="col-md-4">
                      <div className="card border-0 bg-light h-100">
                        <div className="card-header fw-semibold border-0 bg-white">Thông tin tài sản</div>
                        <div className="card-body small">
                          {[
                            ['Loại hình', selected.type],
                            ['Loại BĐS', selected.propertyType],
                            ['Giá', displayPrice(selected)],
                            ['Diện tích', `${Number(selected.area).toLocaleString('en-US')}m²`],
                            ['Người tạo TS', selected.createdBy],
                          ].map(([k, v]) => (
                            <div key={k} className="d-flex justify-content-between mb-2 border-bottom pb-1">
                              <span className="text-muted">{k}</span>
                              <span className="fw-semibold text-end" style={{ maxWidth: '58%' }}>
                                {v}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="col-md-8">
                      <MediaEditorBlock
                        localMedia={localMedia}
                        setLocalMedia={setLocalMedia}
                        imageUrlInput={imageUrlInput}
                        setImageUrlInput={setImageUrlInput}
                        videoUrlInput={videoUrlInput}
                        setVideoUrlInput={setVideoUrlInput}
                        showToast={showToast}
                        disabled={false}
                      />
                      <div className="mb-3">
                        <label className="form-label fw-semibold">Tiêu đề</label>
                        <input
                          className="form-control"
                          value={form.title}
                          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                          maxLength={150}
                        />
                        <div className="form-text text-end">{form.title.length}/150</div>
                      </div>
                      <div className="mb-3">
                        <label className="form-label fw-semibold">Mô tả</label>
                        <textarea
                          className="form-control"
                          rows={8}
                          value={form.description}
                          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                          maxLength={2000}
                        />
                        <div className="form-text text-end">{form.description.length}/2000</div>
                      </div>
                      <div className="mb-3">
                        <label className="form-label fw-semibold">SĐT liên hệ</label>
                        <input
                          className="form-control"
                          value={form.contact_phone}
                          onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer bg-light border-0">
                <button type="button" className="btn btn-outline-secondary" onClick={resetCompose}>
                  Hủy
                </button>
                <button type="button" className="btn btn-outline-primary" onClick={() => setStep('preview')}>
                  Xem trước
                </button>
                <button type="button" className="btn btn-primary fw-bold" disabled={submitting} onClick={handleSubmitNew}>
                  {submitting && <span className="spinner-border spinner-border-sm me-1" />}
                  Gửi duyệt MKT
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selected && step === 'preview' && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 1050 }}>
          <div className="modal-dialog modal-xl modal-dialog-scrollable">
            <div className="modal-content border-0" style={{ borderRadius: 16 }}>
              <div className="modal-header bg-info text-white border-0">
                <h5 className="modal-title fw-bold">Xem trước tin đăng</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setStep('form')} aria-label="Đóng" />
              </div>
              <div className="modal-body">
                <p className="small text-muted mb-3">
                  Sau khi gửi, mã tin được chuẩn hóa dạng <strong>LT-#####</strong> (5 chữ số). Ảnh/video dưới đây là nội dung sẽ lưu vào Library.
                </p>
                <MediaPreviewCarousel items={localMedia} slide={previewSlide} setSlide={setPreviewSlide} />
                <h5 className="fw-bold">{form.title}</h5>
                <pre className="bg-light border rounded p-3 small" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                  {form.description}
                </pre>
                <div className="alert alert-light border">SĐT: {form.contact_phone}</div>
              </div>
              <div className="modal-footer border-0 bg-light">
                <button type="button" className="btn btn-outline-secondary" onClick={() => setStep('form')}>
                  Sửa lại
                </button>
                <button type="button" className="btn btn-success fw-bold" disabled={submitting} onClick={handleSubmitNew}>
                  {submitting && <span className="spinner-border spinner-border-sm me-1" />}
                  Xác nhận gửi duyệt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 'success' && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 text-center p-4" style={{ borderRadius: 16 }}>
              <div className="text-success" style={{ fontSize: 56 }}>
                ✓
              </div>
              <h4 className="fw-bold mt-2">Đã gửi duyệt</h4>
              <p className="text-muted small mb-1">Mã tin đăng (chuẩn hóa):</p>
              <div className="display-6 fw-bold text-primary mb-3">{formatListingId(createdListingId)}</div>
              <p className="text-muted small">Media đã lưu vào Library và liên kết với tin này.</p>
              <div className="d-flex gap-2 justify-content-center mt-3 flex-wrap">
                <button type="button" className="btn btn-primary" onClick={resetCompose}>
                  Soạn tin khác
                </button>
                <a href="/feature5" className="btn btn-outline-primary">
                  Mở trang duyệt MKT
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {resubmitTarget && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 1060 }}>
          <div className="modal-dialog modal-xl modal-dialog-scrollable">
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: 16 }}>
              <div className="modal-header border-0 text-white" style={{ background: 'linear-gradient(90deg,#b45309,#d97706)' }}>
                <div>
                  <div className="small text-white-50 text-uppercase fw-bold mb-1">Gửi lại sau từ chối MKT</div>
                  <h5 className="modal-title fw-bold mb-0">{formatListingId(resubmitTarget.listing.id)}</h5>
                  {resubmitTarget.property && (
                    <div className="mt-2 d-flex flex-wrap gap-2 align-items-center small">
                      <span className="badge bg-light text-dark">Tài sản: {formatPropertyId(resubmitTarget.property.propertyCode || resubmitTarget.property.id)}</span>
                      <span
                        className={statusBadgeClass(
                          LV2_COLOR[resubmitTarget.property.level2_status || resubmitTarget.property.statusLv2] || 'secondary',
                        )}
                      >
                        Lv2: {resubmitTarget.property.level2_status || resubmitTarget.property.statusLv2 || '—'}
                      </span>
                      <span className="text-white-50 d-none d-md-inline">Tiêu đề & mô tả được gen từ dữ liệu kho (có thể chỉnh)</span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => {
                    setResubmitTarget(null);
                    setResubmitNote('');
                    setLocalMedia([]);
                    setShowResubmitWebsitePreview(false);
                  }}
                  aria-label="Đóng"
                />
              </div>
              <div className="modal-body bg-white">
                {resubmitTarget.listing.rejection_note && (
                  <div className="alert alert-danger border-0 shadow-sm small mb-4">
                    <strong>Lý do từ chối trước:</strong> {resubmitTarget.listing.rejection_note}
                  </div>
                )}
                <div className="row g-4">
                  <div className="col-lg-6">
                    <div className="fw-semibold mb-2 text-primary">
                      <i className="bi bi-images me-2" />
                      Ảnh & video tin đăng
                    </div>
                    <MediaEditorBlock
                      localMedia={localMedia}
                      setLocalMedia={setLocalMedia}
                      imageUrlInput={imageUrlInput}
                      setImageUrlInput={setImageUrlInput}
                      videoUrlInput={videoUrlInput}
                      setVideoUrlInput={setVideoUrlInput}
                      showToast={showToast}
                      disabled={false}
                    />
                  </div>
                  <div className="col-lg-6">
                    <div className="d-flex flex-wrap gap-2 mb-3">
                      <button
                        type="button"
                        className="btn btn-outline-primary btn-sm fw-semibold"
                        onClick={() => {
                          const p = resubmitTarget.property;
                          if (!p) return;
                          const copy = buildListingCopyFromProperty(p, listingActor);
                          setForm((f) => ({
                            ...f,
                            title: copy.title || f.title,
                            description: copy.description,
                          }));
                          showToast('Đã làm mới tiêu đề & mô tả từ tài sản kho.', 'success');
                        }}
                      >
                        <i className="bi bi-magic me-1" />
                        Làm mới từ tài sản
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm fw-semibold"
                        onClick={() => setShowResubmitWebsitePreview(true)}
                      >
                        <i className="bi bi-eye me-1" />
                        Xem trước bài đăng (website)
                      </button>
                    </div>
                    <div className="mb-3">
                      <label className="form-label fw-semibold">Tiêu đề</label>
                      <input className="form-control" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                    </div>
                    <div className="mb-3">
                      <label className="form-label fw-semibold">Mô tả (gen từ kho — chỉnh sửa tự do)</label>
                      <textarea
                        className="form-control"
                        rows={10}
                        value={form.description}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label fw-semibold">SĐT liên hệ</label>
                      <input
                        className="form-control"
                        value={form.contact_phone}
                        onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
                        placeholder="VD: 090x xxx xxx"
                      />
                    </div>
                    <div className="mb-0">
                      <label className="form-label fw-semibold">
                        Ghi chú gửi lại <span className="text-danger">*</span> (≥ {RESUBMIT_NOTE_MIN} ký tự)
                      </label>
                      <textarea
                        className="form-control"
                        rows={3}
                        placeholder="Mô tả phần đã chỉnh theo phản hồi MKT…"
                        value={resubmitNote}
                        onChange={(e) => setResubmitNote(e.target.value)}
                      />
                    </div>
                    <div className="mt-4 p-3 rounded-3 border bg-light">
                      <div className="fw-semibold mb-2 small text-muted">Xem nhanh media trong form</div>
                      <MediaPreviewCarousel items={localMedia} slide={previewSlide} setSlide={setPreviewSlide} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer border-0 bg-light d-flex flex-wrap gap-2 justify-content-between">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => {
                    setResubmitTarget(null);
                    setResubmitNote('');
                    setLocalMedia([]);
                    setShowResubmitWebsitePreview(false);
                  }}
                >
                  Hủy
                </button>
                <button type="button" className="btn btn-warning fw-bold text-dark px-4" disabled={submitting} onClick={handleResubmit}>
                  {submitting && <span className="spinner-border spinner-border-sm me-1" />}
                  Gửi lại MKT
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ListingWebsitePreviewModal
        show={showResubmitWebsitePreview && !!resubmitTarget}
        onHide={() => setShowResubmitWebsitePreview(false)}
        title={form.title}
        description={form.description}
        contactPhone={form.contact_phone}
        property={resubmitTarget?.property}
        listing={resubmitTarget?.listing}
        extraImageUrls={resubmitPreviewImageUrls}
      />
    </div>
  );
}
