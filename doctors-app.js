/**
 * دليل أطباء مصر - التطبيق الرئيسي
 * الإصدار: 2.0
 * Vanilla JavaScript - لا توجد مكتبات خارجية
 *
 * الملفات المطلوبة (استضفها على GitHub Raw أو أي CDN):
 *   data/labs.json         — 291 معمل تحاليل
 *   data/specialties.json  — 31 تخصص طبي + إحصاءات
 *   data/hospitals-stats.json — إحصاءات المنشآت
 *
 * استبدل BASE_URL بالرابط الأساسي لملفات البيانات
 */

(function () {
  'use strict';

  // ============================================================
  // CONFIG — غيّر هذا الرابط للرابط الفعلي لملفات البيانات
  // ============================================================
  const BASE_URL = 'https://cdn.jsdelivr.net/gh/m7mdaleem-cloud/data@main';

  const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 ساعة
  const PAGE_SIZE = 24; // عدد البطاقات في كل صفحة

  // ============================================================
  // DATA CACHE (localStorage)
  // ============================================================
  const Cache = {
    set(key, data) {
      try {
        localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
      } catch (e) { /* Quota exceeded - ignore */ }
    },
    get(key) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const { ts, data } = JSON.parse(raw);
        if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(key); return null; }
        return data;
      } catch { return null; }
    }
  };

  // ============================================================
  // DATA LOADER
  // ============================================================
  async function fetchJSON(filename, cacheKey) {
    const cached = Cache.get(cacheKey);
    if (cached) return cached;

    const res = await fetch(BASE_URL + '/' + filename);
    if (!res.ok) throw new Error('فشل تحميل ' + filename);
    const json = await res.json();
    Cache.set(cacheKey, json);
    return json;
  }

  // ============================================================
  // STATE
  // ============================================================
  const State = {
    labs: [],
    filteredLabs: [],
    labsPage: 0,
    specialties: [],
    hospitals: [],
    currentTab: 'labs',
    loaded: { labs: false, specialties: false, hospitals: false }
  };

  // ============================================================
  // HELPERS
  // ============================================================
  function el(id) { return document.getElementById(id); }

  function setBadgeClass(type) {
    if (!type) return 'lab-badge badge-private';
    if (type === 'سلسلة') return 'lab-badge badge-chain';
    if (type === 'حكومي') return 'lab-badge badge-gov';
    return 'lab-badge badge-private';
  }

  function formatPhone(phone) {
    if (!phone) return null;
    return String(phone).replace(/\s+/g, '').replace(/^00/, '+');
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatCount(n) {
    return Number(n).toLocaleString('ar-EG');
  }

  // تطبيع النص العربي للبحث: إزالة التشكيل + توحيد الهمزات + حذف "ال"
  function normalizeAr(str) {
    if (!str) return '';
    return String(str)
      .replace(/[\u064B-\u065F\u0670]/g, '') // حذف التشكيل
      .replace(/[أإآا]/g, 'ا')               // توحيد الهمزات والألف
      .replace(/ة/g, 'ه')                    // ة → ه
      .replace(/ى/g, 'ي')                    // ى → ي
      .replace(/^ال/, '')                    // حذف "ال" من أول الكلمة
      .replace(/\s+ال/g, ' ')               // حذف "ال" بعد مسافة
      .toLowerCase()
      .trim();
  }

  // ============================================================
  // LAB CARD RENDERER
  // ============================================================
  function renderLabCard(lab) {
    const phone = formatPhone(lab.phone);
    const hasPhone = !!phone;
    const hasMap = !!lab.maps_url;
    const govLabel = lab.governorate || 'غير محدد';
    const areaLabel = [lab.branch, lab.area].filter(Boolean).join(' - ') || '';
    const addrLabel = lab.address || '';
    const typeLabel = lab.lab_type || '';

    return `
<article class="lab-card" role="listitem" itemscope itemtype="https://schema.org/MedicalClinic">
  <div class="lab-header">
    <h3 class="lab-name" itemprop="name">${escapeHTML(lab.name)}</h3>
    ${typeLabel ? `<span class="${setBadgeClass(typeLabel)}">${escapeHTML(typeLabel)}</span>` : ''}
  </div>
  <div class="lab-info">
    <div class="lab-info-row">
      <span class="ico">📍</span>
      <span itemprop="address" itemscope itemtype="https://schema.org/PostalAddress">
        <span itemprop="addressRegion">${escapeHTML(govLabel)}</span>${areaLabel ? ' · ' + escapeHTML(areaLabel) : ''}
      </span>
    </div>
    ${addrLabel ? `
    <div class="lab-info-row">
      <span class="ico">🏠</span>
      <span itemprop="streetAddress">${escapeHTML(addrLabel)}</span>
    </div>` : ''}
    ${hasPhone ? `
    <div class="lab-info-row">
      <span class="ico">📞</span>
      <span itemprop="telephone">${escapeHTML(phone)}</span>
    </div>` : ''}
  </div>
  <div class="lab-actions">
    ${hasMap ? `<a href="${escapeHTML(lab.maps_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-map">🗺️ خريطة جوجل</a>` : ''}
    ${hasPhone ? `<a href="tel:${escapeHTML(phone)}" class="btn btn-call">📞 اتصل الآن</a>` : ''}
  </div>
</article>`;
  }

  // ============================================================
  // LABS — RENDER & FILTER
  // ============================================================
  function renderLabs() {
    const grid = el('labs-grid');
    const moreWrap = el('labsMore');
    const countEl = el('labsCount');
    if (!grid) return;

    const { filteredLabs, labsPage } = State;
    const total = filteredLabs.length;
    const slice = filteredLabs.slice(0, (labsPage + 1) * PAGE_SIZE);

    if (total === 0) {
      grid.innerHTML = `<div class="empty-msg" style="grid-column:1/-1"><span class="ico">🔍</span><p>لا توجد نتائج — جرّب تغيير فلاتر البحث</p></div>`;
      if (moreWrap) moreWrap.style.display = 'none';
      if (countEl) countEl.textContent = '';
      return;
    }

    grid.innerHTML = slice.map(renderLabCard).join('');
    if (countEl) countEl.textContent = `عرض ${slice.length} من ${formatCount(total)} معمل`;
    if (moreWrap) moreWrap.style.display = slice.length < total ? 'block' : 'none';
  }

  function filterLabs() {
    const govVal = (el('govFilter') ? el('govFilter').value : '').trim();
    const typeVal = (el('typeFilter') ? el('typeFilter').value : '').trim();
    const query = (el('globalSearch') ? el('globalSearch').value : '').trim().toLowerCase();

    State.filteredLabs = State.labs.filter(lab => {
      if (govVal && lab.governorate !== govVal) return false;
      if (typeVal && lab.lab_type !== typeVal) return false;
      if (query) {
        const haystack = normalizeAr(
          [lab.name, lab.branch, lab.area, lab.governorate, lab.address]
            .filter(Boolean).join(' ')
        );
        if (!haystack.includes(normalizeAr(query))) return false;
      }
      return true;
    });
    State.labsPage = 0;
    renderLabs();
  }

  function loadMoreLabs() {
    State.labsPage++;
    renderLabs();
    // scroll to new content
    const grid = el('labs-grid');
    if (grid) {
      const lastCard = grid.querySelector('.lab-card:last-child');
      if (lastCard) lastCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // ============================================================
  // SPECIALTIES — RENDER
  // ============================================================
  function renderSpecialties() {
    const grid = el('specialties-grid');
    if (!grid) return;

    if (!State.specialties.length) {
      grid.innerHTML = '<div class="loading-wrap"><div class="spinner"></div><p>جارٍ التحميل...</p></div>';
      return;
    }

    grid.innerHTML = State.specialties.map(s => {
      const subs = (s.subspecialties || []).join(' · ');
      return `
<article class="spec-card" role="listitem" itemscope itemtype="https://schema.org/MedicalSpecialty">
  <span class="spec-icon">${s.icon || '👨‍⚕️'}</span>
  <div class="spec-name" itemprop="name">${escapeHTML(s.specialty_ar)}</div>
  <span class="spec-count">${formatCount(s.total_doctors)} طبيب</span>
  ${subs ? `<div class="spec-subs">${escapeHTML(subs)}</div>` : ''}
</article>`;
    }).join('');
  }

  // ============================================================
  // HOSPITALS STATS — RENDER
  // ============================================================
  function renderHospitals() {
    const wrap = el('hospitals-wrap');
    if (!wrap) return;

    if (!State.hospitals.length) {
      wrap.innerHTML = '<div class="loading-wrap"><div class="spinner"></div><p>جارٍ التحميل...</p></div>';
      return;
    }

    const rows = State.hospitals.map(h => `
<tr>
  <td>${escapeHTML(h.name)}</td>
  <td class="num">${formatCount(h.count)}</td>
</tr>`).join('');

    wrap.innerHTML = `
<table class="stats-table" role="table" summary="إحصاءات المنشآت الطبية في مصر">
  <thead>
    <tr>
      <th scope="col">البيان</th>
      <th scope="col" style="text-align:center">العدد</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;
  }

  // ============================================================
  // TAB SWITCHER
  // ============================================================
  function showTab(tab) {
    State.currentTab = tab;
    const sections = ['labs', 'specialties', 'hospitals'];
    sections.forEach(t => {
      const sec = el(t + '-section');
      const btn = el('tab-' + t);
      if (sec) sec.style.display = t === tab ? 'block' : 'none';
      if (btn) {
        btn.classList.toggle('active', t === tab);
        btn.setAttribute('aria-selected', t === tab ? 'true' : 'false');
      }
    });

    // Lazy load on first open
    if (tab === 'specialties' && !State.loaded.specialties) loadSpecialties();
    if (tab === 'hospitals' && !State.loaded.hospitals) loadHospitals();
  }

  // ============================================================
  // GLOBAL SEARCH
  // ============================================================
  function search() {
    const query = el('globalSearch') ? el('globalSearch').value.trim() : '';
    if (!query) return;
    // Switch to labs and filter
    showTab('labs');
    filterLabs();
  }

  // ============================================================
  // DATA LOADERS
  // ============================================================
  async function loadLabs() {
    const grid = el('labs-grid');
    try {
      const json = await fetchJSON('labs.json', 'dr_labs_v1');
      State.labs = json.labs || [];
      State.filteredLabs = [...State.labs];
      renderLabs();
      State.loaded.labs = true;
    } catch (err) {
      console.error('خطأ في تحميل المعامل:', err);
      if (grid) grid.innerHTML = `
<div class="empty-msg" style="grid-column:1/-1">
  <span class="ico">⚠️</span>
  <p>حدث خطأ في تحميل البيانات. تأكد من رابط CDN في إعدادات الموقع.</p>
  <p style="font-size:.8rem;margin-top:8px;color:#999;">${err.message}</p>
</div>`;
    }
  }

  async function loadSpecialties() {
    try {
      const json = await fetchJSON('specialties.json', 'dr_spec_v1');
      State.specialties = json.specialties || [];
      renderSpecialties();
      State.loaded.specialties = true;
    } catch (err) {
      console.error('خطأ في تحميل التخصصات:', err);
    }
  }

  async function loadHospitals() {
    try {
      const json = await fetchJSON('hospitals-stats.json', 'dr_hosp_v1');
      State.hospitals = json.stats || [];
      renderHospitals();
      State.loaded.hospitals = true;
    } catch (err) {
      console.error('خطأ في تحميل المستشفيات:', err);
    }
  }

  // ============================================================
  // STRUCTURED DATA INJECTION (JSON-LD per lab)
  // ============================================================
  function injectLabsStructuredData(labs) {
    const subset = labs.slice(0, 10); // أول 10 معامل فقط
    const items = subset.map((lab, i) => ({
      '@type': 'MedicalClinic',
      'name': lab.name,
      'address': {
        '@type': 'PostalAddress',
        'addressRegion': lab.governorate,
        'streetAddress': lab.address || lab.area || '',
        'addressCountry': 'EG'
      },
      ...(lab.phone ? { 'telephone': formatPhone(lab.phone) } : {}),
      ...(lab.maps_url ? { 'hasMap': lab.maps_url } : {})
    }));

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      'name': 'معامل التحاليل في مصر',
      'numberOfItems': labs.length,
      'itemListElement': items.map((item, i) => ({
        '@type': 'ListItem',
        'position': i + 1,
        'item': item
      }))
    });
    document.head.appendChild(script);
  }

  // ============================================================
  // INIT
  // ============================================================
  function init() {
    // Only run on index page (check for presence of key elements)
    if (!el('labs-grid')) return;

    loadLabs().then(() => {
      if (State.labs.length > 0) {
        injectLabsStructuredData(State.labs);
      }
    });

    // Set up live search with debounce
    const searchInput = el('globalSearch');
    if (searchInput) {
      let debounceTimer;
      searchInput.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(filterLabs, 320);
      });
    }
  }

  // ============================================================
  // PUBLIC API — accessible as window.APP
  // ============================================================
  window.APP = {
    showTab,
    filterLabs,
    loadMoreLabs,
    search,
    getState: () => State
  };

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
