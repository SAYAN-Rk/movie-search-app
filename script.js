// script.js

/* ====== CONFIG ====== */
const API_KEY = 'e617515d';
const API_URL = 'https://www.omdbapi.com/';
const RESULTS_PER_PAGE = 10; // OMDb returns 10 results per page

/* ====== localStorage KEYS and CACHE CONFIG ====== */
const FAVS_KEY = 'movie_app_favorites';
const CACHE_KEY = 'movie_app_cache_v1'; // store cached search responses
const RECENT_KEY = 'movie_app_recent_searches';
const CACHE_EXPIRY_MS = 1000 * 60 * 60 * 24; // 24 hours
const MAX_RECENT = 8;

/* ====== DOM REFERENCES ====== */
const searchForm = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');
const resultsDiv = document.getElementById('results');
const messageDiv = document.getElementById('message');
const loadMoreWrap = document.getElementById('loadMoreWrap');
const paginationNav = document.getElementById('pagination');
const recentWrap = document.getElementById('recentWrap');

const spinnerWrap = document.getElementById('spinnerWrap');

const modal = document.getElementById('modal');
const modalBackdrop = document.getElementById('modalBackdrop');
const closeModalBtn = document.getElementById('closeModal');
const movieDetailsDiv = document.getElementById('movieDetails');

const viewFavoritesBtn = document.getElementById('viewFavoritesBtn');
const clearFavoritesBtn = document.getElementById('clearFavoritesBtn');
const favCountSpan = document.getElementById('favCount');

/* ====== STATE ====== */
let currentQuery = '';
let currentPage = 1;
let totalResults = 0;
let viewingFavorites = false;

/* ====== Favorites management ====== */
function loadFavorites(){
  try { const raw = localStorage.getItem(FAVS_KEY); return raw ? JSON.parse(raw) : {}; }
  catch(e){ console.warn('fav parse error', e); return {}; }
}
function saveFavorites(obj){ localStorage.setItem(FAVS_KEY, JSON.stringify(obj)); }
let favorites = loadFavorites();
updateFavCount();

/* ====== Cache management ====== */
function loadCache(){ try { const raw = localStorage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) : {}; } catch(e){ return {}; } }
function saveCache(obj){ localStorage.setItem(CACHE_KEY, JSON.stringify(obj)); }
let cache = loadCache();

function makeCacheKey(query, page){ return `${query.toLowerCase().trim()}|${page}`; }

function cacheSet(query, page, data){
  const key = makeCacheKey(query, page);
  cache[key] = { ts: Date.now(), data };
  // save limited cache size (optional): keep last 60 entries
  const keys = Object.keys(cache);
  if (keys.length > 120) { // prune oldest 40
    const sorted = keys.sort((a,b)=> (cache[a].ts - cache[b].ts));
    for (let i=0;i<40;i++) delete cache[sorted[i]];
  }
  saveCache(cache);
}

function cacheGet(query, page){
  const key = makeCacheKey(query, page);
  if (!cache[key]) return null;
  const entry = cache[key];
  if (Date.now() - entry.ts > CACHE_EXPIRY_MS) { delete cache[key]; saveCache(cache); return null; }
  return entry.data;
}

/* ====== Recent searches management ====== */
function loadRecent(){ try { const raw = localStorage.getItem(RECENT_KEY); return raw ? JSON.parse(raw) : []; } catch(e){ return []; } }
function saveRecent(arr){ localStorage.setItem(RECENT_KEY, JSON.stringify(arr)); }
function addRecent(q){
  if (!q) return;
  const arr = loadRecent();
  const normalized = q.trim();
  // dedupe
  const filtered = arr.filter(x => x.toLowerCase() !== normalized.toLowerCase());
  filtered.unshift(normalized);
  if (filtered.length > MAX_RECENT) filtered.pop();
  saveRecent(filtered);
  renderRecent();
}
function renderRecent(){
  const arr = loadRecent();
  recentWrap.innerHTML = '';
  if (!arr.length) { recentWrap.setAttribute('aria-hidden','true'); return; }
  recentWrap.setAttribute('aria-hidden','false');
  arr.forEach(q=>{
    const b = document.createElement('button');
    b.className = 'recent-chip';
    b.textContent = q;
    b.addEventListener('click', ()=> {
      searchInput.value = q;
      searchMovies(q,1);
    });
    recentWrap.appendChild(b);
  });
}

