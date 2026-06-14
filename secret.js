const SECRET_DB_NAME = "aqua-secret-library";
const SECRET_DB_VERSION = 1;
const SECRET_HIDDEN_KEY = "aqua-secret-hidden-items";
const SECRET_UNLOCK_KEY = "aqua-secret-unlocked";
const SECRET_RANDOM_DICE_SOUNDS = ["assets/sfx/dice-1.mp3", "assets/sfx/dice-2.mp3"];
const SECRET_MANAGE_MODE =
  location.protocol === "file:" || new URLSearchParams(location.search).get("manage") === "1";

const secretState = {
  books: [],
  hiddenIds: new Set(readSecretHiddenIds()),
  objectUrls: new Set(),
  objectUrlCache: new WeakMap(),
};

const secretElements = {
  count: document.querySelector("#secretCount"),
  search: document.querySelector("#secretSearch"),
  grid: document.querySelector("#secretGrid"),
  empty: document.querySelector("#secretEmpty"),
  detailDialog: document.querySelector("#secretDetailDialog"),
  detail: document.querySelector("#secretDetail"),
  managerDialog: document.querySelector("#secretManagerDialog"),
  form: document.querySelector("#secretBookForm"),
  library: document.querySelector("#secretLibrary"),
  managerItems: document.querySelector("#secretManagerItems"),
  publishPanel: document.querySelector("#secretPublishPanel"),
  publishCount: document.querySelector("#secretPublishCount"),
  publishSize: document.querySelector("#secretPublishSize"),
  publishError: document.querySelector("#secretPublishError"),
  exportButton: document.querySelector("#exportSecretPackage"),
  submitLabel: document.querySelector("#secretSubmitLabel"),
  cancelEdit: document.querySelector("#cancelSecretEdit"),
  fileStatus: document.querySelector("#secretFileStatus"),
  lockDialog: document.querySelector("#secretLockDialog"),
  lockForm: document.querySelector("#secretLockForm"),
  lockError: document.querySelector("#secretLockError"),
  toast: document.querySelector("#secretToast"),
  randomButton: document.querySelector("#randomSecretButton"),
  randomOverlay: document.querySelector("#secretRandomRollOverlay"),
};

let secretRandomRolling = false;

