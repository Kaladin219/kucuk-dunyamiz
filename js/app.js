"use strict";

/* =========================================
   SUPABASE BAĞLANTISI
========================================= */

const SUPABASE_URL = "https://mghcpqjzqbqulhramagj.supabase.co";
const SUPABASE_KEY = "sb_publishable_7mwv1NmSrp0Fzd8Trj5k2A_8kGuj1bV";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const PHOTO_BUCKET = "couple-memories";

/* =========================================
   HTML ELEMANLARI
========================================= */

const scene = document.getElementById("scene");
const pull = document.getElementById("pull");
const pullHint = document.getElementById("pullHint");
const openingLamp = document.getElementById("openingLamp");
const romanticMessage = document.getElementById("romanticMessage");

const login = document.getElementById("login");
const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const togglePassword = document.getElementById("togglePassword");
const forgotPassword = document.getElementById("forgotPassword");
const authMessage = document.getElementById("authMessage");

const resetSection = document.getElementById("resetSection");
const resetForm = document.getElementById("resetForm");

const dashboard = document.getElementById("dashboard");
const logoutButton = document.getElementById("logout");
const accountSettingsForm = document.getElementById("accountSettingsForm");
const settingsUsernameInput = document.getElementById("settingsUsername");
const settingsPasswordInput = document.getElementById("settingsPassword");
const settingsPasswordConfirmInput = document.getElementById("settingsPasswordConfirm");
const accountSettingsMessage = document.getElementById("accountSettingsMessage");

const userName = document.getElementById("userName");
const coupleNames = document.getElementById("coupleNames");
const partnerStatus = document.getElementById("partnerStatus");

const lettersList = document.getElementById("lettersList");
const memoriesList = document.getElementById("memoriesList");
const photosList = document.getElementById("photosList");
const musicList = document.getElementById("musicList");
const backgroundMusicSelect = document.getElementById("backgroundMusicSelect");
const backgroundMusicStatus = document.getElementById("backgroundMusicStatus");
const backgroundMusicPlayer = document.getElementById("backgroundMusicPlayer");
const notificationsList = document.getElementById("notificationsList");
const notificationBadge = document.getElementById("notificationBadge");
const favoritesList = document.getElementById("favoritesList");
const specialDaysList = document.getElementById("specialDaysList");
const globalSearch = document.getElementById("globalSearch");
const typeFilter = document.getElementById("typeFilter");
const dateFilter = document.getElementById("dateFilter");

const letterForm = document.getElementById("letterForm");
const memoryForm = document.getElementById("memoryForm");
const photoForm = document.getElementById("photoForm");
const musicForm = document.getElementById("musicForm");
const specialDayForm = document.getElementById("specialDayForm");

const toast = document.getElementById("toast");

/* =========================================
   UYGULAMA DURUMU
========================================= */

let currentUser = null;
let currentProfile = null;
let lampIsOn = false;
let messageIndex = 0;
let messageTimer = null;
let messageChangeTimer = null;
let toastTimer = null;
let partnerProfile = null;
let backgroundMusicChannel = null;
let availableMusicRows = [];
let specialDayReminderFunctionAvailable = false;
let favoriteRows = [];
const favoriteCatalog = new Map();

/* =========================================
   YARDIMCI FONKSİYONLAR
========================================= */

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };

    return entities[character];
  });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

function formatDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function isFutureDelivery(value) {
  if (!value) return false;
  const date = String(value).slice(0, 10);
  return date > getLocalDate();
}

function getLocalDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();

  return new Date(now.getTime() - offset * 60000)
    .toISOString()
    .slice(0, 10);
}

function setFormMessage(id, message) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = message;
  }
}

function getErrorMessage(error) {
  return error?.message || "Bilinmeyen bir hata oluştu.";
}

function getCreatorName(id) {
  if (id === currentUser?.id) return currentProfile?.display_name || currentProfile?.username || "Sen";
  if (id === partnerProfile?.id) return partnerProfile.display_name || partnerProfile.username || "Partnerin";
  return "Birlikte";
}

function itemDomId(type, id) {
  return `item-${type}-${id}`;
}

function favoriteButton(type, id) {
  const isFavorite = favoriteRows.some(row => row.item_type === type && row.item_id === id);
  return `<button type="button" class="favorite-toggle" data-favorite-type="${escapeHtml(type)}" data-favorite-id="${escapeHtml(id)}" aria-pressed="${isFavorite}" aria-label="${isFavorite ? "Favorilerden çıkar" : "Favorilere ekle"}">${isFavorite ? "♥" : "♡"}</button>`;
}

function rememberFavoriteItem(type, item) {
  const id = item.id;
  favoriteCatalog.set(`${type}:${id}`, {
    type,
    id,
    title: item.title || item.caption || "Küçük dünyamızdan bir parça",
    summary: item.description || item.caption || item.artist || ""
  });
}

function bindFavoriteButtons(container) {
  container.querySelectorAll("[data-favorite-type]").forEach(button => {
    button.addEventListener("click", async () => {
      if (!currentUser) return;
      const type = button.dataset.favoriteType;
      const id = button.dataset.favoriteId;
      const exists = favoriteRows.some(row => row.item_type === type && row.item_id === id);
      button.disabled = true;

      const result = exists
        ? await supabaseClient.from("favorites").delete().eq("user_id", currentUser.id).eq("item_type", type).eq("item_id", id)
        : await supabaseClient.from("favorites").insert({ user_id: currentUser.id, item_type: type, item_id: id });

      if (result.error) {
        showToast("Favori güncellenemedi. Supabase özellik SQL dosyasını uygulamalısın.");
        button.disabled = false;
        return;
      }

      await loadFavorites();
      renderFavorites();
      const loader = { letter: loadLetters, memory: loadMemories, photo: loadPhotos, media: loadPhotos, music: loadMusic }[type];
      if (loader) await loader();
    });
  });
}

async function loadFavorites() {
  const { data, error } = await supabaseClient
    .from("favorites")
    .select("id, user_id, item_type, item_id, created_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    favoriteRows = [];
    favoritesList.innerHTML = '<p class="empty-state">Favoriler bölümü için güvenli Supabase tablosu hazırlanmalı.</p>';
    return;
  }
  favoriteRows = data || [];
}

function renderFavorites() {
  const rows = favoriteRows.map(row => {
    const item = favoriteCatalog.get(`${row.item_type}:${row.item_id}`);
    if (!item) return "";
    return `<article class="content-item" data-entry-type="favorite">
      <h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p>
      <div class="content-actions"><button type="button" data-jump-to="${escapeHtml(itemDomId(item.type, item.id))}">İçeriğe git</button>${favoriteButton(row.item_type, row.item_id)}</div>
    </article>`;
  }).filter(Boolean);
  favoritesList.innerHTML = rows.length ? rows.join("") : '<p class="empty-state">Henüz favori eklemedin. Beğendiğin mektup, anı, fotoğraf veya şarkının ♡ simgesine dokun.</p>';
  bindFavoriteButtons(favoritesList);
  favoritesList.querySelectorAll("[data-jump-to]").forEach(button => button.addEventListener("click", () => {
    const target = document.getElementById(button.dataset.jumpTo);
    const section = target?.closest(".collection-section");
    if (section) openCollection(section.id, target);
  }));
}

function applyCollectionFilters() {
  const query = globalSearch.value.trim().toLocaleLowerCase("tr-TR");
  const type = typeFilter.value;
  const exactDate = dateFilter.value;
  document.querySelectorAll(".content-item[data-entry-type]").forEach(card => {
    const text = card.textContent.toLocaleLowerCase("tr-TR");
    const typeMatches = type === "all" || card.dataset.entryType === type;
    const queryMatches = !query || text.includes(query);
    const dateMatches = !exactDate || card.dataset.entryDate === exactDate;
    card.classList.toggle("is-filtered-out", !(typeMatches && queryMatches && dateMatches));
  });
  updateFolderCounts();
}