/* ====== Utilities ====== */
function escapeHtml(str = ''){ return String(str).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
function getPlaceholderDataURI(){
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='450'>
    <rect width='100%' height='100%' fill='#efefef'/>
    <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#8a8a8a' font-size='20' font-family='Arial'>
      No Poster
    </text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
function showMessage(text, isError = false){ messageDiv.textContent = text; messageDiv.style.color = isError ? 'var(--danger)' : ''; }
function setLoading(loading){ if (loading) { spinnerWrap.classList.remove('hidden'); spinnerWrap.setAttribute('aria-hidden','false'); } else { spinnerWrap.classList.add('hidden'); spinnerWrap.setAttribute('aria-hidden','true'); } }
function updateFavCount(){ favCountSpan.textContent = Object.keys(favorites).length; }

/* ====== Search & Fetch (with caching) ====== */
async function searchMovies(query, page = 1){
  viewingFavorites = false;
  updateFavButtonState();

  if (!query) { showMessage('Please enter a movie title to search.', true); return; }
  currentQuery = query;
  currentPage = page;

  // Check cache first
  const cached = cacheGet(query, page);
  if (cached) {
    totalResults = parseInt(cached.totalResults || 0, 10) || 0;
    displayMovies(cached.Search || [], false);
    showMessage(`${totalResults} result(s) (from cache)`);
    renderPagination(currentPage, Math.ceil(totalResults / RESULTS_PER_PAGE));
    // still add to recent
    addRecent(query);
    return;
  }

  setLoading(true);
  showMessage('');
  const url = `${API_URL}?apikey=${API_KEY}&s=${encodeURIComponent(query)}&page=${page}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.Response === 'True') {
      totalResults = parseInt(data.totalResults, 10) || 0;
      displayMovies(data.Search || [], false);
      showMessage(`${totalResults} result(s)`);
      renderPagination(currentPage, Math.ceil(totalResults / RESULTS_PER_PAGE));
      // cache successful response
      cacheSet(query, page, data);
      addRecent(query);
    } else {
      totalResults = 0;
      resultsDiv.innerHTML = '';
      paginationNav.innerHTML = '';
      showMessage(data.Error || 'No results', true);
    }
  } catch (err) {
    console.error('Fetch error:', err);
    showMessage('Network error. Try again later.', true);
  } finally {
    setLoading(false);
  }
}

/* ====== Render Movies ====== */
function displayMovies(movies = [], append = false){
  if (!append) resultsDiv.innerHTML = '';

  movies.forEach(movie => {
    const card = document.createElement('article');
    card.className = 'movie-item';
    card.setAttribute('data-id', movie.imdbID);
    const posterSrc = (movie.Poster && movie.Poster !== 'N/A') ? movie.Poster : getPlaceholderDataURI();

    card.innerHTML = `
      <button class="fav-btn" data-id="${escapeHtml(movie.imdbID)}" title="Add to favorites">☆</button>
      <img src="${posterSrc}" alt="${escapeHtml(movie.Title)} poster" loading="lazy" />
      <div class="meta">
        <h3>${escapeHtml(movie.Title)}</h3>
        <p>${escapeHtml(movie.Year)} • ${escapeHtml(movie.Type || '')}</p>
      </div>
    `;

    // clicking card (not the fav button) opens details
    card.addEventListener('click', (e) => {
      if (e.target.closest('.fav-btn')) return; // ignore if fav clicked
      fetchMovieDetails(movie.imdbID);
    });

    // fav button
    const favBtn = card.querySelector('.fav-btn');
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // toggle in favorites
      toggleFavorite(movie);
      // animate pop
      favBtn.classList.add('pop');
      setTimeout(()=> favBtn.classList.remove('pop'), 500);
      // update UI state
      favBtn.classList.toggle('active', !!favorites[movie.imdbID]);
      favBtn.textContent = favorites[movie.imdbID] ? '★' : '☆';
    });

    // set initial fav state
    if (favorites[movie.imdbID]) {
      favBtn.classList.add('active');
      favBtn.textContent = '★';
    }

    resultsDiv.appendChild(card);
  });
}

/* ====== Pagination UI ====== */
function renderPagination(current, totalPages){
  paginationNav.innerHTML = '';
  if (totalPages <= 1) return;

  function makeBtn(text, page, isActive = false, disabled = false){
    const b = document.createElement('button');
    b.className = 'page-btn' + (isActive ? ' active' : '');
    b.textContent = text;
    b.disabled = !!disabled;
    b.addEventListener('click', () => {
      searchMovies(currentQuery, page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    return b;
  }

  paginationNav.appendChild(makeBtn('Prev', Math.max(1, current - 1), false, current === 1));

  const maxButtons = 7;
  let start = Math.max(1, current - Math.floor(maxButtons / 2));
  let end = start + maxButtons - 1;
  if (end > totalPages) { end = totalPages; start = Math.max(1, end - maxButtons + 1); }

  if (start > 1) {
    paginationNav.appendChild(makeBtn('1', 1));
    if (start > 2) {
      const dots = document.createElement('span'); dots.textContent = '...'; dots.style.padding = '8px 4px';
      paginationNav.appendChild(dots);
    }
  }

  for (let p = start; p <= end; p++) {
    paginationNav.appendChild(makeBtn(String(p), p, p === current));
  }

  if (end < totalPages) {
    if (end < totalPages - 1) {
      const dots = document.createElement('span'); dots.textContent = '...'; dots.style.padding = '8px 4px';
      paginationNav.appendChild(dots);
    }
    paginationNav.appendChild(makeBtn(String(totalPages), totalPages));
  }

  paginationNav.appendChild(makeBtn('Next', Math.min(totalPages, current + 1), false, current === totalPages));
}

/* ====== Details Modal ====== */
async function fetchMovieDetails(imdbID){
  if (!imdbID) return;
  setLoading(true);
  movieDetailsDiv.innerHTML = '<p>Loading details...</p>';
  openModal();
  try {
    // Try to use cache for details too (key page 0)
    const cacheKey = makeCacheKey(imdbID, 'DETAILS');
    // details cached under cache map too
    if (cache[cacheKey] && (Date.now() - cache[cacheKey].ts <= CACHE_EXPIRY_MS)) {
      displayMovieDetails(cache[cacheKey].data);
      setLoading(false);
      return;
    }

    const url = `${API_URL}?apikey=${API_KEY}&i=${encodeURIComponent(imdbID)}&plot=full`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.Response === 'True') {
      displayMovieDetails(data);
      // store details in cache under special key
      cache[cacheKey] = { ts: Date.now(), data };
      saveCache(cache);
    } else {
      movieDetailsDiv.innerHTML = `<p>${data.Error || 'Details not found'}</p>`;
    }
  } catch(err){
    console.error('Details fetch error', err);
    movieDetailsDiv.innerHTML = '<p>Network error while loading details.</p>';
  } finally {
    setLoading(false);
  }
}

function displayMovieDetails(m){
  const poster = (m.Poster && m.Poster !== 'N/A') ? m.Poster : getPlaceholderDataURI();
  const ratingsHtml = (m.Ratings && m.Ratings.length)
    ? `<p><strong>Ratings:</strong> ${m.Ratings.map(r => `${escapeHtml(r.Source)}: ${escapeHtml(r.Value)}`).join(' • ')}</p>`
    : '';

  movieDetailsDiv.innerHTML = `
    <div class="poster"><img src="${poster}" alt="${escapeHtml(m.Title)} poster" /></div>
    <div class="info">
      <h2>${escapeHtml(m.Title)} (${escapeHtml(m.Year)})</h2>
      <p><strong>Genre:</strong> ${escapeHtml(m.Genre || 'N/A')}</p>
      <p><strong>Director:</strong> ${escapeHtml(m.Director || 'N/A')}</p>
      <p><strong>Cast:</strong> ${escapeHtml(m.Actors || 'N/A')}</p>
      <p><strong>Runtime:</strong> ${escapeHtml(m.Runtime || 'N/A')}</p>
      <p><strong>Plot:</strong><br/> ${escapeHtml(m.Plot || 'N/A')}</p>
      ${ratingsHtml}
      <p style="margin-top:8px;color:#666;"><small>Released: ${escapeHtml(m.Released || 'N/A')} • Language: ${escapeHtml(m.Language || 'N/A')}</small></p>
      <div style="margin-top:12px;">
        <button id="modalFavBtn" class="chip">${favorites[m.imdbID] ? 'Remove Favorite' : 'Add to Favorites'}</button>
      </div>
    </div>
  `;

  const modalFavBtn = document.getElementById('modalFavBtn');
  modalFavBtn.addEventListener('click', () => {
    if (favorites[m.imdbID]) {
      removeFavorite(m.imdbID);
      modalFavBtn.textContent = 'Add to Favorites';
    } else {
      favorites[m.imdbID] = {
        imdbID: m.imdbID,
        Title: m.Title,
        Year: m.Year,
        Type: m.Type,
        Poster: m.Poster
      };
      saveFavorites(favorites);
      updateFavCount();
      modalFavBtn.textContent = 'Remove Favorite';
      // add a small visual feedback
      modalFavBtn.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)'}], { duration: 240, easing: 'ease-out' });
    }
    syncFavButtons();
  });
}

/* Modal open/close helpers */
function openModal(){ modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false'); document.body.style.overflow = 'hidden'; }
function closeModal(){ modal.classList.add('hidden'); modal.setAttribute('aria-hidden','true'); document.body.style.overflow = ''; }

/* ====== Favorites logic ====== */
function toggleFavorite(movie){
  if (!movie || !movie.imdbID) return;
  if (favorites[movie.imdbID]) { delete favorites[movie.imdbID]; }
  else {
    favorites[movie.imdbID] = {
      imdbID: movie.imdbID,
      Title: movie.Title,
      Year: movie.Year,
      Type: movie.Type,
      Poster: movie.Poster
    };
  }
  saveFavorites(favorites);
  updateFavCount();
}

function removeFavorite(imdbID){
  if (favorites[imdbID]) {
    delete favorites[imdbID];
    saveFavorites(favorites);
    updateFavCount();
    syncFavButtons();
    if (viewingFavorites) showFavorites();
  }
}

function syncFavButtons(){
  document.querySelectorAll('.fav-btn').forEach(btn => {
    const id = btn.getAttribute('data-id');
    if (favorites[id]) { btn.classList.add('active'); btn.textContent = '★'; }
    else { btn.classList.remove('active'); btn.textContent = '☆'; }
  });
}

/* ====== Favorites view ====== */
function showFavorites(){
  viewingFavorites = true;
  updateFavButtonState();
  paginationNav.innerHTML = '';
  const favArray = Object.values(favorites);
  if (!favArray.length) {
    resultsDiv.innerHTML = '';
    showMessage('No favorites yet. Add some movies to favorites!', true);
    return;
  }
  showMessage(`${favArray.length} favorite(s)`);
  resultsDiv.innerHTML = '';
  favArray.forEach(movie => {
    const card = document.createElement('article');
    card.className = 'movie-item';
    card.setAttribute('data-id', movie.imdbID);
    const posterSrc = (movie.Poster && movie.Poster !== 'N/A') ? movie.Poster : getPlaceholderDataURI();

    card.innerHTML = `
      <button class="fav-btn active" data-id="${escapeHtml(movie.imdbID)}" title="Remove from favorites">★</button>
      <img src="${posterSrc}" alt="${escapeHtml(movie.Title)} poster" loading="lazy" />
      <div class="meta">
        <h3>${escapeHtml(movie.Title)}</h3>
        <p>${escapeHtml(movie.Year)} • ${escapeHtml(movie.Type || '')}</p>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.fav-btn')) return;
      fetchMovieDetails(movie.imdbID);
    });

    const favBtn = card.querySelector('.fav-btn');
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFavorite(movie.imdbID);
      card.remove();
      if (!Object.keys(favorites).length) showMessage('No favorites yet. Add some movies to favorites!', true);
      else showMessage(`${Object.keys(favorites).length} favorite(s)`);
    });

    resultsDiv.appendChild(card);
  });
}