function readSecretHiddenIds() {
  try {
    const value = JSON.parse(localStorage.getItem(SECRET_HIDDEN_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function openSecretDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SECRET_DB_NAME, SECRET_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("books")) {
        request.result.createObjectStore("books", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function secretDbAction(mode, action) {
  const db = await openSecretDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("books", mode);
    const request = action(transaction.objectStore("books"));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

const getSecretDrafts = () => secretDbAction("readonly", (store) => store.getAll());
const saveSecretDraft = (item) => secretDbAction("readwrite", (store) => store.put(item));
const removeSecretDraft = (id) => secretDbAction("readwrite", (store) => store.delete(id));

function escapeSecretHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function secretObjectUrl(blob) {
  if (!blob) return "";
  if (typeof blob === "string") return blob;
  const cached = secretState.objectUrlCache.get(blob);
  if (cached) return cached;
  const url = URL.createObjectURL(blob);
  secretState.objectUrlCache.set(blob, url);
  secretState.objectUrls.add(url);
  return url;
}

function parseSecretUrls(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((url) => url.trim())
    .filter(Boolean)
    .map((url) => {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new TypeError("只支持 HTTP 或 HTTPS 网址");
      }
      return parsed.href;
    });
}

function secretId() {
  return `secret-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
}

function secretPlaceholder(item) {
  return `
    <div class="placeholder-cover cover-night">
      <strong>${escapeSecretHtml(item.title)}</strong>
      <small>HIDDEN AQUA COLLECTION</small>
    </div>
  `;
}

function secretCover(item) {
  const image = item.images?.[0];
  return image
    ? `<img src="${escapeSecretHtml(secretObjectUrl(image))}" alt="${escapeSecretHtml(item.title)}封面" />`
    : secretPlaceholder(item);
}

function secretToast(message) {
  secretElements.toast.textContent = message;
  secretElements.toast.classList.add("show");
  clearTimeout(secretToast.timer);
  secretToast.timer = setTimeout(() => secretElements.toast.classList.remove("show"), 2400);
}

function renderSecretBooks() {
  const query = secretElements.search.value.trim().toLocaleLowerCase();
  const filtered = secretState.books.filter((item) =>
    `${item.title} ${item.jm} ${(item.tags || []).join(" ")}`
      .toLocaleLowerCase()
      .includes(query),
  );
  secretElements.count.textContent = secretState.books.length;
  secretElements.grid.innerHTML = filtered
    .map((item, index) => `
      <article class="manga-card" style="animation-delay:${index * 45}ms">
        <button class="manga-open" data-secret-id="${escapeSecretHtml(item.id)}" type="button">
          <div class="manga-cover">
            ${secretCover(item)}
            <span class="manga-index">${String(secretState.books.indexOf(item) + 1).padStart(2, "0")}</span>
          </div>
          <div class="manga-info">
            <h3>${escapeSecretHtml(item.title)}</h3>
            <p><span>HIDDEN PICK</span><span class="secret-card-jm">jm ${escapeSecretHtml(item.jm)}</span></p>
          </div>
        </button>
        ${
          SECRET_MANAGE_MODE
            ? `<button class="card-delete" data-secret-delete="${escapeSecretHtml(item.id)}" type="button" title="删除">
                <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg>
              </button>`
            : ""
        }
      </article>
    `)
    .join("");
  secretElements.empty.hidden = filtered.length > 0;
}

function openSecretDetail(id) {
  const item = secretState.books.find((book) => book.id === id);
  if (!item) return;
  const image = item.images?.[0];
  const imageUrl = image ? escapeSecretHtml(secretObjectUrl(image)) : "";
  const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean).slice(0, 3) : [];
  const meta = [
    tags.length
      ? `<div class="secret-tags">${tags.map((tag) => `<span>${escapeSecretHtml(tag)}</span>`).join("")}</div>`
      : "",
    item.collectedAt
      ? `<time class="secret-collected-date" datetime="${escapeSecretHtml(item.collectedAt)}">
          <small>COLLECTED</small>
          <span>${escapeSecretHtml(formatSecretDate(item.collectedAt))}</span>
        </time>`
      : "",
  ].join("");
  const titleLength = Array.from(item.title || "").length;
  const titleClass =
    titleLength > 30
      ? "secret-title secret-title-very-long"
      : titleLength > 18
        ? "secret-title secret-title-long"
        : "secret-title";
  secretElements.detail.innerHTML = `
    <div class="secret-detail-layout">
      <div class="secret-star-cover">
        ${
          image
            ? `
              <img class="secret-detail-backdrop" src="${imageUrl}" alt="" aria-hidden="true" />
              <span class="secret-detail-tint" aria-hidden="true"></span>
              <img class="secret-detail-image" src="${imageUrl}" alt="${escapeSecretHtml(item.title)}封面" />
            `
            : secretPlaceholder(item)
        }
      </div>
      <div class="secret-detail-copy">
        <span class="detail-number">SECRET PICK · ${String(secretState.books.indexOf(item) + 1).padStart(2, "0")}</span>
        <h2 class="${titleClass}">${escapeSecretHtml(item.title)}</h2>
        <div class="secret-jm"><span>jm</span><strong>${escapeSecretHtml(item.jm)}</strong></div>
        ${meta ? `<div class="secret-detail-meta">${meta}</div>` : ""}
        <blockquote class="secret-recommendation">
          <small>RECOMMENDATION</small>
          <span>${escapeSecretHtml(item.quote)}</span>
        </blockquote>
        ${
          SECRET_MANAGE_MODE
            ? `<button class="detail-edit-button secret-detail-edit" data-secret-edit="${escapeSecretHtml(item.id)}" type="button">
                <svg viewBox="0 0 24 24"><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" /><path d="m13.5 7.5 3 3" /></svg>
                编辑资料
              </button>`
            : ""
        }
      </div>
    </div>
  `;
  if (!secretElements.detailDialog.open) secretElements.detailDialog.showModal();
}

function playSecretDiceSound() {
  const source =
    SECRET_RANDOM_DICE_SOUNDS[Math.floor(Math.random() * SECRET_RANDOM_DICE_SOUNDS.length)];
  const audio = new Audio(source);
  audio.volume = 0.55;
  audio.play().catch(() => {});
}

async function rollRandomSecretBook() {
  if (secretRandomRolling) return;
  if (!secretState.books.length) {
    secretToast("收藏还是空的");
    return;
  }

  secretRandomRolling = true;
  secretElements.randomButton.disabled = true;
  secretElements.randomOverlay.hidden = false;
  secretElements.randomOverlay.classList.remove("is-revealing");
  void secretElements.randomOverlay.offsetWidth;
  secretElements.randomOverlay.classList.add("is-rolling");
  playSecretDiceSound();

  const item = secretState.books[Math.floor(Math.random() * secretState.books.length)];
  await new Promise((resolve) => setTimeout(resolve, 1550));
  secretElements.randomOverlay.classList.add("is-revealing");
  await new Promise((resolve) => setTimeout(resolve, 320));
  secretElements.randomOverlay.classList.remove("is-rolling", "is-revealing");
  secretElements.randomOverlay.hidden = true;
  openSecretDetail(item.id);
  secretElements.randomButton.disabled = false;
  secretRandomRolling = false;
}

function switchSecretManager(view) {
  document.querySelectorAll("[data-secret-form]").forEach((button) => {
    button.classList.toggle("active", button.dataset.secretForm === view);
  });
  secretElements.form.hidden = view !== "add";
  secretElements.library.hidden = view !== "library";
  secretElements.publishPanel.hidden = view !== "publish";
  if (view === "library") renderSecretManager();
  if (view === "publish") updateSecretPublishSummary();
}

function resetSecretForm() {
  secretElements.form.reset();
  secretElements.form.elements.id.value = "";
  secretElements.form.elements.collectedAt.value = secretToday();
  secretElements.submitLabel.textContent = "保存收藏";
  secretElements.cancelEdit.hidden = true;
  secretElements.fileStatus.textContent = "支持 JPG、PNG、WEBP";
}

function startSecretEdit(id) {
  if (!SECRET_MANAGE_MODE) return;
  const item = secretState.books.find((book) => book.id === id);
  if (!item) return;
  switchSecretManager("add");
  const form = secretElements.form;
  form.elements.id.value = item.id;
  form.elements.title.value = item.title;
  form.elements.jm.value = item.jm;
  form.elements.tags.value = Array.isArray(item.tags) ? item.tags.join("、") : "";
  form.elements.collectedAt.value = item.collectedAt || "";
  form.elements.quote.value = item.quote;
  form.elements.imageUrls.value = (item.images || [])
    .filter((image) => typeof image === "string")
    .join("\n");
  secretElements.submitLabel.textContent = "保存修改";
  secretElements.cancelEdit.hidden = false;
  if (!secretElements.managerDialog.open) secretElements.managerDialog.showModal();
}

async function submitSecretBook(event) {
  event.preventDefault();
  if (!SECRET_MANAGE_MODE) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const editingId = data.get("id");
  const current = secretState.books.find((item) => item.id === editingId);
  let urls;
  try {
    urls = parseSecretUrls(data.get("imageUrls"));
  } catch (error) {
    secretToast(`图片网址有误：${error.message}`);
    return;
  }
  const files = data.getAll("images").filter((file) => file.size > 0);
  const existingLocalImages = current?.images?.filter((image) => typeof image !== "string") || [];
  const images = editingId
    ? [...urls, ...(files.length ? files : existingLocalImages)]
    : [...urls, ...files];
  if (!images.length) {
    secretToast("请填写 COS 图片网址或选择本地图片");
    return;
  }

  const button = form.querySelector(".submit-button");
  button.disabled = true;
  secretElements.submitLabel.textContent = "正在保存...";
  try {
    const item = {
      ...(current || {}),
      id: editingId || secretId(),
      title: data.get("title").trim(),
      jm: String(data.get("jm")).trim(),
      tags: parseSecretTags(data.get("tags")),
      collectedAt: String(data.get("collectedAt") || "").trim(),
      quote: data.get("quote").trim(),
      images,
      local: true,
      published: current?.published ?? false,
      createdAt: current?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    await saveSecretDraft(item);
    const index = secretState.books.findIndex((book) => book.id === item.id);
    if (index >= 0) secretState.books[index] = item;
    else secretState.books.unshift(item);
    renderSecretBooks();
    resetSecretForm();
    secretElements.managerDialog.close();
    if (secretElements.detailDialog.open) openSecretDetail(item.id);
    secretToast(editingId ? "收藏资料已修改" : "收藏已添加");
  } catch (error) {
    console.error(error);
    secretToast("保存失败，请检查浏览器存储空间");
  } finally {
    button.disabled = false;
    secretElements.submitLabel.textContent = editingId ? "保存修改" : "保存收藏";
  }
}

function renderSecretManager() {
  secretElements.managerItems.innerHTML = secretState.books.length
    ? secretState.books.map((item) => `
        <div class="manager-item">
          <div class="manager-thumb">${item.images?.[0] ? `<img src="${escapeSecretHtml(secretObjectUrl(item.images[0]))}" alt="" />` : "✦"}</div>
          <div>
            <strong>${escapeSecretHtml(item.title)}</strong>
            <span>
              jm ${escapeSecretHtml(item.jm)}
              ${item.collectedAt ? ` · ${escapeSecretHtml(formatSecretDate(item.collectedAt))}` : ""}
            </span>
          </div>
          <div class="secret-library-actions">
            <button class="secret-edit-small" data-secret-edit="${escapeSecretHtml(item.id)}" type="button">编辑</button>
            <button class="secret-delete-small" data-secret-delete="${escapeSecretHtml(item.id)}" type="button">移除</button>
          </div>
        </div>
      `).join("")
    : `<div class="empty-state"><span>空</span><h3>收藏已经清空</h3></div>`;
}

function parseSecretTags(value) {
  return [...new Set(
    String(value || "")
      .split(/[,，、]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .map((tag) => tag.slice(0, 12)),
  )].slice(0, 3);
}

function secretToday() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatSecretDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : value;
}

async function deleteSecretBook(id) {
  if (!SECRET_MANAGE_MODE) return;
  const item = secretState.books.find((book) => book.id === id);
  if (!item || !confirm(`确定删除“${item.title}”吗？`)) return;
  if (item.local) await removeSecretDraft(id);
  if (item.published || !item.local) {
    secretState.hiddenIds.add(id);
    localStorage.setItem(SECRET_HIDDEN_KEY, JSON.stringify([...secretState.hiddenIds]));
  }
  secretState.books = secretState.books.filter((book) => book.id !== id);
  if (secretElements.detailDialog.open) secretElements.detailDialog.close();
  renderSecretBooks();
  renderSecretManager();
  secretToast("收藏已移除");
}

function updateSecretPublishSummary() {
  const bytes = secretState.books.reduce(
    (sum, item) =>
      sum +
      (item.images || []).reduce(
        (imageSum, image) => imageSum + (typeof image === "string" ? 0 : image.size || 0),
        0,
      ),
    0,
  );
  secretElements.publishCount.textContent = secretState.books.length;
  secretElements.publishSize.textContent =
    bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function secretSafePart(value) {
  return String(value)
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "file";
}

function secretExtension(file) {
  return (
    file?.name?.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1]?.toLowerCase() ||
    file?.type?.split("/")[1]?.split(";")[0] ||
    "jpg"
  );
}

function secretUpdateCrc(crc, bytes) {
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return crc;
}

async function secretCrc(data) {
  let crc = 0xffffffff;
  if (data instanceof Uint8Array) {
    crc = secretUpdateCrc(crc, data);
  } else if (data.stream) {
    const reader = data.stream().getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      crc = secretUpdateCrc(crc, value);
    }
  } else {
    const chunkSize = 4 * 1024 * 1024;
    for (let offset = 0; offset < data.size; offset += chunkSize) {
      const chunk = new Uint8Array(
        await data.slice(offset, Math.min(offset + chunkSize, data.size)).arrayBuffer(),
      );
      crc = secretUpdateCrc(crc, chunk);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function secretWrite16(target, offset, value) {
  new DataView(target.buffer).setUint16(offset, value, true);
}

function secretWrite32(target, offset, value) {
  new DataView(target.buffer).setUint32(offset, value, true);
}

async function createSecretZip(entries) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const size = entry.data instanceof Uint8Array ? entry.data.byteLength : entry.data.size;
    const checksum = await secretCrc(entry.data);
    const local = new Uint8Array(30 + name.length);
    secretWrite32(local, 0, 0x04034b50);
    secretWrite16(local, 4, 20);
    secretWrite16(local, 6, 0x0800);
    secretWrite32(local, 14, checksum);
    secretWrite32(local, 18, size);
    secretWrite32(local, 22, size);
    secretWrite16(local, 26, name.length);
    local.set(name, 30);
    localParts.push(local, entry.data);

    const central = new Uint8Array(46 + name.length);
    secretWrite32(central, 0, 0x02014b50);
    secretWrite16(central, 4, 20);
    secretWrite16(central, 6, 20);
    secretWrite16(central, 8, 0x0800);
    secretWrite32(central, 16, checksum);
    secretWrite32(central, 20, size);
    secretWrite32(central, 24, size);
    secretWrite16(central, 28, name.length);
    secretWrite32(central, 42, offset);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length + size;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  secretWrite32(end, 0, 0x06054b50);
  secretWrite16(end, 8, entries.length);
  secretWrite16(end, 10, entries.length);
  secretWrite32(end, 12, centralSize);
  secretWrite32(end, 16, offset);
  return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
}

async function buildSecretPackage() {
  const entries = [];
  const books = [];
  for (const item of secretState.books) {
    const published = {
      id: item.id,
      title: item.title,
      jm: item.jm,
      tags: Array.isArray(item.tags) ? item.tags : [],
      collectedAt: item.collectedAt || "",
      quote: item.quote,
      images: [],
    };
    for (let index = 0; index < (item.images || []).length; index += 1) {
      const image = item.images[index];
      if (typeof image === "string") {
        published.images.push(image);
      } else {
        const path = `assets/secret/${secretSafePart(item.id)}-${String(index + 1).padStart(2, "0")}.${secretExtension(image)}`;
        entries.push({ name: path, data: image });
        published.images.push(path);
      }
    }
    books.push(published);
  }
  entries.unshift({
    name: "data/secret-content.json",
    data: new TextEncoder().encode(
      JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), books }, null, 2),
    ),
  });
  entries.push({
    name: "隐藏页发布说明.txt",
    data: new TextEncoder().encode(
      "将 data 和 assets 文件夹上传到网站仓库根目录并覆盖同名文件。此发布包不会修改主页 data/content.json。\r\n",
    ),
  });
  return createSecretZip(entries);
}

async function exportSecretPackage() {
  const button = secretElements.exportButton;
  const label = button.querySelector("span");
  button.disabled = true;
  label.textContent = "正在生成...";
  secretElements.publishError.hidden = true;
  try {
    const blob = await buildSecretPackage();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `aqua-secret-publish-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    secretToast("隐藏页发布包已生成");
  } catch (error) {
    console.error(error);
    secretElements.publishError.textContent = `生成失败：${error.message}`;
    secretElements.publishError.hidden = false;
  } finally {
    button.disabled = false;
    label.textContent = "下载 aqua-secret-publish.zip";
  }
}

function unlockSecretPage() {
  sessionStorage.setItem(SECRET_UNLOCK_KEY, "1");
  document.body.classList.remove("secret-locked");
  if (secretElements.lockDialog.open) secretElements.lockDialog.close();
}

function bindSecretEvents() {
  secretElements.randomButton.addEventListener("click", rollRandomSecretBook);
  secretElements.search.addEventListener("input", renderSecretBooks);
  secretElements.grid.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-secret-delete]");
    if (deleteButton) return deleteSecretBook(deleteButton.dataset.secretDelete);
    const card = event.target.closest("[data-secret-id]");
    if (card) openSecretDetail(card.dataset.secretId);
  });
  secretElements.detail.addEventListener("click", (event) => {
    const button = event.target.closest("[data-secret-edit]");
    if (button) startSecretEdit(button.dataset.secretEdit);
  });
  secretElements.managerItems.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-secret-edit]");
    const remove = event.target.closest("[data-secret-delete]");
    if (edit) startSecretEdit(edit.dataset.secretEdit);
    if (remove) deleteSecretBook(remove.dataset.secretDelete);
  });
  document.querySelector("#openSecretManager").addEventListener("click", () => {
    resetSecretForm();
    switchSecretManager("add");
    secretElements.managerDialog.showModal();
  });
  document.querySelectorAll("[data-secret-form]").forEach((button) => {
    button.addEventListener("click", () => switchSecretManager(button.dataset.secretForm));
  });
  document.querySelectorAll("[data-close-secret-detail]").forEach((button) => {
    button.addEventListener("click", () => secretElements.detailDialog.close());
  });
  document.querySelectorAll("[data-close-secret-manager]").forEach((button) => {
    button.addEventListener("click", () => secretElements.managerDialog.close());
  });
  [secretElements.detailDialog, secretElements.managerDialog].forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
  secretElements.form.addEventListener("submit", submitSecretBook);
  secretElements.cancelEdit.addEventListener("click", resetSecretForm);
  secretElements.form.elements.images.addEventListener("change", (event) => {
    secretElements.fileStatus.textContent = event.target.files.length
      ? `已选择 ${event.target.files.length} 张图片`
      : "支持 JPG、PNG、WEBP";
  });
  secretElements.exportButton.addEventListener("click", exportSecretPackage);
  secretElements.lockForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (new FormData(event.currentTarget).get("password") !== "aqua") {
      secretElements.lockError.hidden = false;
      event.currentTarget.elements.password.select();
      return;
    }
    unlockSecretPage();
  });
}