function updateFolderCounts() {
  const countVisible = id => document.querySelectorAll(`#${id} .content-item:not(.is-filtered-out)`).length;
  document.getElementById("letterFolderCount").textContent = `${countVisible("lettersList")} mektup`;
  document.getElementById("memoryFolderCount").textContent = `${countVisible("memoriesList")} anı`;
  document.getElementById("photoFolderCount").textContent = `${countVisible("photosList")} kare`;
  document.getElementById("musicFolderCount").textContent = `${countVisible("musicList")} şarkı`;
  document.getElementById("notificationFolderCount").textContent = `${notificationBadge.textContent || "0"} yeni`;
}

async function deleteOwnedItem(table, type, id, storagePath = "", bucket = "") {
  if (!currentUser || !window.confirm("Bu içeriği kalıcı olarak silmek istiyor musun?")) return;
  const { data, error } = await supabaseClient.from(table)
    .delete().eq("id", id).eq("created_by", currentUser.id).select("id").maybeSingle();
  if (error || !data) {
    showToast("İçerik silinemedi. Yalnızca ekleyen kişi silebilir.");
    return;
  }
  await supabaseClient.from("favorites").delete().eq("user_id", currentUser.id).eq("item_type", type).eq("item_id", id);
  let fileCleanupFailed = false;
  if (storagePath && bucket) {
    const { error: storageError } = await supabaseClient.storage.from(bucket).remove([storagePath]);
    fileCleanupFailed = Boolean(storageError);
  }
  showToast(fileCleanupFailed ? "İçerik silindi; dosya depodan kaldırılamadı." : "İçerik silindi.");
  favoriteCatalog.delete(`${type}:${id}`);
  await Promise.all([loadFavorites(), loadLetters(), loadMemories(), loadPhotos(), loadMusic(), loadSpecialDays()]);
  renderFavorites();
  applyCollectionFilters();
}

function bindDeleteButtons(container) {
  container.querySelectorAll("[data-delete-table]").forEach(button => {
    button.addEventListener("click", () => deleteOwnedItem(
      button.dataset.deleteTable,
      button.dataset.deleteType,
      button.dataset.deleteId,
      button.dataset.deletePath || "",
      button.dataset.deleteBucket || ""
    ));
  });
}

/* =========================================
   ROMANTİK AÇILIŞ VE LAMBA
========================================= */

const romanticMessages = [
  "Bazı dünyalar keşfedilmeyi bekler...",
  "Karanlığın içinde bile birbirimizi bulduk.",
  "Her ışık bir anı, her anı ikimizden bir parça.",
  "Burası haritalarda yok. Çünkü yalnızca ikimizin kalbinde var.",
  "Hoş geldin, bu gece de bizim dünyamız. ❤️"
];

function lightUpWorld() {
  if (lampIsOn) return;

  lampIsOn = true;
  scene.classList.add("lit");

  pull.disabled = true;
  pullHint.style.opacity = "0";

  romanticMessage.textContent = romanticMessages[0];
  romanticMessage.style.opacity = "1";

  messageTimer = setInterval(() => {
    messageIndex++;

    if (messageIndex >= romanticMessages.length) {
      clearInterval(messageTimer);
      return;
    }

    romanticMessage.style.opacity = "0";

    messageChangeTimer = setTimeout(() => {
      romanticMessage.textContent =
        romanticMessages[messageIndex];

      romanticMessage.style.opacity = "1";
    }, 1200);
  }, 4500);
}

let pointerStartY = null;
let wasDragged = false;

pull.addEventListener("pointerdown", event => {
  if (lampIsOn) return;

  pointerStartY = event.clientY;
  wasDragged = false;

  pull.setPointerCapture(event.pointerId);
});

pull.addEventListener("pointerup", event => {
  if (lampIsOn || pointerStartY === null) return;

  const distance = event.clientY - pointerStartY;

  if (distance > 20) {
    wasDragged = true;
    lightUpWorld();
  }

  pointerStartY = null;
});

pull.addEventListener("click", () => {
  if (!lampIsOn && !wasDragged) {
    lightUpWorld();
  }

  wasDragged = false;
});

/* =========================================
   EKRAN GEÇİŞLERİ
========================================= */

function showDashboard() {
  scene.hidden = true;
  dashboard.hidden = false;

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function showLogin() {
  dashboard.hidden = true;
  scene.hidden = false;

  scene.classList.remove("lit");

  login.hidden = false;
  resetSection.hidden = true;
  loginForm.style.display = "block";

  loginForm.reset();
  resetForm.reset();

  authMessage.textContent = "";

  lampIsOn = false;
  messageIndex = 0;

  pull.disabled = false;
  pullHint.style.opacity = "1";
  romanticMessage.style.opacity = "0";

  clearInterval(messageTimer);
  clearTimeout(messageChangeTimer);

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* =========================================
   GİRİŞ
========================================= */

loginForm.addEventListener("submit", async event => {
  event.preventDefault();

  const username = emailInput.value.trim();
  const password = passwordInput.value;

  const submitButton = loginForm.querySelector(
    'button[type="submit"]'
  );

  submitButton.disabled = true;
  authMessage.textContent = "Dünyamıza giriş yapılıyor...";

  try {
    const { data: loginData, error: loginError } =
      await supabaseClient.functions.invoke("username-log-n", {
        body: { username, password }
      });

    if (loginError || !loginData?.session) {
      authMessage.textContent =
        "Giriş başarısız: " +
        (loginData?.error || getErrorMessage(loginError));
      return;
    }

    const { data: sessionData, error: sessionError } =
      await supabaseClient.auth.setSession({
        access_token: loginData.session.access_token,
        refresh_token: loginData.session.refresh_token
      });

    if (sessionError) {
      authMessage.textContent =
        "Oturum açılamadı: " + getErrorMessage(sessionError);
      return;
    }

    currentUser = sessionData.user;
    authMessage.textContent = "Hoş geldin! ❤️";
    await openUserWorld();

  } catch (error) {
    authMessage.textContent =
      "Bağlantı hatası: " + getErrorMessage(error);
  } finally {
    submitButton.disabled = false;
  }
});

/* =========================================
   ŞİFRE GÖSTER / GİZLE
========================================= */

togglePassword.addEventListener("click", () => {
  const isHidden = passwordInput.type === "password";

  passwordInput.type = isHidden ? "text" : "password";
  togglePassword.textContent = isHidden ? "Gizle" : "Göster";

  togglePassword.setAttribute(
    "aria-label",
    isHidden ? "Şifreyi gizle" : "Şifreyi göster"
  );
});

/* =========================================
   ŞİFREMİ UNUTTUM - USER RESET
========================================= */

forgotPassword.addEventListener("click", async event => {
  event.preventDefault();

  const username = emailInput.value.trim();

  if (!username) {
    authMessage.textContent =
      "Önce kullanıcı adını yazmalısın.";

    emailInput.focus();
    return;
  }

  forgotPassword.style.pointerEvents = "none";

  authMessage.textContent =
    "Şifre sıfırlama bağlantısı gönderiliyor...";

  try {
    const { data, error } =
      await supabaseClient.functions.invoke(
        "user-reset",
        {
          body: {
            username: username
          }
        }
      );

    if (error) {
      console.error("user-reset hatası:", error);

      throw new Error(
        error.message || "İstek gönderilemedi."
      );
    }

    if (!data || !data.success) {
      throw new Error(
        data?.error || "Şifre sıfırlama başarısız."
      );
    }

    authMessage.textContent = data.message;

  } catch (error) {
    console.error("Şifre sıfırlama:", error);

    authMessage.textContent =
      "Hata: " + getErrorMessage(error);

  } finally {
    forgotPassword.style.pointerEvents = "auto";
  }
});

/* =========================================
   YENİ ŞİFRE BELİRLEME
========================================= */

resetForm.addEventListener("submit", async event => {
  event.preventDefault();

  const newPassword =
    document.getElementById("newPassword").value;

  const { error } = await supabaseClient.auth.updateUser({
    password: newPassword
  });

  if (error) {
    authMessage.textContent =
      "Şifre değiştirilemedi: " + getErrorMessage(error);
    return;
  }

  authMessage.textContent =
    "Şifren başarıyla yenilendi! ❤️";

  resetForm.reset();
  resetSection.hidden = true;
  loginForm.style.display = "block";
});

/* =========================================
   PROFİL VE PARTNER BİLGİLERİ
========================================= */

async function loadProfile() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, username, display_name, partner_id")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.error("Profil yüklenemedi:", error.message);

    userName.textContent = currentUser.email || "Hoş geldin";
    coupleNames.textContent = "Sen ♥ Ben";
    partnerStatus.textContent =
      "Profil bilgileri yüklenemedi.";
    return;
  }

  if (!data) {
    userName.textContent = currentUser.email || "Hoş geldin";
    coupleNames.textContent = "Sen ♥ Ben";
    partnerStatus.textContent =
      "Profil kaydı henüz oluşturulmamış.";
    return;
  }

  currentProfile = data;
  partnerProfile = null;

  const myName =
    data.username || data.display_name || "Sen";

  userName.textContent = myName;

  if (!data.partner_id) {
    coupleNames.textContent = `${myName} ♥ Sen`;
    partnerStatus.textContent =
      "Partner bağlantısı henüz yapılmadı. ❤️";
    return;
  }

  const { data: partner, error: partnerError } =
    await supabaseClient
      .from("profiles")
      .select("id, username, display_name")
      .eq("id", data.partner_id)
      .maybeSingle();

  if (partnerError || !partner) {
    coupleNames.textContent = `${myName} ♥ Partnerin`;
    partnerStatus.textContent =
      "Partner bağlantısı var; profil bilgisi görüntülenemiyor.";
    return;
  }

  partnerProfile = partner;

  const partnerName =
    partner.display_name || partner.username || "Partnerin";

  coupleNames.textContent = `${myName} ♥ ${partnerName}`;
  partnerStatus.textContent =
    "Birlikte oluşturduğumuz küçük dünyaya hoş geldiniz. ❤️";
}