/* ====== Events ====== */
searchForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const q = searchInput.value.trim();
  if (!q) { showMessage('Please enter a movie title to search.', true); return; }
  searchMovies(q,1);
});

closeModalBtn.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', closeModal);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal(); });

// favorites button
viewFavoritesBtn.addEventListener('click', () => {
  if (viewingFavorites) {
    viewingFavorites = false;
    updateFavButtonState();
    if (currentQuery) searchMovies(currentQuery, currentPage);
    else { resultsDiv.innerHTML = ''; showMessage('Search for movies above to begin.'); }
  } else { showFavorites(); }
});

clearFavoritesBtn.addEventListener('click', () => {
  if (!Object.keys(favorites).length) { showMessage('No favorites to clear.', true); return; }
  if (!confirm('Clear all favorites?')) return;
  favorites = {};
  saveFavorites(favorites);
  updateFavCount();
  showFavorites();
});

// sync fav buttons on page load
function updateFavButtonState(){
  viewFavoritesBtn.textContent = viewingFavorites ? '🔙 Back' : '❤️ Favorites ';
  // ensure fav-count span inside
  const existing = viewFavoritesBtn.querySelector('.fav-count');
  if (existing) existing.remove();
  const span = document.createElement('span');
  span.id = 'favCount';
  span.className = 'fav-count';
  span.textContent = Object.keys(favorites).length;
  viewFavoritesBtn.appendChild(span);
}

/* initial UI */
(function init(){
  if (!currentQuery) showMessage('Search for movies above to begin.');
  updateFavCount();
  updateFavButtonState();
  renderRecent();
})();