async function initializeSecret() {
  document.body.classList.toggle("manage-mode", SECRET_MANAGE_MODE);
  document.querySelector("#openSecretManager").hidden = !SECRET_MANAGE_MODE;
  bindSecretEvents();
  if (SECRET_MANAGE_MODE) resetSecretForm();

  const unlocked = sessionStorage.getItem(SECRET_UNLOCK_KEY) === "1";
  if (unlocked) {
    document.body.classList.remove("secret-locked");
  } else {
    document.body.classList.add("secret-locked");
    secretElements.lockDialog.showModal();
    setTimeout(() => secretElements.lockForm.elements.password.focus(), 40);
  }

  let published = [];
  try {
    const response = await fetch("data/secret-content.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Secret content request failed: ${response.status}`);
    const content = await response.json();
    published = Array.isArray(content.books) ? content.books : [];
  } catch (error) {
    if (location.protocol !== "file:") console.error(error);
  }

  if (SECRET_MANAGE_MODE) {
    try {
      const drafts = await getSecretDrafts();
      const items = new Map();
      const publishedIds = new Set(published.map((item) => item.id));
      published
        .filter((item) => !secretState.hiddenIds.has(item.id))
        .forEach((item) => items.set(item.id, { ...item, local: false, published: true }));
      drafts
        .sort((a, b) => b.createdAt - a.createdAt)
        .forEach((item) =>
          items.set(item.id, {
            ...item,
            published: item.published ?? publishedIds.has(item.id),
          }),
        );
      secretState.books = [...items.values()];
    } catch (error) {
      console.error(error);
      secretState.books = published;
      secretToast("本地草稿读取失败");
    }
  } else {
    secretState.books = published;
  }
  renderSecretBooks();
}

window.addEventListener("beforeunload", () => {
  secretState.objectUrls.forEach((url) => URL.revokeObjectURL(url));
});

initializeSecret();
