const DB_NAME = "aqua-manga-library";
const DB_VERSION = 1;
const HIDDEN_ITEMS_KEY = "aqua-manga-hidden-items";
const PLAYER_THEME_KEY = "aqua-manga-player-theme";
const MANGA_PAGE_SIZE = 8;
const RANDOM_DICE_SOUNDS = ["assets/sfx/dice-1.mp3", "assets/sfx/dice-2.mp3"];
const randomDiceAudio = RANDOM_DICE_SOUNDS.map((source) => {
  const audio = new Audio(source);
  audio.preload = "auto";
  audio.volume = 0.55;
  audio.load();
  return audio;
});
const IS_MANAGE_MODE =
  location.protocol === "file:" || new URLSearchParams(location.search).get("manage") === "1";

function readHiddenIds() {
  try {
    const value = JSON.parse(localStorage.getItem(HIDDEN_ITEMS_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

const state = {
  manga: [],
  music: [],
  mangaPage: 1,
  currentTrackIndex: -1,
  mode: "sequence",
  playerTheme: localStorage.getItem(PLAYER_THEME_KEY) || "navy",
  hiddenIds: new Set(readHiddenIds()),
  objectUrls: new Set(),
  objectUrlCache: new WeakMap(),
  currentAudioUrl: null,
};

const elements = {
  mangaView: document.querySelector("#mangaView"),
  musicView: document.querySelector("#musicView"),
  mangaGrid: document.querySelector("#mangaGrid"),
  musicList: document.querySelector("#musicList"),
  mangaEmpty: document.querySelector("#mangaEmpty"),
  mangaPagination: document.querySelector("#mangaPagination"),
  musicEmpty: document.querySelector("#musicEmpty"),
  mangaSearch: document.querySelector("#mangaSearch"),
  musicSearch: document.querySelector("#musicSearch"),
  mangaCount: document.querySelector("#mangaCount"),
  musicCount: document.querySelector("#musicCount"),
  mangaDialog: document.querySelector("#mangaDialog"),
  mangaDetail: document.querySelector("#mangaDetail"),
  editMangaDialog: document.querySelector("#editMangaDialog"),
  editMangaForm: document.querySelector("#editMangaForm"),
  secretGateDialog: document.querySelector("#secretGateDialog"),
  secretGateForm: document.querySelector("#secretGateForm"),
  secretGateError: document.querySelector("#secretGateError"),
  managerDialog: document.querySelector("#managerDialog"),
  mangaForm: document.querySelector("#mangaForm"),
  musicForm: document.querySelector("#musicForm"),
  libraryManager: document.querySelector("#libraryManager"),
  managerItems: document.querySelector("#managerItems"),
  publishPanel: document.querySelector("#publishPanel"),
  publishMangaCount: document.querySelector("#publishMangaCount"),
  publishMusicCount: document.querySelector("#publishMusicCount"),
  publishFileSize: document.querySelector("#publishFileSize"),
  publishError: document.querySelector("#publishError"),
  exportPackage: document.querySelector("#exportPackage"),
  audio: document.querySelector("#audioElement"),
  player: document.querySelector("#player"),
  playerCover: document.querySelector("#playerCover"),
  playerTitle: document.querySelector("#playerTitle"),
  playerArtist: document.querySelector("#playerArtist"),
  currentTime: document.querySelector("#currentTime"),
  duration: document.querySelector("#duration"),
  seekBar: document.querySelector("#seekBar"),
  volumeBar: document.querySelector("#volumeBar"),
  playMode: document.querySelector("#playMode"),
  togglePlay: document.querySelector("#togglePlay"),
  playerThemeMenu: document.querySelector("#playerThemeMenu"),
  playerThemeToggle: document.querySelector("#playerThemeToggle"),
  restorePlayer: document.querySelector("#restorePlayer"),
  toast: document.querySelector("#toast"),
  randomMangaButton: document.querySelector("#randomMangaButton"),
  randomRollOverlay: document.querySelector("#randomRollOverlay"),
};

let randomMangaRolling = false;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("manga")) {
        db.createObjectStore("manga", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("music")) {
        db.createObjectStore("music", { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbAction(storeName, mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = action(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

const getAll = (store) => dbAction(store, "readonly", (target) => target.getAll());
const saveItem = (store, item) => dbAction(store, "readwrite", (target) => target.put(item));
const removeItem = (store, id) => dbAction(store, "readwrite", (target) => target.delete(id));

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function makeObjectUrl(blob) {
  if (!blob) return "";
  const cachedUrl = state.objectUrlCache.get(blob);
  if (cachedUrl) return cachedUrl;
  const url = URL.createObjectURL(blob);
  state.objectUrlCache.set(blob, url);
  state.objectUrls.add(url);
  return url;
}

function mediaUrl(value) {
  if (!value) return "";
  return typeof value === "string" ? value : makeObjectUrl(value);
}

function revokeObjectUrls() {
  state.objectUrls.forEach((url) => URL.revokeObjectURL(url));
  state.objectUrls.clear();
}

function placeholderCover(item, compact = false) {
  const theme = item.coverTheme || "cover-blue";
  const shortTitle = escapeHtml(item.title);
  return `
    <div class="placeholder-cover ${theme}">
      <strong>${shortTitle}</strong>
      <small>${compact ? "AQUA MUSIC" : "AQUA MANGA COLLECTION"}</small>
    </div>
  `;
}

function coverMarkup(item, className = "") {
  const blob = item.images?.[0] || item.cover;
  if (blob) {
    return `<img class="${className}" src="${escapeHtml(mediaUrl(blob))}" alt="${escapeHtml(item.title)}封面" />`;
  }
  return placeholderCover(item, Boolean(item.demo));
}

function detailCoverMarkup(item) {
  const cover = item.images?.[0] || item.cover;
  if (!cover) return placeholderCover(item);
  const url = escapeHtml(mediaUrl(cover));
  const alt = escapeHtml(item.title);
  return `
    <img class="detail-cover-backdrop" src="${url}" alt="" aria-hidden="true" />
    <span class="detail-cover-tint" aria-hidden="true"></span>
    <img class="detail-cover-image" src="${url}" alt="${alt}封面" />
  `;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function createId(prefix) {
  const randomPart =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomPart}`;
}

function parsePublicUrls(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((url) => url.trim())
    .filter(Boolean)
    .map((url) => {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new TypeError(`不支持的网址协议：${parsed.protocol}`);
      }
      return parsed.href;
    });
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove("show"), 2400);
}

function updateCounts() {
  elements.mangaCount.textContent = state.manga.length;
  elements.musicCount.textContent = state.music.length;
}

function mangaPaginationItems(currentPage, totalPages) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages])]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  const items = [];

  pages.forEach((page, index) => {
    if (index > 0 && page - pages[index - 1] > 1) items.push("ellipsis");
    items.push(page);
  });
  return items;
}

function renderMangaPagination(totalItems, totalPages) {
  if (totalItems <= MANGA_PAGE_SIZE) {
    elements.mangaPagination.hidden = true;
    elements.mangaPagination.innerHTML = "";
    return;
  }

  const start = (state.mangaPage - 1) * MANGA_PAGE_SIZE + 1;
  const end = Math.min(state.mangaPage * MANGA_PAGE_SIZE, totalItems);
  const pages = mangaPaginationItems(state.mangaPage, totalPages);
  const arrow = (direction) =>
    direction === "previous"
      ? '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg>'
      : '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>';

  elements.mangaPagination.hidden = false;
  elements.mangaPagination.innerHTML = `
    <span class="pagination-range">${start}–${end} <i>/</i> ${totalItems}</span>
    <div class="pagination-controls">
      <button class="pagination-arrow" data-manga-page="${state.mangaPage - 1}" type="button"
        aria-label="上一页" ${state.mangaPage === 1 ? "disabled" : ""}>${arrow("previous")}</button>
      ${pages
        .map((page) =>
          page === "ellipsis"
            ? '<span class="pagination-ellipsis" aria-hidden="true">···</span>'
            : `<button class="pagination-page${page === state.mangaPage ? " active" : ""}"
                data-manga-page="${page}" type="button"
                aria-label="第 ${page} 页" ${page === state.mangaPage ? 'aria-current="page"' : ""}>${page}</button>`,
        )
        .join("")}
      <button class="pagination-arrow" data-manga-page="${state.mangaPage + 1}" type="button"
        aria-label="下一页" ${state.mangaPage === totalPages ? "disabled" : ""}>${arrow("next")}</button>
    </div>
  `;
}

function renderManga() {
  const query = elements.mangaSearch.value.trim().toLocaleLowerCase();
  const filtered = state.manga.filter((item) => {
    return [item.title, item.author, item.genre]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / MANGA_PAGE_SIZE));
  state.mangaPage = Math.min(Math.max(state.mangaPage, 1), totalPages);
  const pageStart = (state.mangaPage - 1) * MANGA_PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + MANGA_PAGE_SIZE);

  elements.mangaGrid.innerHTML = pageItems
    .map((item, index) => {
      const actualIndex = state.manga.findIndex((entry) => entry.id === item.id);
      return `
        <article class="manga-card" style="animation-delay:${index * 45}ms">
          <button class="manga-open" data-manga-id="${escapeHtml(item.id)}" type="button">
            <div class="manga-cover">
              ${coverMarkup(item)}
              <span class="manga-index">${String(actualIndex + 1).padStart(2, "0")}</span>
            </div>
            <div class="manga-info">
              <h3>${escapeHtml(item.title)}</h3>
              <p>
                <span>${escapeHtml(item.author)}</span>
                <span>${escapeHtml(item.genre || "未分类")}</span>
              </p>
            </div>
          </button>
          <button class="card-delete" data-delete-id="${escapeHtml(item.id)}" data-delete-kind="manga" type="button" title="删除《${escapeHtml(item.title)}》" aria-label="删除《${escapeHtml(item.title)}》">
            <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg>
          </button>
        </article>
      `;
    })
    .join("");

  elements.mangaEmpty.hidden = filtered.length > 0;
  renderMangaPagination(filtered.length, totalPages);
}

function renderMusic() {
  const query = elements.musicSearch.value.trim().toLocaleLowerCase();
  const filtered = state.music.filter((item) =>
    [item.title, item.artist, item.album].join(" ").toLocaleLowerCase().includes(query),
  );

  elements.musicList.innerHTML = filtered
    .map((item) => {
      const index = state.music.findIndex((track) => track.id === item.id);
      const playing = index === state.currentTrackIndex;
      const cover = item.cover
        ? `<img src="${escapeHtml(mediaUrl(item.cover))}" alt="" />`
        : `<span>${escapeHtml(item.title.slice(0, 1))}</span>`;
      return `
        <div class="music-row ${playing ? "playing" : ""}">
          <button class="music-row-main" data-track-id="${escapeHtml(item.id)}" type="button">
            <span class="track-number">${playing ? "♪" : String(index + 1).padStart(2, "0")}</span>
            <span class="track-main">
              <span class="track-cover ${item.coverTheme || ""}">${cover}</span>
              <span class="track-copy">
                <strong>${escapeHtml(item.title)}</strong>
                <span>${escapeHtml(item.artist)}</span>
              </span>
            </span>
            <span class="track-album">${escapeHtml(item.album || "Aqua 收藏")}</span>
            <span class="track-duration">${formatTime(item.duration)}</span>
          </button>
          <button class="track-delete" data-delete-id="${escapeHtml(item.id)}" data-delete-kind="music" type="button" title="删除 ${escapeHtml(item.title)}" aria-label="删除 ${escapeHtml(item.title)}">
            <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg>
          </button>
        </div>
      `;
    })
    .join("");

  elements.musicEmpty.hidden = filtered.length > 0;
}

function renderAll() {
  updateCounts();
  renderManga();
  renderMusic();
}

function openMangaDetail(id) {
  const item = state.manga.find((entry) => entry.id === id);
  if (!item) return;
  const index = state.manga.findIndex((entry) => entry.id === id);
  const screenshots = item.images?.slice(1) || [];

  elements.mangaDetail.innerHTML = `
    <div class="detail-layout">
      <div class="detail-cover">${detailCoverMarkup(item)}</div>
      <div class="detail-copy">
        <div class="detail-admin-row">
          <span class="detail-number">AQUA PICK · ${String(index + 1).padStart(2, "0")}</span>
          ${
            IS_MANAGE_MODE
              ? `
                <button class="detail-edit-button" data-edit-manga="${escapeHtml(item.id)}" type="button">
                  <svg viewBox="0 0 24 24"><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" /><path d="m13.5 7.5 3 3" /></svg>
                  编辑资料
                </button>
              `
              : ""
          }
        </div>
        <h2>${escapeHtml(item.title)}</h2>
        <p class="detail-author">作者 · ${escapeHtml(item.author)}</p>
        <span class="detail-genre">${escapeHtml(item.genre || "未分类")}</span>
        <p class="detail-description">${escapeHtml(item.description)}</p>
        ${item.quote ? `<blockquote class="detail-quote">${escapeHtml(item.quote)}</blockquote>` : ""}
        ${
          screenshots.length
            ? `
              <h3 class="screenshot-title">作品截图 · ${screenshots.length}</h3>
              <div class="screenshot-strip">
                ${screenshots
                  .map(
                    (image, imageIndex) =>
                      `<img src="${escapeHtml(mediaUrl(image))}" data-screenshot-index="${imageIndex + 1}" alt="${escapeHtml(item.title)}截图 ${imageIndex + 1}" />`,
                  )
                  .join("")}
              </div>
            `
            : ""
        }
      </div>
    </div>
  `;
  if (!elements.mangaDialog.open) elements.mangaDialog.showModal();
}

function playRandomDiceSound() {
  const audio = randomDiceAudio[Math.floor(Math.random() * randomDiceAudio.length)];
  audio.pause();
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

function setRandomDieFace(overlay, value) {
  const positions = {
    1: ["center"],
    2: ["top-left", "bottom-right"],
    3: ["top-left", "center", "bottom-right"],
    4: ["top-left", "top-right", "bottom-left", "bottom-right"],
    5: ["top-left", "top-right", "center", "bottom-left", "bottom-right"],
    6: ["top-left", "top-right", "middle-left", "middle-right", "bottom-left", "bottom-right"],
  };
  const die = overlay.querySelector(".random-roll-die");
  die.innerHTML = positions[value].map((position) => `<span class="${position}"></span>`).join("");
  die.dataset.value = value;
}

async function animateRandomDieFaces(overlay) {
  const delays = [150, 190, 240, 310, 390];
  let current = Number(overlay.querySelector(".random-roll-die").dataset.value) || 1;

  for (const delay of delays) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    let next = Math.floor(Math.random() * 6) + 1;
    if (next === current) next = (next % 6) + 1;
    current = next;
    setRandomDieFace(overlay, current);
  }

  await new Promise((resolve) => setTimeout(resolve, 320));
}

function finishRandomRoll(overlay) {
  overlay.classList.remove("is-rolling", "is-revealing");
  overlay.hidden = true;
}

async function rollRandomManga() {
  if (randomMangaRolling) return;
  if (!state.manga.length) {
    showToast("漫画收藏还是空的");
    return;
  }

  randomMangaRolling = true;
  elements.randomMangaButton.disabled = true;
  playRandomDiceSound();
  elements.randomRollOverlay.hidden = false;
  elements.randomRollOverlay.classList.remove("is-revealing");
  setRandomDieFace(elements.randomRollOverlay, Math.floor(Math.random() * 6) + 1);
  void elements.randomRollOverlay.offsetWidth;
  elements.randomRollOverlay.classList.add("is-rolling");

  const item = state.manga[Math.floor(Math.random() * state.manga.length)];
  await animateRandomDieFaces(elements.randomRollOverlay);
  elements.randomRollOverlay.classList.add("is-revealing");
  await new Promise((resolve) => setTimeout(resolve, 320));
  finishRandomRoll(elements.randomRollOverlay);
  openMangaDetail(item.id);
  elements.randomMangaButton.disabled = false;
  randomMangaRolling = false;
}

function openMangaEditor(id) {
  if (!IS_MANAGE_MODE) return;
  const item = state.manga.find((entry) => entry.id === id);
  if (!item) return;
  const form = elements.editMangaForm;
  form.elements.id.value = item.id;
  form.elements.title.value = item.title || "";
  form.elements.author.value = item.author || "";
  form.elements.genre.value = item.genre || "";
  form.elements.quote.value = item.quote || "";
  form.elements.description.value = item.description || "";
  elements.editMangaDialog.showModal();
}

async function submitMangaEdit(event) {
  event.preventDefault();
  if (!IS_MANAGE_MODE) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const id = data.get("id");
  const index = state.manga.findIndex((item) => item.id === id);
  if (index < 0) {
    showToast("没有找到需要修改的漫画");
    return;
  }

  const button = form.querySelector(".submit-button");
  const label = button.querySelector("span");
  button.disabled = true;
  label.textContent = "正在保存修改...";
  try {
    const current = state.manga[index];
    const updated = {
      ...current,
      title: data.get("title").trim(),
      author: data.get("author").trim(),
      genre: data.get("genre").trim() || "其他",
      quote: data.get("quote").trim(),
      description: data.get("description").trim(),
      images: current.images || [],
      local: true,
      published: current.published ?? !current.local,
      createdAt: current.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    await saveItem("manga", updated);
    state.manga[index] = updated;
    renderAll();
    openMangaDetail(id);
    elements.editMangaDialog.close();
    showToast("漫画资料已保存，封面和截图保持不变");
  } catch (error) {
    console.error(error);
    showToast("修改保存失败，请检查浏览器存储空间");
  } finally {
    button.disabled = false;
    label.textContent = "保存修改";
  }
}

function switchView(view) {
  const isManga = view === "manga";
  elements.mangaView.hidden = !isManga;
  elements.musicView.hidden = isManga;
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  document.querySelector(isManga ? "#mangaView" : "#musicView").scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function switchManagerForm(formName) {
  document.querySelectorAll(".manager-tabs button").forEach((button) => {
    button.classList.toggle("active", button.dataset.form === formName);
  });
  elements.mangaForm.hidden = formName !== "manga";
  elements.musicForm.hidden = formName !== "music";
  elements.libraryManager.hidden = formName !== "library";
  elements.publishPanel.hidden = formName !== "publish";
  if (formName === "library") renderManagerItems();
  if (formName === "publish") updatePublishSummary();
}

function renderManagerItems() {
  const items = [
    ...state.manga.map((item) => ({ ...item, kind: "manga" })),
    ...state.music.map((item) => ({ ...item, kind: "music" })),
  ];

  elements.managerItems.innerHTML = items.length
    ? items
        .map((item) => {
          const image = item.images?.[0] || item.cover;
          return `
            <div class="manager-item">
              <div class="manager-thumb">
                ${image ? `<img src="${escapeHtml(mediaUrl(image))}" alt="" />` : escapeHtml(item.title.slice(0, 1))}
              </div>
              <div>
                <strong>${escapeHtml(item.title)}</strong>
                <span>${item.kind === "manga" ? "漫画" : "音乐"} · ${escapeHtml(item.author || item.artist)}</span>
              </div>
              <button class="delete-button" data-delete-id="${escapeHtml(item.id)}" data-delete-kind="${item.kind}" type="button">移除</button>
            </div>
          `;
        })
        .join("")
    : `<div class="empty-state"><span>空</span><h3>收藏已经清空</h3><p>新上传的漫画和音乐会显示在这里。</p></div>`;
}

async function deleteLibraryItem(kind, id) {
  if (!IS_MANAGE_MODE) return;
  const collection = kind === "manga" ? state.manga : state.music;
  const item = collection.find((entry) => entry.id === id);
  if (!item) return;
  if (!confirm(`确定删除“${item.title}”吗？`)) return;

  if (item.local) await removeItem(kind, id);
  if (item.published || !item.local) {
    state.hiddenIds.add(id);
    localStorage.setItem(HIDDEN_ITEMS_KEY, JSON.stringify([...state.hiddenIds]));
  }

  if (kind === "manga") {
    state.manga = state.manga.filter((item) => item.id !== id);
  } else {
    const removedIndex = state.music.findIndex((item) => item.id === id);
    state.music = state.music.filter((item) => item.id !== id);
    if (removedIndex === state.currentTrackIndex) {
      elements.audio.pause();
      elements.audio.removeAttribute("src");
      state.currentTrackIndex = -1;
      resetPlayer();
    } else if (removedIndex < state.currentTrackIndex) {
      state.currentTrackIndex -= 1;
    }
  }
  renderAll();
  renderManagerItems();
  showToast("收藏已移除");
}

function updatePublishSummary() {
  const addedBytes = [...state.manga, ...state.music].reduce((total, item) => {
    const imageBytes = (item.images || []).reduce(
      (sum, image) => sum + (typeof image === "string" ? 0 : image.size || 0),
      0,
    );
    const coverBytes =
      item.cover && typeof item.cover !== "string" ? item.cover.size || 0 : 0;
    const audioBytes =
      item.audio && typeof item.audio !== "string" ? item.audio.size || 0 : 0;
    return total + imageBytes + coverBytes + audioBytes;
  }, 0);
  elements.publishMangaCount.textContent = state.manga.length;
  elements.publishMusicCount.textContent = state.music.length;
  elements.publishFileSize.textContent =
    addedBytes < 1024 * 1024
      ? `${(addedBytes / 1024).toFixed(0)} KB`
      : `${(addedBytes / 1024 / 1024).toFixed(1)} MB`;
}

function safeFilePart(value) {
  return String(value)
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "file";
}

function fileExtension(file, fallback) {
  const nameExtension = file?.name?.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1];
  if (nameExtension) return nameExtension.toLowerCase();
  const mimeExtension = file?.type?.split("/")[1]?.split(";")[0];
  return safeFilePart(mimeExtension || fallback);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function updateCrc32(crc, bytes) {
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return crc;
}

async function crc32Data(data) {
  if (data instanceof Uint8Array) return crc32(data);
  if (!(data instanceof Blob)) {
    throw new TypeError("文件数据不是浏览器可读取的 Blob");
  }

  let crc = 0xffffffff;
  if (data.stream) {
    const reader = data.stream().getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      crc = updateCrc32(crc, value);
    }
  } else {
    const chunkSize = 4 * 1024 * 1024;
    for (let offset = 0; offset < data.size; offset += chunkSize) {
      const chunk = new Uint8Array(
        await data.slice(offset, Math.min(offset + chunkSize, data.size)).arrayBuffer(),
      );
      crc = updateCrc32(crc, chunk);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipRecord(size) {
  return new Uint8Array(size);
}

function writeUint16(target, offset, value) {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint16(
    offset,
    value,
    true,
  );
}

function writeUint32(target, offset, value) {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint32(
    offset,
    value,
    true,
  );
}

async function createZip(entries) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name.replaceAll("\\", "/"));
    const data = entry.data;
    const size = data instanceof Uint8Array ? data.byteLength : data?.size;
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new TypeError(`无法读取文件：${entry.name}`);
    }
    if (size > 0xffffffff) {
      throw new RangeError(`文件超过 ZIP 格式上限：${entry.name}`);
    }
    let checksum;
    try {
      checksum = await crc32Data(data);
    } catch (error) {
      throw new Error(`读取“${entry.name}”失败：${error.message}`, { cause: error });
    }
    const local = zipRecord(30 + name.length);
    writeUint32(local, 0, 0x04034b50);
    writeUint16(local, 4, 20);
    writeUint16(local, 6, 0x0800);
    writeUint16(local, 8, 0);
    writeUint32(local, 14, checksum);
    writeUint32(local, 18, size);
    writeUint32(local, 22, size);
    writeUint16(local, 26, name.length);
    local.set(name, 30);
    localParts.push(local, data);

    const central = zipRecord(46 + name.length);
    writeUint32(central, 0, 0x02014b50);
    writeUint16(central, 4, 20);
    writeUint16(central, 6, 20);
    writeUint16(central, 8, 0x0800);
    writeUint16(central, 10, 0);
    writeUint32(central, 16, checksum);
    writeUint32(central, 20, size);
    writeUint32(central, 24, size);
    writeUint16(central, 28, name.length);
    writeUint32(central, 42, offset);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length + size;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = zipRecord(22);
  writeUint32(end, 0, 0x06054b50);
  writeUint16(end, 8, entries.length);
  writeUint16(end, 10, entries.length);
  writeUint32(end, 12, centralSize);
  writeUint32(end, 16, offset);
  return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
}

async function buildPublishPackage() {
  const entries = [];
  const publishedManga = [];
  const publishedMusic = [];

  for (const item of state.manga) {
    const published = {
      id: item.id,
      title: item.title,
      author: item.author,
      genre: item.genre || "其他",
      quote: item.quote || "",
      description: item.description || "",
      coverTheme: item.coverTheme || "",
      images: [],
    };
    for (let index = 0; index < (item.images || []).length; index += 1) {
      const image = item.images[index];
      if (typeof image === "string") {
        published.images.push(image);
      } else {
        const path = `assets/manga/${safeFilePart(item.id)}-${String(index + 1).padStart(2, "0")}.${fileExtension(image, "jpg")}`;
        entries.push({ name: path, data: image });
        published.images.push(path);
      }
    }
    publishedManga.push(published);
  }

  for (const item of state.music) {
    const published = {
      id: item.id,
      title: item.title,
      artist: item.artist,
      album: item.album || "Aqua 收藏",
      duration: item.duration || 0,
      coverTheme: item.coverTheme || "",
      demo: Boolean(item.demo),
      cover: "",
      audio: "",
    };
    if (item.cover) {
      if (typeof item.cover === "string") {
        published.cover = item.cover;
      } else {
        published.cover = `assets/music/${safeFilePart(item.id)}-cover.${fileExtension(item.cover, "jpg")}`;
        entries.push({ name: published.cover, data: item.cover });
      }
    }
    if (item.audio) {
      if (typeof item.audio === "string") {
        published.audio = item.audio;
      } else {
        published.audio = `assets/music/${safeFilePart(item.id)}.${fileExtension(item.audio, "mp3")}`;
        entries.push({ name: published.audio, data: item.audio });
      }
    }
    publishedMusic.push(published);
  }

  const content = {
    version: 1,
    generatedAt: new Date().toISOString(),
    manga: publishedManga,
    music: publishedMusic,
  };
  entries.unshift({
    name: "data/content.json",
    data: new TextEncoder().encode(JSON.stringify(content, null, 2)),
  });
  entries.push({
    name: "发布说明.txt",
    data: new TextEncoder().encode(
      "将压缩包内的 data 和 assets 文件夹复制到 Aqua Manga 网站仓库根目录，覆盖同名文件，然后提交并推送到 GitHub。\r\n",
    ),
  });
  return createZip(entries);
}

async function exportPublishPackage() {
  const button = elements.exportPackage;
  const label = button.querySelector("span");
  button.disabled = true;
  label.textContent = "正在整理发布文件...";
  elements.publishError.hidden = true;
  elements.publishError.textContent = "";
  try {
    const packageBlob = await buildPublishPackage();
    const url = URL.createObjectURL(packageBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `aqua-manga-publish-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("发布包已生成");
  } catch (error) {
    console.error(error);
    const detail =
      error?.message ||
      (error?.name === "QuotaExceededError"
        ? "浏览器存储空间不足"
        : "浏览器无法读取某个上传文件");
    elements.publishError.textContent = `生成失败：${detail}。请刷新管理页面后重试；如果仍失败，请检查音乐文件是否过大。`;
    elements.publishError.hidden = false;
    showToast("发布包生成失败，详情已显示在按钮下方");
  } finally {
    button.disabled = false;
    label.textContent = "下载 aqua-manga-publish.zip";
  }
}

function applyPlayerTheme(theme) {
  const validThemes = ["navy", "aqua", "pink", "glass"];
  state.playerTheme = validThemes.includes(theme) ? theme : "navy";
  elements.player.classList.remove("theme-aqua", "theme-pink", "theme-glass");
  if (state.playerTheme !== "navy") {
    elements.player.classList.add(`theme-${state.playerTheme}`);
  }
  elements.playerThemeMenu.querySelectorAll("[data-player-theme]").forEach((button) => {
    button.classList.toggle("active", button.dataset.playerTheme === state.playerTheme);
  });
  localStorage.setItem(PLAYER_THEME_KEY, state.playerTheme);
}

async function readAudioDuration(file) {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const isRemoteUrl = typeof file === "string";
    const url = isRemoteUrl ? file : URL.createObjectURL(file);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
      if (!isRemoteUrl) URL.revokeObjectURL(url);
    };
    audio.onerror = () => {
      resolve(0);
      if (!isRemoteUrl) URL.revokeObjectURL(url);
    };
    audio.src = url;
  });
}

function setButtonBusy(form, busy) {
  const button = form.querySelector(".submit-button");
  button.disabled = busy;
  button.querySelector("span").textContent = busy ? "正在保存..." : form === elements.mangaForm ? "保存漫画收藏" : "保存音乐收藏";
}

async function submitManga(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  let imageUrls;
  try {
    imageUrls = parsePublicUrls(formData.get("imageUrls"));
  } catch (error) {
    showToast(`腾讯云 COS 图片网址有误：${error.message}`);
    return;
  }
  const imageFiles = formData.getAll("images").filter((file) => file.size > 0);
  const images = [...imageUrls, ...imageFiles];
  if (!images.length) {
    showToast("请填写腾讯云 COS 图片网址或选择本地图片");
    return;
  }

  setButtonBusy(form, true);
  try {
    const item = {
      id: createId("manga"),
      title: formData.get("title").trim(),
      author: formData.get("author").trim(),
      genre: formData.get("genre").trim() || "其他",
      quote: formData.get("quote").trim(),
      description: formData.get("description").trim(),
      images,
      local: true,
      published: false,
      createdAt: Date.now(),
    };
    await saveItem("manga", item);
    state.manga.unshift(item);
    state.mangaPage = 1;
    form.reset();
    document.querySelector("#mangaFileStatus").textContent = "支持 JPG、PNG、WEBP";
    renderAll();
    elements.managerDialog.close();
    switchView("manga");
    showToast("漫画已加入 Aqua 收藏");
  } catch (error) {
    console.error(error);
    showToast("保存失败，文件可能过大或存储空间不足");
  } finally {
    setButtonBusy(form, false);
  }
}

async function submitMusic(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const audioFile = formData.get("audio");
  const coverFile = formData.get("cover");
  let audioUrl = "";
  let coverUrl = "";
  try {
    audioUrl = parsePublicUrls(formData.get("audioUrl"))[0] || "";
    coverUrl = parsePublicUrls(formData.get("coverUrl"))[0] || "";
  } catch (error) {
    showToast(`腾讯云 COS 资源网址有误：${error.message}`);
    return;
  }
  const audio = audioUrl || (audioFile?.size ? audioFile : null);
  const cover = coverUrl || (coverFile?.size ? coverFile : null);
  if (!audio) {
    showToast("请填写腾讯云 COS 音乐网址或选择本地音乐文件");
    return;
  }

  setButtonBusy(form, true);
  try {
    const item = {
      id: createId("music"),
      title: formData.get("title").trim(),
      artist: formData.get("artist").trim(),
      album: formData.get("album").trim() || "Aqua 收藏",
      cover,
      audio,
      duration: await readAudioDuration(audio),
      local: true,
      createdAt: Date.now(),
    };
    await saveItem("music", item);
    state.music.unshift(item);
    if (state.currentTrackIndex >= 0) state.currentTrackIndex += 1;
    form.reset();
    document.querySelector("#musicFileStatus").textContent = "支持 MP3、WAV、OGG、M4A";
    renderAll();
    elements.managerDialog.close();
    switchView("music");
    showToast("音乐已加入播放列表");
  } catch (error) {
    console.error(error);
    showToast("保存失败，文件可能过大或存储空间不足");
  } finally {
    setButtonBusy(form, false);
  }
}

function createDemoWave(trackIndex) {
  const sampleRate = 8000;
  const duration = 18;
  const length = sampleRate * duration;
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  const notes = [
    [220, 277, 330, 415],
    [196, 247, 294, 370],
    [174, 220, 261, 330],
  ][trackIndex % 3];

  const writeString = (offset, value) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, length * 2, true);

  for (let i = 0; i < length; i += 1) {
    const time = i / sampleRate;
    const noteIndex = Math.floor(time / 2.25) % notes.length;
    const frequency = notes[noteIndex];
    const pulse = (time % 2.25) / 2.25;
    const envelope = Math.min(pulse * 8, 1) * Math.max(0, 1 - pulse * 0.7);
    const base = Math.sin(2 * Math.PI * frequency * time) * 0.23;
    const high = Math.sin(2 * Math.PI * frequency * 1.5 * time) * 0.08;
    const shimmer = Math.sin(2 * Math.PI * (frequency * 2) * time) * 0.025;
    const sample = Math.max(-1, Math.min(1, (base + high + shimmer) * envelope));
    view.setInt16(44 + i * 2, sample * 0x7fff, true);
  }

  return URL.createObjectURL(new Blob([view], { type: "audio/wav" }));
}

function setPlayerCover(track) {
  elements.playerCover.className = `player-cover ${track.coverTheme || ""}`;
  if (track.cover) {
    elements.playerCover.innerHTML = `<img src="${escapeHtml(mediaUrl(track.cover))}" alt="" />`;
  } else {
    elements.playerCover.innerHTML = `<span>${escapeHtml(track.title.slice(0, 1))}</span>`;
  }
}

async function playTrack(index, autoplay = true) {
  if (!state.music.length) {
    showToast("先上传一首音乐吧");
    return;
  }

  const normalizedIndex = (index + state.music.length) % state.music.length;
  const track = state.music[normalizedIndex];
  state.currentTrackIndex = normalizedIndex;

  if (state.currentAudioUrl) {
    URL.revokeObjectURL(state.currentAudioUrl);
    state.currentAudioUrl = null;
  }

  const source = track.demo
    ? createDemoWave(normalizedIndex)
    : typeof track.audio === "string"
      ? track.audio
      : URL.createObjectURL(track.audio);
  state.currentAudioUrl = typeof track.audio === "string" ? null : source;
  elements.audio.src = source;
  elements.playerTitle.textContent = track.title;
  elements.playerArtist.textContent = `${track.artist} · ${track.album || "Aqua 收藏"}`;
  elements.duration.textContent = formatTime(track.duration);
  setPlayerCover(track);
  renderMusic();

  if (autoplay) {
    try {
      await elements.audio.play();
    } catch (error) {
      console.error(error);
      showToast("浏览器暂时无法播放这个文件");
    }
  }
}

function resetPlayer() {
  elements.playerTitle.textContent = "从音乐收藏中选择歌曲";
  elements.playerArtist.textContent = "Aqua Manga Radio";
  elements.playerCover.className = "player-cover";
  elements.playerCover.innerHTML = "<span>♪</span>";
  elements.currentTime.textContent = "0:00";
  elements.duration.textContent = "0:00";
  elements.seekBar.value = 0;
  elements.seekBar.style.setProperty("--range-progress", "0%");
  elements.player.classList.remove("is-playing");
}

function nextTrack(direction = 1, fromEnded = false) {
  if (!state.music.length) return;
  if (state.mode === "repeat" && fromEnded) {
    elements.audio.currentTime = 0;
    elements.audio.play();
    return;
  }

  let nextIndex;
  if (state.mode === "shuffle" && state.music.length > 1) {
    do {
      nextIndex = Math.floor(Math.random() * state.music.length);
    } while (nextIndex === state.currentTrackIndex);
  } else {
    nextIndex = state.currentTrackIndex < 0 ? 0 : state.currentTrackIndex + direction;
  }
  playTrack(nextIndex);
}

function cycleMode() {
  const modes = ["sequence", "repeat", "shuffle"];
  state.mode = modes[(modes.indexOf(state.mode) + 1) % modes.length];
  const labels = {
    sequence: "顺序播放",
    repeat: "单曲循环",
    shuffle: "随机播放",
  };
  const icons = {
    sequence: '<path d="M4 7h13l3 3-3 3M4 17h9" />',
    repeat:
      '<path d="M17 2l3 3-3 3M3 11V9a4 4 0 0 1 4-4h13M7 22l-3-3 3-3M21 13v2a4 4 0 0 1-4 4H4" /><path d="M12 9v6" />',
    shuffle:
      '<path d="M18 4l3 3-3 3M3 7h3c5 0 7 10 12 10h3M18 14l3 3-3 3M3 17h3c1.5 0 2.7-.9 3.8-2.2" />',
  };
  elements.playMode.title = labels[state.mode];
  elements.playMode.innerHTML = `<svg viewBox="0 0 24 24">${icons[state.mode]}</svg>`;
  showToast(labels[state.mode]);
}

function bindEvents() {
  elements.randomMangaButton.addEventListener("click", rollRandomManga);

  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  document.querySelector("#openManager").addEventListener("click", () => {
    if (!IS_MANAGE_MODE) return;
    switchManagerForm("manga");
    elements.managerDialog.showModal();
  });

  document.querySelectorAll(".manager-tabs button").forEach((button) => {
    button.addEventListener("click", () => switchManagerForm(button.dataset.form));
  });

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => elements.mangaDialog.close());
  });

  document.querySelectorAll("[data-close-manager]").forEach((button) => {
    button.addEventListener("click", () => elements.managerDialog.close());
  });

  document.querySelectorAll("[data-close-edit]").forEach((button) => {
    button.addEventListener("click", () => elements.editMangaDialog.close());
  });

  document.querySelectorAll("[data-close-secret-gate]").forEach((button) => {
    button.addEventListener("click", () => elements.secretGateDialog.close());
  });

  [
    elements.mangaDialog,
    elements.editMangaDialog,
    elements.secretGateDialog,
    elements.managerDialog,
  ].forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  document.querySelector("#openSecretGate").addEventListener("click", () => {
    elements.secretGateForm.reset();
    elements.secretGateError.hidden = true;
    elements.secretGateDialog.showModal();
    setTimeout(() => elements.secretGateForm.elements.password.focus(), 40);
  });

  elements.secretGateForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password");
    if (password !== "aqua") {
      elements.secretGateError.hidden = false;
      event.currentTarget.elements.password.select();
      return;
    }
    sessionStorage.setItem("aqua-secret-unlocked", "1");
    location.href = `secret.html${IS_MANAGE_MODE ? "?manage=1" : ""}`;
  });

  elements.mangaSearch.addEventListener("input", () => {
    state.mangaPage = 1;
    renderManga();
  });
  elements.musicSearch.addEventListener("input", renderMusic);

  elements.mangaPagination.addEventListener("click", (event) => {
    const button = event.target.closest("[data-manga-page]");
    if (!button || button.disabled) return;
    state.mangaPage = Number(button.dataset.mangaPage);
    renderManga();
    elements.mangaGrid.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  elements.mangaGrid.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-id]");
    if (deleteButton) {
      deleteLibraryItem(deleteButton.dataset.deleteKind, deleteButton.dataset.deleteId);
      return;
    }
    const card = event.target.closest("[data-manga-id]");
    if (card) openMangaDetail(card.dataset.mangaId);
  });

  elements.mangaDetail.addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-manga]");
    if (button) openMangaEditor(button.dataset.editManga);
  });

  elements.musicList.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-id]");
    if (deleteButton) {
      deleteLibraryItem(deleteButton.dataset.deleteKind, deleteButton.dataset.deleteId);
      return;
    }
    const row = event.target.closest("[data-track-id]");
    if (!row) return;
    const index = state.music.findIndex((track) => track.id === row.dataset.trackId);
    playTrack(index);
  });

  elements.managerItems.addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-id]");
    if (button) deleteLibraryItem(button.dataset.deleteKind, button.dataset.deleteId);
  });

  elements.mangaForm.addEventListener("submit", submitManga);
  elements.editMangaForm.addEventListener("submit", submitMangaEdit);
  elements.musicForm.addEventListener("submit", submitMusic);
  elements.exportPackage.addEventListener("click", exportPublishPackage);

  const mangaInput = elements.mangaForm.querySelector('[name="images"]');
  mangaInput.addEventListener("change", () => {
    document.querySelector("#mangaFileStatus").textContent = mangaInput.files.length
      ? `已选择 ${mangaInput.files.length} 张图片`
      : "支持 JPG、PNG、WEBP";
  });

  const audioInput = elements.musicForm.querySelector('[name="audio"]');
  audioInput.addEventListener("change", () => {
    document.querySelector("#musicFileStatus").textContent = audioInput.files[0]
      ? `已选择 ${audioInput.files[0].name}`
      : "支持 MP3、WAV、OGG、M4A";
  });

  document.querySelector("#playAll").addEventListener("click", () => playTrack(0));
  document.querySelector("#prevTrack").addEventListener("click", () => nextTrack(-1));
  document.querySelector("#nextTrack").addEventListener("click", () => nextTrack(1));
  elements.playMode.addEventListener("click", cycleMode);
  elements.playerThemeToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    elements.playerThemeMenu.hidden = !elements.playerThemeMenu.hidden;
  });
  elements.playerThemeMenu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-player-theme]");
    if (!button) return;
    applyPlayerTheme(button.dataset.playerTheme);
    elements.playerThemeMenu.hidden = true;
    showToast(`播放器外观已切换为${button.textContent.trim()}`);
  });
  document.addEventListener("click", (event) => {
    if (!elements.player.contains(event.target)) elements.playerThemeMenu.hidden = true;
  });

  elements.togglePlay.addEventListener("click", () => {
    if (state.currentTrackIndex < 0) {
      playTrack(0);
    } else if (elements.audio.paused) {
      elements.audio.play();
    } else {
      elements.audio.pause();
    }
  });

  elements.audio.addEventListener("play", () => elements.player.classList.add("is-playing"));
  elements.audio.addEventListener("pause", () => elements.player.classList.remove("is-playing"));
  elements.audio.addEventListener("ended", () => nextTrack(1, true));
  elements.audio.addEventListener("loadedmetadata", () => {
    elements.duration.textContent = formatTime(elements.audio.duration);
  });
  elements.audio.addEventListener("timeupdate", () => {
    const progress = elements.audio.duration
      ? (elements.audio.currentTime / elements.audio.duration) * 100
      : 0;
    elements.seekBar.value = progress;
    elements.seekBar.style.setProperty("--range-progress", `${progress}%`);
    elements.currentTime.textContent = formatTime(elements.audio.currentTime);
  });

  elements.seekBar.addEventListener("input", () => {
    if (!elements.audio.duration) return;
    elements.audio.currentTime = (Number(elements.seekBar.value) / 100) * elements.audio.duration;
  });

  elements.volumeBar.addEventListener("input", () => {
    elements.audio.volume = Number(elements.volumeBar.value);
    elements.volumeBar.style.setProperty("--range-progress", `${Number(elements.volumeBar.value) * 100}%`);
  });

  document.querySelector("#minimizePlayer").addEventListener("click", () => {
    elements.player.classList.add("minimized");
    elements.restorePlayer.hidden = false;
  });

  elements.restorePlayer.addEventListener("click", () => {
    elements.player.classList.remove("minimized");
    elements.restorePlayer.hidden = true;
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      switchView("manga");
      elements.mangaSearch.focus();
    }
  });

  window.addEventListener("beforeunload", () => {
    revokeObjectUrls();
    if (state.currentAudioUrl) URL.revokeObjectURL(state.currentAudioUrl);
  });
}