/* =========================================
   KULLANICININ DÜNYASINI AÇ
========================================= */

async function openUserWorld() {
  if (!currentUser) return;

  showDashboard();

  userName.textContent =
    currentUser.email || "Hoş geldin";

  await loadProfile();
  subscribeToSharedBackgroundMusic();

  const { error: reminderError } = await supabaseClient.rpc("create_upcoming_special_day_notifications");
  specialDayReminderFunctionAvailable = !reminderError;
  if (reminderError) console.info("Yaklaşan özel gün hatırlatmaları için özellik SQL dosyası gerekli:", reminderError.message);

  await Promise.all([
    loadLetters(),
    loadMemories(),
    loadPhotos(),
    loadMusic(),
    loadNotifications(),
    loadFavorites(),
    loadSpecialDays()
  ]);
  renderFavorites();
  updateFolderCounts();
  applyCollectionFilters();
}

/* =========================================
   MEKTUPLARI YÜKLE
========================================= */

async function loadLetters() {
  lettersList.innerHTML =
    '<p class="empty-state">Mektuplar yükleniyor...</p>';

  const { data, error } = await supabaseClient
    .from("letters")
    .select("id, title, content, delivery_date, created_by, partner_id, is_shared, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Mektuplar yüklenemedi:", error.message);

    lettersList.innerHTML =
      '<p class="empty-state">Mektuplar yüklenemedi: ' +
      escapeHtml(error.message) +
      "</p>";
    return;
  }

  // Partners may see only the existence and opening date of a locked letter.
  // The RPC returns no title or body; the underlying row remains protected by RLS.
  const { data: lockedEnvelopes, error: envelopeError } = await supabaseClient.rpc("list_locked_letter_envelopes");
  if (envelopeError) console.info("Kilitli mektup zarfları için Supabase SQL güncellemesi gerekli:", envelopeError.message);
  const lockedPlaceholders = (lockedEnvelopes || []).map(envelope => ({
    ...envelope,
    title: null,
    content: null,
    is_shared: true,
    is_locked_placeholder: true
  }));
  const visibleLetters = [...(data || []), ...lockedPlaceholders]
    .filter(letter => !isFutureDelivery(letter.delivery_date) || letter.created_by === currentUser?.id || letter.is_locked_placeholder)
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  if (visibleLetters.length === 0) {
    lettersList.innerHTML =
      '<p class="empty-state">Henüz mektup yok. İlk mektubu sen yaz. ♡</p>';
    applyCollectionFilters();
    return;
  }

  lettersList.innerHTML = visibleLetters.map(letter => {
    const date = letter.delivery_date || letter.created_at;
    const isLockedCapsule = isFutureDelivery(letter.delivery_date);
    rememberFavoriteItem("letter", letter);

    return `
      <article class="content-item ${isLockedCapsule ? "future-capsule" : ""}" id="${escapeHtml(itemDomId("letter", letter.id))}" data-entry-type="letter" data-entry-date="${escapeHtml(String(letter.delivery_date || letter.created_at || "").slice(0, 10))}">
        <h3>${isLockedCapsule ? (letter.is_locked_placeholder ? "🔒 Sana tarihli bir mektup var" : "🔒 Zaman kapsülün hazır") : escapeHtml(letter.title)}</h3>
        <p>${isLockedCapsule ? (letter.is_locked_placeholder ? `Partnerin sana bir mektup bıraktı. ${escapeHtml(formatDate(letter.delivery_date))} tarihinde açılacak.` : `Yalnızca senin görebildiğin bu mektup ${escapeHtml(formatDate(letter.delivery_date))} tarihinde açılacak.`) : escapeHtml(letter.content)}</p>
        <span class="content-meta">
          ${escapeHtml(formatDate(date))}
          ${isLockedCapsule ? " · AÇILMAYI BEKLİYOR" : (letter.is_shared ? " · PAYLAŞILAN MEKTUP" : " · ÖZEL MEKTUP")}
        </span>
        <span class="content-meta content-author">${escapeHtml(getCreatorName(letter.created_by))} yazdı · ${escapeHtml(formatDate(letter.created_at))}${letter.delivery_date ? " · ZAMAN KAPSÜLÜ" : ""}</span>
        <div class="content-actions">${letter.is_locked_placeholder ? "" : favoriteButton("letter", letter.id)}${letter.created_by === currentUser?.id ? `<button type="button" data-delete-table="letters" data-delete-type="letter" data-delete-id="${escapeHtml(letter.id)}">Sil</button>` : ""}</div>
      </article>
    `;
  }).join("");
  bindFavoriteButtons(lettersList);
  bindDeleteButtons(lettersList);
  const capsuleReady = visibleLetters.find(letter => letter.delivery_date && !isFutureDelivery(letter.delivery_date));
  if (capsuleReady) {
    const key = `opened-capsule:${currentUser.id}:${capsuleReady.id}`;
    try {
      if (!localStorage.getItem(key)) {
        showToast(`Bir zaman kapsülünün açılma zamanı geldi: ${capsuleReady.title} ♡`);
        localStorage.setItem(key, "shown");
      }
    } catch { /* Takvim ve mektup listesi gizlilik ayarlarıyla da çalışmaya devam eder. */ }
  }
  applyCollectionFilters();
}

