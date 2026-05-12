import { API } from './listingWorkflow';

/** Giới hạn demo (json-server lưu data URL) — file lớn hơn: dùng thêm URL tĩnh */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 5 * 1024 * 1024;

export function readFileAsDataURL(file, maxBytes) {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(new Error(`File vượt quá ${Math.round(maxBytes / 1024 / 1024)}MB.`));
      return;
    }
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('Không đọc được file.'));
    fr.readAsDataURL(file);
  });
}

export function isHttpUrl(s) {
  if (!s || typeof s !== 'string') return false;
  const t = s.trim();
  return /^https?:\/\//i.test(t);
}

export async function fetchMediaByListing(listingId) {
  const q = encodeURIComponent(listingId);
  const rows = await fetch(`${API}/mediaLibrary?listingId=${q}`).then((r) => r.json());
  return Array.isArray(rows) ? rows : [];
}

export async function deleteMediaRows(rows) {
  await Promise.all(
    (rows || []).map((m) =>
      m.id ? fetch(`${API}/mediaLibrary/${m.id}`, { method: 'DELETE' }).catch(() => {}) : Promise.resolve(),
    ),
  );
}

export async function postMediaRow(body) {
  const res = await fetch(`${API}/mediaLibrary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('POST mediaLibrary failed');
  return res.json();
}

/** Lưu từng file/URL vào mediaLibrary, trả về danh sách bản ghi đã tạo */
export async function persistMediaItems({
  listingId,
  propertyId,
  user,
  items,
}) {
  const created = [];
  const now = new Date().toISOString();
  for (const it of items) {
    const row = {
      listingId,
      property_id: propertyId || null,
      kind: it.kind,
      source: it.source || 'upload',
      url: it.url,
      fileName: it.fileName || (it.kind === 'image' ? 'image' : 'video'),
      mimeType: it.mimeType || null,
      fileSize: it.fileSize ?? null,
      createdAt: now,
      createdBy: user.name || '',
      createdBy_id: user.id || '',
    };
    const saved = await postMediaRow(row);
    created.push(saved);
  }
  return created;
}

export function splitUrls(text) {
  if (!text || !text.trim()) return [];
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