async function initialize() {
  document.body.classList.toggle("manage-mode", IS_MANAGE_MODE);
  document.querySelector("#openManager").hidden = !IS_MANAGE_MODE;
  document.querySelector("#currentYear").textContent = new Date().getFullYear();
  document.querySelector(".search-box kbd").textContent = /Mac|iPhone|iPad/.test(
    navigator.platform,
  )
    ? "⌘ K"
    : "Ctrl K";
  elements.audio.volume = 0.45;
  elements.volumeBar.style.setProperty("--range-progress", "45%");
  bindEvents();
  applyPlayerTheme(state.playerTheme);

  let publishedManga = [];
  let publishedMusic = [];
  try {
    const response = await fetch("data/content.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Content request failed: ${response.status}`);
    const content = await response.json();
    publishedManga = Array.isArray(content.manga) ? content.manga : [];
    publishedMusic = Array.isArray(content.music) ? content.music : [];
  } catch (error) {
    if (location.protocol !== "file:") console.error(error);
  }

  if (IS_MANAGE_MODE) {
    try {
      const [savedManga, savedMusic] = await Promise.all([getAll("manga"), getAll("music")]);
      const mergeItems = (drafts, published) => {
        const items = new Map();
        const publishedIds = new Set(published.map((item) => item.id));
        published
          .filter((item) => !state.hiddenIds.has(item.id))
          .forEach((item) =>
            items.set(item.id, { ...item, local: false, published: true }),
          );
        drafts
          .sort((a, b) => b.createdAt - a.createdAt)
          .forEach((item) =>
            items.set(item.id, {
              ...item,
              published: item.published ?? publishedIds.has(item.id),
            }),
          );
        return [...items.values()];
      };
      state.manga = mergeItems(savedManga, publishedManga);
      state.music = mergeItems(savedMusic, publishedMusic);
    } catch (error) {
      console.error(error);
      state.manga = publishedManga;
      state.music = publishedMusic;
      showToast("浏览器本地存储不可用，上传内容可能无法保存");
    }
  } else {
    state.manga = publishedManga;
    state.music = publishedMusic;
  }

  renderAll();
}

initialize();