/* =========================================
   MEKTUP EKLE
========================================= */

letterForm.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser) return;

  const title =
    document.getElementById("letterTitle").value.trim();

  const content =
    document.getElementById("letterBody").value.trim();

  const deliveryDate =
    document.getElementById("letterDeliveryDate").value || null;

  const isShared =
    document.getElementById("letterShared").checked;

  if (!title || !content) {
    setFormMessage(
      "letterMessage",
      "Başlık ve mektup içeriğini doldur."
    );
    return;
  }

  const submitButton = letterForm.querySelector(
    'button[type="submit"]'
  );

  submitButton.disabled = true;

  setFormMessage("letterMessage", "Mektup saklanıyor...");

  const { error } = await supabaseClient
    .from("letters")
    .insert({
      created_by: currentUser.id,
      partner_id: currentProfile?.partner_id || null,
      title,
      content,
      is_shared: isShared,
      delivery_date: deliveryDate
    });

  submitButton.disabled = false;

  if (error) {
    setFormMessage(
      "letterMessage",
      "Mektup kaydedilemedi: " + getErrorMessage(error)
    );
    return;
  }

  letterForm.reset();
  document.getElementById("letterShared").checked = true;
  document.getElementById("letterDeliveryDate").value = "";

  document.getElementById("letterModal").close();

  showToast("Mektubun küçük dünyamıza eklendi. ❤️");

  await loadLetters();
});

/* =========================================
   ANILARI YÜKLE
========================================= */

async function loadMemories() {
  memoriesList.innerHTML =
    '<p class="empty-state">Anılar yükleniyor...</p>';

  const { data, error } = await supabaseClient
    .from("memories")
    .select("id, title, description, memory_date, created_by, partner_id, created_at")
    .order("memory_date", { ascending: false });

  if (error) {
    console.error("Anılar yüklenemedi:", error.message);

    memoriesList.innerHTML =
      '<p class="empty-state">Anılar yüklenemedi: ' +
      escapeHtml(error.message) +
      "</p>";
    return;
  }

  if (!data || data.length === 0) {
    memoriesList.innerHTML =
      '<p class="empty-state">Henüz anı eklemedik. İlk anımızı oluşturalım. ♡</p>';
    return;
  }

  memoriesList.innerHTML = data.map(memory => {
    rememberFavoriteItem("memory", memory);
    return `
    <article class="content-item" id="${escapeHtml(itemDomId("memory", memory.id))}" data-entry-type="memory" data-entry-date="${escapeHtml(String(memory.memory_date || memory.created_at || "").slice(0, 10))}">
      <h3>${escapeHtml(memory.title)}</h3>
      <p>${escapeHtml(memory.description || "")}</p>
      <span class="content-meta">
        ${escapeHtml(formatDate(memory.memory_date))}
      </span>
      <span class="content-meta content-author">${escapeHtml(getCreatorName(memory.created_by))} ekledi · ${escapeHtml(formatDate(memory.created_at))}</span>
      <div class="content-actions">${favoriteButton("memory", memory.id)}${memory.created_by === currentUser?.id ? `<button type="button" data-delete-table="memories" data-delete-type="memory" data-delete-id="${escapeHtml(memory.id)}">Sil</button>` : ""}</div>
    </article>
  `;
  }).join("");
  bindFavoriteButtons(memoriesList);
  bindDeleteButtons(memoriesList);
  applyCollectionFilters();
}

/* =========================================
   ANI EKLE
========================================= */

memoryForm.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser) return;

  const title =
    document.getElementById("memoryTitle").value.trim();

  const description =
    document.getElementById("memoryBody").value.trim();

  const memoryDate =
    document.getElementById("memoryDate").value || getLocalDate();

  if (!title) {
    setFormMessage(
      "memoryMessage",
      "Anının başlığını yaz."
    );
    return;
  }

  const submitButton = memoryForm.querySelector(
    'button[type="submit"]'
  );

  submitButton.disabled = true;

  setFormMessage("memoryMessage", "Anı saklanıyor...");

  const { error } = await supabaseClient
    .from("memories")
    .insert({
      created_by: currentUser.id,
      partner_id: currentProfile?.partner_id || null,
      title,
      description,
      memory_date: memoryDate
    });

  submitButton.disabled = false;

  if (error) {
    setFormMessage(
      "memoryMessage",
      "Anı kaydedilemedi: " + getErrorMessage(error)
    );
    return;
  }

  memoryForm.reset();

  document.getElementById("memoryModal").close();

  showToast("Güzel bir anı daha saklandı. ✧");

  await loadMemories();
});

/* =========================================
   FOTOĞRAFLARI YÜKLE
========================================= */

async function loadPhotos() {
  photosList.innerHTML =
    '<p class="empty-state">Fotoğraflar yükleniyor...</p>';

  const { data, error } = await supabaseClient
    .from("photos")
    .select("id, created_by, partner_id, storage_path, caption, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Fotoğraflar yüklenemedi:", error.message);

    photosList.innerHTML =
      '<p class="empty-state">Fotoğraflar yüklenemedi: ' +
      escapeHtml(error.message) +
      "</p>";
    return;
  }

  const { data: mediaData, error: mediaError } = await supabaseClient
    .from("couple_media")
    .select("id, created_by, partner_id, media_type, storage_path, caption, media_date, created_at")
    .order("created_at", { ascending: false });

  if (mediaError) console.info("Video ve yeni albüm desteği için özellik SQL dosyası gerekli:", mediaError.message);

  const photoCards = await Promise.all((data || []).map(async photo => {
    const { data: signedData, error: signedError } = await supabaseClient.storage
      .from(PHOTO_BUCKET).createSignedUrl(photo.storage_path, 3600);
    if (signedError || !signedData) return "";
    rememberFavoriteItem("photo", photo);
    return `
      <article class="photo-card content-item" id="${escapeHtml(itemDomId("photo", photo.id))}" data-entry-type="photo" data-entry-date="${escapeHtml(String(photo.created_at || "").slice(0, 10))}">
        <img src="${escapeHtml(signedData.signedUrl)}" alt="${escapeHtml(photo.caption || "Bir anımız")}" loading="lazy">
        <p>${escapeHtml(photo.caption || "♡")}</p>
        <span class="content-meta content-author">${escapeHtml(getCreatorName(photo.created_by))} ekledi · ${escapeHtml(formatDate(photo.created_at))}</span>
        <div class="content-actions">${favoriteButton("photo", photo.id)}${photo.created_by === currentUser?.id ? `<button type="button" data-delete-table="photos" data-delete-type="photo" data-delete-id="${escapeHtml(photo.id)}" data-delete-path="${escapeHtml(photo.storage_path)}" data-delete-bucket="${PHOTO_BUCKET}">Sil</button>` : ""}</div>
      </article>`;
  }));

  const mediaCards = await Promise.all((mediaData || []).map(async media => {
    const { data: signedData, error: signedError } = await supabaseClient.storage
      .from("couple-media").createSignedUrl(media.storage_path, 3600);
    if (signedError || !signedData) return "";
    rememberFavoriteItem("media", { ...media, title: media.caption || (media.media_type === "video" ? "Bir videomuz" : "Bir fotoğrafımız") });
    const visual = media.media_type === "video"
      ? `<video src="${escapeHtml(signedData.signedUrl)}" controls preload="metadata" aria-label="${escapeHtml(media.caption || "Bir anımız")}"></video>`
      : `<img src="${escapeHtml(signedData.signedUrl)}" alt="${escapeHtml(media.caption || "Bir anımız")}" loading="lazy">`;
    return `
      <article class="photo-card content-item" id="${escapeHtml(itemDomId("media", media.id))}" data-entry-type="photo" data-entry-date="${escapeHtml(String(media.media_date || media.created_at || "").slice(0, 10))}">
        ${visual}<p>${escapeHtml(media.caption || "♡")}</p>
        <span class="content-meta content-author">${escapeHtml(getCreatorName(media.created_by))} ekledi · ${escapeHtml(formatDate(media.media_date || media.created_at))}</span>
        <div class="content-actions">${favoriteButton("media", media.id)}${media.created_by === currentUser?.id ? `<button type="button" data-delete-table="couple_media" data-delete-type="media" data-delete-id="${escapeHtml(media.id)}" data-delete-path="${escapeHtml(media.storage_path)}" data-delete-bucket="couple-media">Sil</button>` : ""}</div>
      </article>`;
  }));

  const cards = [...photoCards, ...mediaCards].filter(Boolean);
  photosList.innerHTML = cards.length
    ? cards.join("")
    : '<p class="empty-state">Henüz fotoğraf veya video eklemedik. ♡</p>';
  bindFavoriteButtons(photosList);
  bindDeleteButtons(photosList);
  applyCollectionFilters();
}

/* =========================================
   ŞARKILARIMIZ
========================================= */

function getMusicPlatform(value) {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be" || host.endsWith("youtube.com")) return "YouTube";
    if (host.endsWith("spotify.com")) return "Spotify";
    if (host.endsWith("soundcloud.com")) return "SoundCloud";
    return host;
  } catch {
    return "Bağlantı";
  }
}

function getSharedBackgroundTracks() {
  const userId = currentUser?.id;
  const partnerId = currentProfile?.partner_id;
  if (!userId || !partnerId) return [];
  return availableMusicRows.filter(song => song.storage_path &&
    ((song.created_by === userId && song.partner_id === partnerId) ||
     (song.created_by === partnerId && song.partner_id === userId)));
}

async function loadBackgroundMusicOptions() {
  if (!backgroundMusicSelect) return;
  const tracks = getSharedBackgroundTracks();
  backgroundMusicSelect.replaceChildren(new Option("Ortak MP3 seçin", ""));
  tracks.forEach(song => {
    const label = song.artist ? `${song.title} — ${song.artist}` : song.title;
    backgroundMusicSelect.add(new Option(label, song.id));
  });
  backgroundMusicSelect.disabled = tracks.length === 0;

  if (!currentProfile?.partner_id) {
    backgroundMusicStatus.textContent = "Ortak fon müziği için önce partner hesabı bağlanmalı.";
    return;
  }
  if (!tracks.length) {
    backgroundMusicStatus.textContent = "Henüz ortak MP3 yok. Müzik ekleyip partnerinle paylaşabilirsin.";
    backgroundMusicPlayer.pause();
    backgroundMusicPlayer.removeAttribute("src");
    backgroundMusicPlayer.load();
    return;
  }

  const { data: selectedId, error } = await supabaseClient.rpc("get_couple_background_music");
  if (error) {
    backgroundMusicStatus.textContent = "Ortak müzik ayarı için Supabase güncellemesi gerekli.";
    console.info("Ortak fon müziği ayarı yüklenemedi:", error.message);
    return;
  }
  backgroundMusicSelect.value = tracks.some(song => song.id === selectedId) ? selectedId : "";
  if (!selectedId || !backgroundMusicSelect.value) {
    backgroundMusicStatus.textContent = "Bir MP3 seç; seçimin partnerinle ortak olacak.";
    backgroundMusicPlayer.pause();
    backgroundMusicPlayer.removeAttribute("src");
    backgroundMusicPlayer.load();
    return;
  }

  const selectedSong = tracks.find(song => song.id === selectedId);
  const { data: signed, error: signedError } = await supabaseClient.storage
    .from("couple-media").createSignedUrl(selectedSong.storage_path, 3600);
  if (signedError || !signed?.signedUrl) {
    backgroundMusicStatus.textContent = "Seçili MP3 açılamadı. Müzik dosyasını yeniden yüklemeyi dene.";
    return;
  }
  if (backgroundMusicPlayer.src !== signed.signedUrl) backgroundMusicPlayer.src = signed.signedUrl;
  backgroundMusicStatus.textContent = "Ortak şarkınız hazır. Çalmak için oynat düğmesine bas.";
}

async function saveSharedBackgroundMusicSelection() {
  const selectedId = backgroundMusicSelect.value || null;
  backgroundMusicSelect.disabled = true;
  backgroundMusicStatus.textContent = "Ortak müzik seçimi kaydediliyor...";
  const { error } = await supabaseClient.rpc("set_couple_background_music", { p_music_id: selectedId });
  backgroundMusicSelect.disabled = false;
  if (error) {
    backgroundMusicStatus.textContent = "Seçim kaydedilemedi. Supabase ortak müzik güncellemesini çalıştır.";
    console.error("Ortak fon müziği kaydedilemedi:", error.message);
    return;
  }
  await loadBackgroundMusicOptions();
}

function subscribeToSharedBackgroundMusic() {
  if (backgroundMusicChannel) {
    supabaseClient.removeChannel(backgroundMusicChannel);
    backgroundMusicChannel = null;
  }
  if (!currentUser || !currentProfile?.partner_id) return;
  backgroundMusicChannel = supabaseClient
    .channel(`shared-background-music-${currentUser.id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "couple_background_settings" }, payload => {
      const row = payload.new || payload.old;
      if (row?.user_low === currentUser.id || row?.user_high === currentUser.id) loadMusic();
    })
    .subscribe();
}

async function loadMusic() {
  musicList.innerHTML = '<p class="empty-state">Şarkılar yükleniyor...</p>';

  const { data, error } = await supabaseClient
    .from("music")
    .select("id, title, artist, source_type, platform, url, storage_path, caption, created_by, partner_id, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Şarkılar yüklenemedi:", error.message);
    musicList.innerHTML = `<p class="empty-state">Şarkılar yüklenemedi: ${escapeHtml(error.message)}</p>`;
    availableMusicRows = [];
    await loadBackgroundMusicOptions();
    return;
  }

  availableMusicRows = data || [];
  await loadBackgroundMusicOptions();

  if (!data?.length) {
    musicList.innerHTML = '<p class="empty-state">Henüz şarkı eklemedik. İlk şarkımızı saklayalım. ♫</p>';
    return;
  }

  const cards = await Promise.all(data.map(async song => {
    let safeUrl = "";
    try {
      const parsed = new URL(song.url);
      if (parsed.protocol === "https:") safeUrl = parsed.href;
    } catch {
      // Bozuk bağlantıları tıklanabilir olarak göstermiyoruz.
    }

    const isMine = song.created_by === currentUser?.id;
    const visibility = (song.partner_id === currentUser?.id || song.partner_id === currentProfile?.partner_id) && song.partner_id
      ? "Birlikte"
      : "Kişisel";
    let audioMarkup = "";
    if (song.storage_path) {
      const { data: signedData } = await supabaseClient.storage
        .from("couple-media").createSignedUrl(song.storage_path, 3600);
      if (signedData?.signedUrl) audioMarkup = `<audio controls preload="none" src="${escapeHtml(signedData.signedUrl)}">Tarayıcın ses oynatmayı desteklemiyor.</audio>`;
    }
    rememberFavoriteItem("music", song);

    return `
      <article class="content-item music-item" id="${escapeHtml(itemDomId("music", song.id))}" data-entry-type="music" data-entry-date="${escapeHtml(String(song.created_at || "").slice(0, 10))}">
        <div class="music-item-heading">
          <div>
            <h3>${escapeHtml(song.title)}</h3>
            <span class="content-meta">${escapeHtml(song.artist || "Sanatçı belirtilmedi")} · ${escapeHtml(song.platform || getMusicPlatform(song.url || ""))} · ${visibility}</span>
            <span class="content-meta content-author">${escapeHtml(getCreatorName(song.created_by))} ekledi · ${escapeHtml(formatDate(song.created_at))}</span>
          </div>
          ${isMine ? `<button type="button" data-delete-table="music" data-delete-type="music" data-delete-id="${escapeHtml(song.id)}" data-delete-path="${escapeHtml(song.storage_path || "")}" data-delete-bucket="couple-media">Sil</button>` : ""}
        </div>
        ${song.caption ? `<p>${escapeHtml(song.caption)}</p>` : ""}
        ${audioMarkup}
        ${safeUrl ? `<a class="music-link" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">Şarkıyı aç ↗</a>` : '<span class="content-meta">Bağlantı kullanılamıyor</span>'}
        <div class="content-actions">${favoriteButton("music", song.id)}</div>
      </article>
    `;
  }));
  musicList.innerHTML = cards.join("");
  bindFavoriteButtons(musicList);
  bindDeleteButtons(musicList);
  applyCollectionFilters();
}

musicForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!currentUser) return;

  const title = document.getElementById("musicTitle").value.trim();
  const artist = document.getElementById("musicArtist").value.trim();
  const url = document.getElementById("musicUrl").value.trim();
  const caption = document.getElementById("musicCaption").value.trim();
  const shareWithPartner = document.getElementById("musicShared").checked;
  const file = document.getElementById("musicFile").files[0];
  const message = document.getElementById("musicMessage");
  let parsedUrl;

  if (!file) {
    try {
      parsedUrl = new URL(url);
    } catch {
      message.textContent = "Güvenli bir HTTPS bağlantısı ekle veya MP3 dosyası seç.";
      return;
    }
    if (parsedUrl.protocol !== "https:") {
      message.textContent = "Güvenli (https) bir şarkı bağlantısı kullan.";
      return;
    }
  } else if (file.type !== "audio/mpeg" || file.size > 15 * 1024 * 1024) {
    message.textContent = "En fazla 15 MB boyutunda bir MP3 dosyası seç.";
    return;
  }

  if (shareWithPartner && !currentProfile?.partner_id) {
    message.textContent = "Şarkıyı paylaşmak için önce partner bağlantısı kurulmalı.";
    return;
  }

  const submitButton = musicForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  message.textContent = "Şarkı saklanıyor...";

  let storagePath = null;
  if (file) {
    storagePath = `${currentUser.id}/music/${crypto.randomUUID()}.mp3`;
    const { error: uploadError } = await supabaseClient.storage.from("couple-media").upload(storagePath, file, {
      cacheControl: "3600", upsert: false, contentType: "audio/mpeg"
    });
    if (uploadError) {
      submitButton.disabled = false;
      message.textContent = "MP3 yüklenemedi: " + getErrorMessage(uploadError);
      return;
    }
  }

  const { error } = await supabaseClient.from("music").insert({
    created_by: currentUser.id,
    partner_id: shareWithPartner ? currentProfile.partner_id : null,
    title,
    artist: artist || null,
    source_type: file ? "upload" : "link",
    platform: file ? "Dosya" : getMusicPlatform(url),
    url: file ? null : url,
    storage_path: storagePath,
    caption: caption || null
  });

  submitButton.disabled = false;
  if (error) {
    if (storagePath) await supabaseClient.storage.from("couple-media").remove([storagePath]);
    message.textContent = "Şarkı kaydedilemedi: " + getErrorMessage(error);
    return;
  }

  musicForm.reset();
  document.getElementById("musicShared").checked = Boolean(currentProfile?.partner_id);
  document.getElementById("musicModal").close();
  showToast("Şarkı küçük dünyamıza eklendi. ♫");
  await loadMusic();
});

/* =========================================
   BİLDİRİMLER
========================================= */

async function loadNotifications() {
  notificationsList.innerHTML = '<p class="empty-state">Bildirimler yükleniyor...</p>';

  const { data, error } = await supabaseClient
    .from("notifications")
    .select("id, recipient_id, actor_id, item_type, item_id, title, message, is_read, created_at, read_at")
    .eq("recipient_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Bildirimler yüklenemedi:", error.message);
    notificationsList.innerHTML = `<p class="empty-state">Bildirimler yüklenemedi: ${escapeHtml(error.message)}</p>`;
    notificationBadge.hidden = true;
    return;
  }

  const unreadCount = (data || []).filter(notification => !notification.is_read).length;
  notificationBadge.textContent = String(unreadCount);
  notificationBadge.hidden = unreadCount === 0;
  updateFolderCounts();

  if (!data?.length) {
    notificationsList.innerHTML = '<p class="empty-state">Şimdilik yeni bir bildirim yok. ❤️</p>';
    return;
  }

  notificationsList.innerHTML = data.map(notification => `
    <article class="content-item notification-item ${notification.is_read ? "" : "is-unread"}" data-entry-type="notification">
      <div class="music-item-heading">
        <div>
          <h3>${escapeHtml(notification.title)}</h3>
          <span class="content-meta">${escapeHtml(formatDate(notification.created_at))}${notification.item_type ? ` · ${escapeHtml(notification.item_type)}` : ""}</span>
        </div>
        <div class="content-actions">
          ${notification.is_read ? '<span class="content-meta">Okundu</span>' : `<button type="button" data-open-notification="${escapeHtml(notification.id)}" data-item-type="${escapeHtml(notification.item_type)}" data-item-id="${escapeHtml(notification.item_id)}">İçeriği aç</button>`}
          ${notification.actor_id === currentUser?.id ? `<button type="button" data-delete-notification="${escapeHtml(notification.id)}">Sil</button>` : ""}
        </div>
      </div>
      ${notification.message ? `<p>${escapeHtml(notification.message)}</p>` : ""}
    </article>
  `).join("");

  notificationsList.querySelectorAll("[data-open-notification]").forEach(button => {
    button.addEventListener("click", async () => {
      if (!currentUser) return;
      button.disabled = true;
      const { error: updateError } = await supabaseClient.from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", button.dataset.openNotification).eq("recipient_id", currentUser.id);

      if (updateError) {
        showToast("Bildirim güncellenemedi: " + getErrorMessage(updateError));
        button.disabled = false;
        return;
      }
      await loadNotifications();
      const type = button.dataset.itemType;
      const candidates = [itemDomId(type, button.dataset.itemId)];
      if (type === "photo" || type === "media") candidates.push(itemDomId("media", button.dataset.itemId), itemDomId("photo", button.dataset.itemId));
      const target = candidates.map(id => document.getElementById(id)).find(Boolean);
      if (target) {
        const section = target.closest(".collection-section");
        if (section) openCollection(section.id, target);
      }
      else showToast("İlgili içerik artık görünmüyor.");
    });
  });

  notificationsList.querySelectorAll("[data-delete-notification]").forEach(button => {
    button.addEventListener("click", async () => {
      if (!window.confirm("Bu bildirimi silmek istiyor musun?")) return;
      const { error: deleteError } = await supabaseClient.from("notifications").delete()
        .eq("id", button.dataset.deleteNotification).eq("actor_id", currentUser.id);
      if (deleteError) showToast("Bildirim silinemedi: " + getErrorMessage(deleteError));
      else await loadNotifications();
    });
  });
}

function nextSpecialDayOccurrence(day) {
  const source = String(day.event_date).slice(0, 10);
  const [year, month, date] = source.split("-").map(Number);
  const today = new Date(`${getLocalDate()}T00:00:00`);
  const dayOfMonth = targetYear => Math.min(date, new Date(targetYear, month, 0).getDate());
  let next = new Date(year, month - 1, dayOfMonth(year));
  if (day.is_annual && next < today) next = new Date(today.getFullYear() + 1, month - 1, dayOfMonth(today.getFullYear() + 1));
  return next;
}

async function loadSpecialDays() {
  specialDaysList.innerHTML = '<p class="empty-state">Takvim yükleniyor...</p>';
  const { data, error } = await supabaseClient.from("couple_special_days")
    .select("id, created_by, partner_id, title, category, event_date, is_annual, description, created_at")
    .order("event_date", { ascending: true });

  if (error) {
    specialDaysList.innerHTML = '<p class="empty-state">Takvim için özellik SQL dosyasını Supabase’te uygulamak gerekiyor.</p>';
    return;
  }
  if (!data?.length) {
    specialDaysList.innerHTML = '<p class="empty-state">Takvimimize henüz özel bir gün eklemedik. ♡</p>';
    return;
  }

  const today = new Date(`${getLocalDate()}T00:00:00`);
  const days = data.map(day => ({ ...day, nextDate: nextSpecialDayOccurrence(day) }))
    .sort((a, b) => a.nextDate - b.nextDate);
  const nearest = days.find(day => {
    const difference = Math.round((day.nextDate - today) / 86400000);
    return difference >= 0 && difference <= 7;
  });
  if (nearest && !specialDayReminderFunctionAvailable) {
    const key = `special-day-reminder:${currentUser.id}:${nearest.id}:${getLocalDate()}`;
    try {
      if (!localStorage.getItem(key)) {
        const daysLeft = Math.round((nearest.nextDate - today) / 86400000);
        showToast(daysLeft === 0 ? `Bugün özel günümüz: ${nearest.title} ♡` : `${nearest.title} için ${daysLeft} gün kaldı. ♡`);
        localStorage.setItem(key, "shown");
      }
    } catch { /* Gizlilik ayarları localStorage kullanımını engellese de takvim çalışır. */ }
  }

  specialDaysList.innerHTML = days.map(day => {
    const daysLeft = Math.round((day.nextDate - today) / 86400000);
    const nextDate = `${day.nextDate.getFullYear()}-${String(day.nextDate.getMonth() + 1).padStart(2, "0")}-${String(day.nextDate.getDate()).padStart(2, "0")}`;
    rememberFavoriteItem("special_day", day);
    return `<article class="content-item" id="${escapeHtml(itemDomId("special_day", day.id))}" data-entry-type="special_day" data-entry-date="${escapeHtml(nextDate)}">
      <h3>${escapeHtml(day.title)}</h3>
      <p>${escapeHtml(day.description || "Birlikte kutlayacağımız özel bir gün.")}</p>
      <span class="content-meta">${escapeHtml(formatDate(nextDate))} · ${day.is_annual ? "Her yıl" : "Tek seferlik"} · ${daysLeft === 0 ? "Bugün" : `${daysLeft} gün kaldı`}</span>
      <span class="content-meta content-author">${escapeHtml(getCreatorName(day.created_by))} ekledi</span>
      ${day.created_by === currentUser?.id ? `<div class="content-actions"><button type="button" data-delete-table="couple_special_days" data-delete-type="special_day" data-delete-id="${escapeHtml(day.id)}">Sil</button></div>` : ""}
    </article>`;
  }).join("");
  bindDeleteButtons(specialDaysList);
  applyCollectionFilters();
}

specialDayForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!currentUser) return;
  const submitButton = specialDayForm.querySelector('button[type="submit"]');
  const message = document.getElementById("specialDayMessage");
  submitButton.disabled = true;
  message.textContent = "Takvime ekleniyor...";
  const { error } = await supabaseClient.from("couple_special_days").insert({
    created_by: currentUser.id,
    partner_id: currentProfile?.partner_id || null,
    title: document.getElementById("specialDayTitle").value.trim(),
    category: document.getElementById("specialDayCategory").value,
    event_date: document.getElementById("specialDayDate").value,
    is_annual: document.getElementById("specialDayAnnual").checked,
    description: document.getElementById("specialDayNote").value.trim() || null
  });
  submitButton.disabled = false;
  if (error) {
    message.textContent = "Takvime eklenemedi. Özellik SQL dosyası Supabase’te uygulanmış olmalı. " + getErrorMessage(error);
    return;
  }
  specialDayForm.reset();
  document.getElementById("specialDayAnnual").checked = true;
  document.getElementById("specialDayModal").close();
  showToast("Özel günümüz takvime eklendi. ♡");
  await loadSpecialDays();
});

/* =========================================
   FOTOĞRAF EKLE
========================================= */

photoForm.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser) return;

  const fileInput = document.getElementById("photoFile");
  const captionInput = document.getElementById("photoCaption");

  const file = fileInput.files[0];

  if (!file) {
    setFormMessage("photoMessage", "Önce bir fotoğraf seç.");
    return;
  }

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "video/mp4",
    "video/webm"
  ];

  if (!allowedTypes.includes(file.type)) {
    setFormMessage(
      "photoMessage",
      "JPG, PNG, WEBP, MP4 veya WEBM dosyası seçebilirsin."
    );
    return;
  }

  const maxSize = file.type.startsWith("video/") ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxSize) {
    setFormMessage(
      "photoMessage",
      file.type.startsWith("video/") ? "Video en fazla 50 MB olabilir." : "Fotoğraf en fazla 10 MB olabilir."
    );
    return;
  }

  const submitButton = photoForm.querySelector(
    'button[type="submit"]'
  );

  submitButton.disabled = true;

  setFormMessage("photoMessage", "Fotoğraf yükleniyor...");

  const extension = file.name.split(".").pop().toLowerCase();

  const safeExtension = [
    "jpg",
    "jpeg",
    "png",
    "webp",
    "mp4",
    "webm"
  ].includes(extension)
    ? extension
    : "jpg";

  const filePath =
    `${currentUser.id}/media/${crypto.randomUUID()}.${safeExtension}`;

  const { error: uploadError } =
    await supabaseClient.storage
      .from("couple-media")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type
      });

  if (uploadError) {
    submitButton.disabled = false;

    setFormMessage(
      "photoMessage",
      "Fotoğraf yüklenemedi: " + getErrorMessage(uploadError)
    );
    return;
  }

  const { error: insertError } =
    await supabaseClient
      .from("couple_media")
      .insert({
        created_by: currentUser.id,
        partner_id: currentProfile?.partner_id || null,
        media_type: file.type.startsWith("video/") ? "video" : "image",
        storage_path: filePath,
        caption: captionInput.value.trim(),
        media_date: document.getElementById("photoDate").value || getLocalDate()
      });

  if (insertError) {
    await supabaseClient.storage
      .from("couple-media")
      .remove([filePath]);

    submitButton.disabled = false;

    setFormMessage(
      "photoMessage",
      "Medya kaydı oluşturulamadı. Özellik SQL dosyasının uygulanması gerekebilir: " +
      getErrorMessage(insertError)
    );
    return;
  }

  submitButton.disabled = false;

  photoForm.reset();

  document.getElementById("photoModal").close();

  showToast("Anımız albüme eklendi. ❤️");

  await loadPhotos();
});

/* =========================================
   MODAL PENCERELER
========================================= */

document.querySelectorAll("[data-open]").forEach(button => {
  button.addEventListener("click", () => {
    const modal = document.getElementById(button.dataset.open);

    if (modal) {
      if (modal.id === "accountSettingsModal") {
        populateAccountSettingsForm();
      }

      if (modal.id === "musicModal") {
        const shareCheckbox = document.getElementById("musicShared");
        shareCheckbox.checked = Boolean(currentProfile?.partner_id);
        shareCheckbox.disabled = !currentProfile?.partner_id;
      }

      modal.showModal();
    }
  });
});

function populateAccountSettingsForm() {
  accountSettingsForm.reset();
  settingsUsernameInput.value = currentProfile?.username || "";
  accountSettingsMessage.textContent = "";
}

accountSettingsForm.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser) {
    accountSettingsMessage.textContent =
      "Bu ayarları kullanmak için yeniden giriş yapmalısın.";
    return;
  }

  const username = settingsUsernameInput.value.trim();
  const currentUsername = currentProfile?.username || "";
  const shouldUpdateUsername = Boolean(username) && username !== currentUsername;
  const newPassword = settingsPasswordInput.value;
  const passwordConfirmation = settingsPasswordConfirmInput.value;
  const shouldUpdatePassword = Boolean(newPassword);
  const submitButton = accountSettingsForm.querySelector(
    'button[type="submit"]'
  );

  if (shouldUpdatePassword && newPassword.length < 8) {
    accountSettingsMessage.textContent =
      "Yeni şifren en az 8 karakter olmalı.";
    return;
  }

  if (shouldUpdatePassword && newPassword !== passwordConfirmation) {
    accountSettingsMessage.textContent =
      "Yeni şifreler birbiriyle eşleşmiyor.";
    return;
  }

  if (!shouldUpdateUsername && !shouldUpdatePassword) {
    accountSettingsMessage.textContent =
      "Değiştirmek istediğin kullanıcı adını veya yeni şifreni gir.";
    return;
  }

  submitButton.disabled = true;
  accountSettingsMessage.textContent = "Hesap ayarların kaydediliyor...";

  let usernameWasUpdated = false;

  try {
    if (shouldUpdateUsername) {
      // RLS remains the authority; the row filter limits this request to the signed-in user.
      const { data, error } = await supabaseClient
        .from("profiles")
        .update({ username })
        .eq("id", currentUser.id)
        .select("id, username")
        .maybeSingle();

      if (error) {
        accountSettingsMessage.textContent =
          "Kullanıcı adı güncellenemedi: " + getErrorMessage(error);
        return;
      }

      if (!data) {
        accountSettingsMessage.textContent =
          "Kullanıcı adı güncellenemedi. Supabase profiles tablosunda giriş yapan kişinin kendi satırını güncellemesine izin veren RLS politikası ve username-login işlevinin kullandığı username alanı gerekli.";
        return;
      }

      currentProfile = { ...(currentProfile || {}), username: data.username };
      usernameWasUpdated = true;
    }

    if (shouldUpdatePassword) {
      const { error } = await supabaseClient.auth.updateUser({
        password: newPassword
      });

      if (error) {
        accountSettingsMessage.textContent = usernameWasUpdated
          ? "Kullanıcı adın kaydedildi; şifre değiştirilemedi: " + getErrorMessage(error)
          : "Şifre değiştirilemedi: " + getErrorMessage(error);
        return;
      }
    }

    if (usernameWasUpdated) {
      await loadProfile();
    }

    document.getElementById("accountSettingsModal").close();
    accountSettingsForm.reset();
    showToast("Hesap ayarların güncellendi. ❤️");
  } catch (error) {
    accountSettingsMessage.textContent = usernameWasUpdated
      ? "Kullanıcı adın kaydedildi; diğer değişiklik tamamlanamadı: " + getErrorMessage(error)
      : "Hesap ayarları kaydedilemedi: " + getErrorMessage(error);
  } finally {
    settingsPasswordInput.value = "";
    settingsPasswordConfirmInput.value = "";
    submitButton.disabled = false;
  }
});

document.querySelectorAll("[data-close]").forEach(button => {
  button.addEventListener("click", () => {
    button.closest("dialog").close();
  });
});

document.querySelectorAll(".app-modal").forEach(modal => {
  modal.addEventListener("click", event => {
    if (event.target === modal) {
      modal.close();
    }
  });
});

/* Klasörler açılana kadar içerikleri gizle; her klasörde geri dönüş düğmesi göster. */
const folderGrid = document.querySelector(".folder-grid");
const collectionSections = [...document.querySelectorAll(".collection-section")];
const collectionTools = document.querySelector(".collection-tools");

function openCollection(sectionId, scrollTarget = null) {
  const section = document.getElementById(sectionId);
  if (!section || !section.classList.contains("collection-section")) return;
  folderGrid?.classList.add("is-hidden");
  collectionSections.forEach(item => item.classList.toggle("is-hidden", item !== section));
  collectionTools?.classList.remove("is-hidden");
  section.scrollIntoView({ behavior: "smooth", block: "start" });
  if (scrollTarget) setTimeout(() => scrollTarget.scrollIntoView({ behavior: "smooth", block: "center" }), 250);
}

function showFolders() {
  collectionSections.forEach(section => section.classList.add("is-hidden"));
  collectionTools?.classList.add("is-hidden");
  folderGrid?.classList.remove("is-hidden");
  folderGrid?.scrollIntoView({ behavior: "smooth", block: "start" });
}

collectionSections.forEach(section => {
  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "back-to-folders";
  backButton.textContent = "← Klasörlere dön";
  backButton.addEventListener("click", showFolders);
  section.prepend(backButton);
});

document.querySelectorAll("[data-scroll]").forEach(button => {
  button.addEventListener("click", () => openCollection(button.dataset.scroll));
});

globalSearch.addEventListener("input", applyCollectionFilters);
typeFilter.addEventListener("change", applyCollectionFilters);
dateFilter.addEventListener("change", applyCollectionFilters);
backgroundMusicSelect.addEventListener("change", saveSharedBackgroundMusicSelection);

/* =========================================
   ÇIKIŞ
========================================= */

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  logoutButton.textContent = "Çıkış yapılıyor...";

  const { error } = await supabaseClient.auth.signOut();

  logoutButton.disabled = false;
  logoutButton.textContent = "Çıkış";

  if (error) {
    showToast("Çıkış yapılamadı: " + getErrorMessage(error));
    return;
  }

  if (backgroundMusicChannel) {
    await supabaseClient.removeChannel(backgroundMusicChannel);
    backgroundMusicChannel = null;
  }
  backgroundMusicPlayer.pause();

  currentUser = null;
  currentProfile = null;

  showLogin();
});

/* =========================================
   OTURUM DEĞİŞİKLİKLERİ
========================================= */

supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    showLogin();

    resetSection.hidden = false;
    loginForm.style.display = "none";

    authMessage.textContent =
      "Yeni şifreni belirleyebilirsin. ❤️";
  }

  if (event === "SIGNED_OUT") {
    currentUser = null;
    currentProfile = null;
    showLogin();
  }
});

/* =========================================
   SAYFA AÇILIRKEN OTURUMU KONTROL ET
========================================= */

async function initializeApp() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    console.error("Oturum kontrolü başarısız:", error.message);
    return;
  }

  if (data.session?.user) {
    currentUser = data.session.user;
    await openUserWorld();
  }
}

initializeApp();
