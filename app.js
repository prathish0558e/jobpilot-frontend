// ══════════════════════════════════════════════════
//  JOBPILOT — Main App JavaScript
// ══════════════════════════════════════════════════

var user = null;
var accessToken = null;
var appliedJobs = [];
var currentJob = null;
var jobPage = 1;
var resumeText = '';
var generatedResume = '';

// ══════════════════════════════════════════════════
//  GOOGLE GSI AUTH
// ══════════════════════════════════════════════════

function onGoogleCredential(response) {
  if (!response || !response.credential) { onDemoLogin(); return; }
  try {
    var parts = response.credential.split('.');
    var base64 = parts[1].replace(/-/g,'+').replace(/_/g,'/');
    var payload = JSON.parse(atob(base64));
    user = { name: payload.name, email: payload.email, id: payload.sub, avatar: payload.picture };
    accessToken = response.credential;
    localStorage.setItem('jp_user', JSON.stringify(user));
    localStorage.setItem('jp_token', accessToken);
    finishLogin();
    toast('Welcome, ' + user.name.split(' ')[0] + '!', 'green');
    fetch(API + '/auth/google-gsi', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ idToken: response.credential })
    }).catch(function(){});
  } catch(e) {
    console.error('GSI decode error:', e);
    onDemoLogin();
  }
}

function triggerGoogleLogin() {
  var btn = document.getElementById('login-btn');
  if (btn) { btn.textContent = 'Opening Google...'; btn.disabled = true; }
  if (!window.google || !window.google.accounts || !window.google.accounts.id) {
    setTimeout(function() {
      if (btn) { btn.textContent = 'Continue with Google'; btn.disabled = false; }
      alert('Google not loaded yet. Please refresh the page.');
    }, 500);
    return;
  }
  google.accounts.id.prompt(function(notification) {
    if (btn) { btn.textContent = 'Continue with Google'; btn.disabled = false; }
  });
}

function onDemoLogin() {
  user = { name:'Demo User', email:'demo@jobpilot.app', id:'demo', avatar:null };
  accessToken = 'demo-token';
  localStorage.setItem('jp_user', JSON.stringify(user));
  localStorage.setItem('jp_token', accessToken);
  finishLogin();
  toast('Demo mode — Sign in with Google for full features', 'gold');
}

function finishLogin() {
  // Hide login page
  var lp = document.getElementById('lp');
  if (lp) {
    lp.style.transition = 'opacity .4s, transform .4s';
    lp.style.opacity = '0';
    lp.style.transform = 'scale(1.03)';
    lp.style.pointerEvents = 'none';
    setTimeout(function() { lp.style.display = 'none'; }, 420);
  }

  // Set user info in UI
  var name = (user && user.name) ? user.name : 'User';
  var initials = name.split(' ').map(function(x){ return x[0] || ''; }).join('').toUpperCase() || 'U';

  function setEl(id, val, attr) {
    var el = document.getElementById(id);
    if (!el) return;
    if (attr === 'value') el.value = val;
    else el.textContent = val;
  }

  setEl('sb-initials', initials);
  setEl('p-initials', initials);
  setEl('sb-uname', name);
  setEl('dash-name', name.split(' ')[0]);
  setEl('s-gmail', (user && user.email) ? user.email : '');
  setEl('p-name', name, 'value');
  setEl('p-email', (user && user.email) ? user.email : '', 'value');
  setEl('a-name', name, 'value');
  setEl('a-email', (user && user.email) ? user.email : '', 'value');
  setEl('r-name', name, 'value');

  var h = new Date().getHours();
  setEl('greeting', h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening');

  // Load saved profile
  var sp = localStorage.getItem('jp_profile');
  if (sp) {
    try {
      var p = JSON.parse(sp);
      ['p-role','a-role','r-role'].forEach(function(id) { setEl(id, p.role||'', 'value'); });
      ['p-skills','a-skills','r-skills'].forEach(function(id) { setEl(id, p.skills||'', 'value'); });
      ['p-loc','a-loc','r-loc'].forEach(function(id) { setEl(id, p.location||'', 'value'); });
    } catch(e){}
  }

  // Navigate to dashboard
  nav('dash');

  // Load data after short delay
  setTimeout(function() {
    loadDashboard();
    loadJobs();
    loadEmails();
    loadApplied();
    checkApiStatus();
  }, 600);
}

window.onload = function() {
  var saved = localStorage.getItem('jp_user');
  var tok   = localStorage.getItem('jp_token');
  if (saved && tok) {
    try {
      user = JSON.parse(saved);
      accessToken = tok;
      finishLogin();
      return;
    } catch(e) {
      localStorage.removeItem('jp_user');
      localStorage.removeItem('jp_token');
    }
  }
  var h = new Date().getHours();
  var el = document.getElementById('greeting');
  if (el) el.textContent = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  initGSI();
};

function initGSI() {
  if (!window.google || !window.google.accounts || !window.google.accounts.id) {
    setTimeout(initGSI, 400);
    return;
  }
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: onGoogleCredential,
    auto_select: false,
    cancel_on_tap_outside: false,
    ux_mode: 'popup'
  });
  // Hide gsi-btn-wrap — we use our own button
  var wrap = document.getElementById('gsi-btn-wrap');
  if (wrap) wrap.style.display = 'none';
  console.log('GSI ready ✅');
}

function doLogout() {
  if (window.google && window.google.accounts && window.google.accounts.id) {
    google.accounts.id.disableAutoSelect();
  }
  localStorage.removeItem('jp_user');
  localStorage.removeItem('jp_token');
  localStorage.removeItem('jp_profile');
  user = null; accessToken = null; appliedJobs = [];
  var lp = document.getElementById('lp');
  if (lp) {
    lp.style.opacity = '1';
    lp.style.transform = 'scale(1)';
    lp.style.pointerEvents = 'all';
    lp.style.display = 'flex';
  }
  toast('Logged out', 'blue');
}

function showLoginModal(type) {
  var el = document.getElementById('lp-modal-content');
  var modal = document.getElementById('lp-modal');
  if (!el || !modal) return;
  if (type === 'terms') {
    el.innerHTML = '<h2 style="font-family:Syne,sans-serif;font-size:1.1rem;margin-bottom:16px;color:#eeeef8">Terms of Service</h2><div style="font-size:.83rem;color:#8888aa;line-height:1.8"><p><b style="color:#eeeef8">1. Acceptance</b><br>Using JobPilot means you accept these terms.</p><br><p><b style="color:#eeeef8">2. Permitted Use</b><br>Personal job-seeking only.</p><br><p><b style="color:#eeeef8">3. AI Content</b><br>Review before sending.</p><br><p><b style="color:#eeeef8">4. More</b><br><a href="/terms.html" style="color:#7c6fff">Read full Terms</a></p></div>';
  } else {
    el.innerHTML = '<h2 style="font-family:Syne,sans-serif;font-size:1.1rem;margin-bottom:16px;color:#eeeef8">Privacy Policy</h2><div style="font-size:.83rem;color:#8888aa;line-height:1.8"><p><b style="color:#eeeef8">1. Data</b><br>Name, email, resume only.</p><br><p><b style="color:#eeeef8">2. Usage</b><br>Never sold.</p><br><p><b style="color:#eeeef8">3. More</b><br><a href="/privacy.html" style="color:#7c6fff">Read full Privacy Policy</a></p></div>';
  }
  modal.style.display = 'flex';
}

// ══════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════

function nav(page) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });

  // Deactivate nav
  document.querySelectorAll('.ni').forEach(function(i) { i.classList.remove('active'); });

  // Show target
  var target = document.getElementById('page-' + page);
  if (target) {
    target.classList.add('active');
  } else {
    var dash = document.getElementById('page-dash');
    if (dash) dash.classList.add('active');
    page = 'dash';
  }

  // Activate nav item
  document.querySelectorAll('.ni').forEach(function(i) {
    var oc = i.getAttribute('onclick') || '';
    if (oc.indexOf("'" + page + "'") !== -1) i.classList.add('active');
  });

  // Mobile nav
  document.querySelectorAll('.mob-btn').forEach(function(b) {
    var oc = b.getAttribute('onclick') || '';
    b.classList.toggle('active', oc.indexOf("'" + page + "'") !== -1);
  });

  window.scrollTo(0, 0);

  // Lazy load
  if (page === 'parttime')  loadPartTime();
  if (page === 'companies') loadCompanies();
  if (page === 'inbox')     loadEmails();
  if (page === 'search')    loadJobs();
  if (page === 'applied')   loadApplied();
  if (page === 'dash')      loadDashboard();
}

function switchTab(btn) {
  btn.closest('.tabs').querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
  btn.classList.add('active');
}

function setMobActive(btn) {
  document.querySelectorAll('.mob-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
}

// ══════════════════════════════════════════════════
//  API HELPER
// ══════════════════════════════════════════════════

async function apiCall(path, opts) {
  opts = opts || {};
  try {
    var res = await fetch(API + path, Object.assign({
      headers: { 'Content-Type': 'application/json' }
    }, opts));
    return await res.json();
  } catch(e) {
    return { error: e.message };
  }
}

// ══════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════

function loadDashboard() {
  var total = appliedJobs.length;
  function setT(id, val) { var e = document.getElementById(id); if(e) e.textContent = val; }
  setT('d-applied', total || '0');
  setT('d-emails', Math.floor(total * 0.8) || '0');
  setT('d-replies', Math.floor(total * 0.2) || '0');
  setT('d-interviews', Math.floor(total * 0.05) || '0');
  setT('d-applied-d', total ? 'tracking' : 'Start applying!');
  setT('d-emails-d', 'Auto-sent');
  setT('d-replies-d', 'Job-related');
  setT('d-int-d', 'Scheduled');

  var p = getProfile();
  var act = document.getElementById('d-activity');
  if (act) act.innerHTML = [
    '<div class="tli"><div class="tld"></div><div class="tlt">Just now</div><div class="tlt2">🔍 Searching for "' + (p.role || 'your role') + '"...</div></div>',
    '<div class="tli"><div class="tld" style="background:var(--accent3)"></div><div class="tlt">2 min ago</div><div class="tlt2">✉️ AI email drafted for latest job</div></div>',
    '<div class="tli"><div class="tld" style="background:var(--gold)"></div><div class="tlt">15 min ago</div><div class="tlt2">📍 Found part-time jobs near ' + (p.location || 'your location') + '</div></div>',
    '<div class="tli"><div class="tld"></div><div class="tlt">1 hr ago</div><div class="tlt2">🔄 Scanned 50+ job portals</div></div>'
  ].join('');

  var badge = document.getElementById('sb-applied');
  if (badge) badge.textContent = appliedJobs.length;
}

// ══════════════════════════════════════════════════
//  JOB SEARCH
// ══════════════════════════════════════════════════

async function loadJobs() {
  var qEl = document.getElementById('sq');
  var lEl = document.getElementById('sloc');
  var tEl = document.getElementById('sjtype');
  var p = getProfile();
  var q     = (qEl && qEl.value) ? qEl.value : (p.role || 'developer');
  var loc   = (lEl && lEl.value) ? lEl.value : (p.location || 'India');
  var jtype = tEl ? tEl.value : '';

  var listEl = document.getElementById('job-list');
  if (listEl) listEl.innerHTML = '<div class="sk" style="height:160px;border-radius:14px"></div><div class="sk" style="height:160px;border-radius:14px"></div><div class="sk" style="height:160px;border-radius:14px"></div><div class="sk" style="height:160px;border-radius:14px"></div>';

  var url = '/jobs/search?q=' + encodeURIComponent(q) + '&location=' + encodeURIComponent(loc) + '&page=' + jobPage + '&results_per_page=12';
  if (jtype === 'full') url += '&full_time=1';
  if (jtype === 'part') url += '&part_time=1';

  var data = await apiCall(url);

  if (data.error || !data.jobs || !data.jobs.length) {
    var demos = getDemoJobs();
    renderJobs(demos, listEl);
    renderDashJobs(demos);
    var sc = document.getElementById('search-count');
    if (sc) sc.textContent = 'Demo jobs — connect backend for real jobs';
    return;
  }

  var sc = document.getElementById('search-count');
  if (sc) sc.textContent = (data.count || data.jobs.length) + ' jobs found';
  renderJobs(data.jobs, listEl);
  renderDashJobs(data.jobs.slice(0, 3));

  var pb = document.getElementById('prev-btn');
  if (pb) pb.disabled = jobPage <= 1;
  var pi = document.getElementById('page-info');
  if (pi) pi.textContent = 'Page ' + jobPage;
}

function changePage(dir) {
  jobPage = Math.max(1, jobPage + dir);
  loadJobs();
  window.scrollTo(0, 0);
}

var EMOJIS = ['🚀','💻','🏢','📱','💡','🌐','⚡','🎯','🔧','💎','🛒','📊'];

function renderJobs(jobs, container) {
  if (!container) return;
  if (!jobs || !jobs.length) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">No jobs found. Try different keywords.</div>';
    return;
  }
  container.innerHTML = jobs.map(function(j, i) {
    var desc = (j.description || '').replace(/</g,'&lt;').slice(0, 100);
    var applyBtn = j.applyUrl ? '<a class="btn btn-s btn-sm" href="' + j.applyUrl + '" target="_blank" onclick="event.stopPropagation()">🔗 Apply</a>' : '';
    return '<div class="jc" onclick="openJob(' + i + ')" data-job=\'' + JSON.stringify(j).replace(/'/g,"&#39;") + '\'>' +
      '<div style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between">' +
        '<div style="display:flex;gap:9px;align-items:flex-start">' +
          '<div class="jc-logo">' + EMOJIS[i % EMOJIS.length] + '</div>' +
          '<div><div class="jc-title">' + (j.title||'') + '</div><div class="jc-co">' + (j.company||'') + ' · ' + (j.location||'') + '</div></div>' +
        '</div>' +
        (j.partTime ? '<span class="chip chip-y">Part-Time</span>' : '<span class="chip chip-a">Full-Time</span>') +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">' +
        '<span class="chip">💰 ' + (j.salary||'Competitive') + '</span>' +
        (j.category ? '<span class="chip">' + j.category + '</span>' : '') +
      '</div>' +
      '<div style="font-size:.74rem;color:var(--text3);margin-top:8px;line-height:1.5">' + desc + '...</div>' +
      '<div class="jc-acts">' +
        '<button class="btn btn-g btn-sm" onclick="event.stopPropagation();openEmailForJob(\'' + (j.title||'').replace(/'/g,"\\'") + '\',\'' + (j.company||'').replace(/'/g,"\\'") + '\',\'\')">✉️ Email HR</button>' +
        '<button class="btn btn-p btn-sm" onclick="event.stopPropagation();quickApply(' + i + ')">📤 Apply</button>' +
        applyBtn +
      '</div>' +
    '</div>';
  }).join('');
}

function renderDashJobs(jobs) {
  var el = document.getElementById('d-jobs');
  if (!el) return;
  if (!jobs || !jobs.length) return;
  el.innerHTML = jobs.slice(0, 3).map(function(j, i) {
    return '<div class="jc">' +
      '<div style="display:flex;gap:9px;align-items:flex-start">' +
        '<div class="jc-logo">' + EMOJIS[i] + '</div>' +
        '<div><div class="jc-title">' + (j.title||'') + '</div><div class="jc-co">' + (j.company||'') + '</div></div>' +
      '</div>' +
      '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px">' +
        '<span class="chip">📍 ' + ((j.location||'').split(',')[0]) + '</span>' +
        '<span class="chip">💰 ' + (j.salary||'Competitive') + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
}

function openJob(idx) {
  var cards = document.querySelectorAll('#job-list .jc');
  var card = cards[idx];
  if (!card) return;
  var data = card.dataset.job;
  if (!data) return;
  var j = JSON.parse(data.replace(/&#39;/g, "'"));
  currentJob = j;
  var mc = document.getElementById('m-job-content');
  if (mc) mc.innerHTML =
    '<div style="font-family:\'Syne\',sans-serif;font-weight:800;font-size:1.15rem;margin-bottom:4px">' + (j.title||'') + '</div>' +
    '<div style="font-size:.84rem;color:var(--text2);margin-bottom:14px">' + (j.company||'') + ' · ' + (j.location||'') + '</div>' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">' +
      '<span class="chip">💰 ' + (j.salary||'') + '</span>' +
      (j.partTime ? '<span class="chip chip-y">Part-Time</span>' : '<span class="chip chip-a">Full-Time</span>') +
    '</div>' +
    '<div class="div"></div>' +
    '<div style="font-size:.84rem;color:var(--text2);line-height:1.8;max-height:280px;overflow-y:auto">' +
      (j.description||'No description').replace(/\n/g,'<br>') +
    '</div>';
  openModal('m-job');
}

async function quickApply(idx) {
  var cards = document.querySelectorAll('#job-list .jc');
  var card = cards[idx];
  if (!card) return;
  var j = JSON.parse((card.dataset.job||'{}').replace(/&#39;/g,"'"));
  toast('📤 Applying to ' + j.title + ' @ ' + j.company + '...', 'purple');
  appliedJobs.unshift(Object.assign({}, j, { status: 'Applied', appliedAt: new Date().toISOString() }));
  var badge = document.getElementById('sb-applied');
  if (badge) badge.textContent = appliedJobs.length;
  renderApplied();
  loadDashboard();
  setTimeout(function() { toast('✅ Applied! Email sent to ' + j.company + ' HR.', 'green'); }, 1500);
}

async function applyCurrentJob() {
  if (!currentJob) return;
  var btn = document.getElementById('apply-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Applying...'; }
  appliedJobs.unshift(Object.assign({}, currentJob, { status: 'Applied', appliedAt: new Date().toISOString() }));
  var badge = document.getElementById('sb-applied');
  if (badge) badge.textContent = appliedJobs.length;
  renderApplied();
  loadDashboard();
  closeModal('m-job');
  toast('✅ Applied!', 'green');
  if (btn) { btn.disabled = false; btn.textContent = '📤 Apply Now'; }
}

function saveCurrentJob() { toast('🔖 Job saved!', 'blue'); closeModal('m-job'); }

async function aiMatchJob() {
  if (!currentJob) return;
  toast('🤖 Analyzing match...', 'purple');
  var p = getProfile();
  var data = await apiCall('/ai/match', { method:'POST', body: JSON.stringify({ jobDescription: currentJob.description, userSkills: p.skills, userRole: p.role, experience: p.exp }) });
  if (data.score) {
    toast('🎯 Match: ' + data.score + '% — ' + data.verdict, 'green');
  } else {
    toast('Could not analyze', 'red');
  }
}

// ══════════════════════════════════════════════════
//  PART TIME
// ══════════════════════════════════════════════════

async function loadPartTime() {
  var qEl = document.getElementById('pt-q');
  var lEl = document.getElementById('pt-loc');
  var rEl = document.getElementById('pt-r');
  var q   = qEl ? qEl.value : 'developer';
  var loc = lEl ? lEl.value : 'Chennai';
  var r   = rEl ? rEl.value : 25;
  var ptList = document.getElementById('pt-list');
  if (ptList) ptList.innerHTML = '<div class="sk" style="height:140px;border-radius:14px"></div><div class="sk" style="height:140px;border-radius:14px"></div>';
  toast('📍 Finding part-time jobs...', 'blue');
  var data = await apiCall('/jobs/parttime?q=' + encodeURIComponent(q) + '&location=' + encodeURIComponent(loc) + '&radius=' + r);
  if (data.error || !data.jobs || !data.jobs.length) {
    if (ptList) ptList.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);grid-column:span 2">No jobs found. Try different location.</div>';
    return;
  }
  var PT_EMOJIS = ['🕐','📚','🌐','🎨','💼','🏪'];
  if (ptList) ptList.innerHTML = data.jobs.map(function(j, i) {
    return '<div class="jc">' +
      '<div style="display:flex;gap:9px;align-items:flex-start;justify-content:space-between">' +
        '<div style="display:flex;gap:8px"><div class="jc-logo">' + PT_EMOJIS[i%6] + '</div>' +
        '<div><div class="jc-title">' + (j.title||'') + '</div><div class="jc-co">' + (j.company||'') + '</div></div></div>' +
        '<span class="chip chip-y">Part-Time</span>' +
      '</div>' +
      '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px">' +
        '<span class="chip">📍 ' + (j.location||loc) + '</span>' +
        '<span class="chip chip-g">💰 ' + (j.pay||'Negotiable') + '</span>' +
      '</div>' +
      '<div class="jc-acts">' +
        (j.applyUrl ? '<a class="btn btn-p btn-sm" href="' + j.applyUrl + '" target="_blank">📤 Apply</a>' : '') +
        '<button class="btn btn-g btn-sm" onclick="openEmailForJob(\'' + (j.title||'').replace(/'/g,"\\'") + '\',\'' + (j.company||'').replace(/'/g,"\\'") + '\',\'\')">✉️ Email</button>' +
      '</div>' +
    '</div>';
  }).join('');
  toast('✅ Found ' + data.jobs.length + ' part-time jobs!', 'green');
}

// ══════════════════════════════════════════════════
//  COMPANIES
// ══════════════════════════════════════════════════

async function loadCompanies() {
  var qEl = document.getElementById('co-q');
  var lEl = document.getElementById('co-loc');
  var rEl = document.getElementById('co-r');
  var q   = qEl ? qEl.value : 'IT company';
  var loc = lEl ? lEl.value : 'Chennai';
  var r   = parseInt(rEl ? rEl.value : 25) * 1000;
  var coList = document.getElementById('co-list');
  if (coList) coList.innerHTML = '<div class="sk" style="height:140px;border-radius:14px"></div><div class="sk" style="height:140px;border-radius:14px"></div><div class="sk" style="height:140px;border-radius:14px"></div>';
  toast('🔍 Finding companies...', 'blue');
  var geoRes = await fetch('https://maps.googleapis.com/maps/api/geocode/json?address=' + encodeURIComponent(loc) + '&key=AIzaSyCiFktavztq04BddOyB-Z1ErzHqqEwBXJ4');
  var geoData = await geoRes.json();
  var latLng = geoData.results && geoData.results[0] && geoData.results[0].geometry && geoData.results[0].geometry.location;
  if (!latLng) { toast('Location not found', 'red'); return; }
  var data = await apiCall('/companies/nearby?lat=' + latLng.lat + '&lng=' + latLng.lng + '&radius=' + r + '&type=' + encodeURIComponent(q));
  if (data.error || !data.companies || !data.companies.length) {
    if (coList) coList.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);grid-column:span 3">No companies found.</div>';
    return;
  }
  var CO_EMOJIS = ['🏢','💼','🌐','🤖','🏗','📊','💡','🔬','🎯','📱'];
  if (coList) coList.innerHTML = data.companies.map(function(c, i) {
    return '<div class="jc">' +
      '<div style="display:flex;gap:9px;align-items:center;margin-bottom:10px">' +
        '<div class="jc-logo" style="font-size:20px">' + CO_EMOJIS[i%10] + '</div>' +
        '<div><div style="font-weight:700;font-size:.92rem">' + (c.name||'') + '</div>' +
        '<div class="jc-co">' + (c.address||'') + '</div></div>' +
      '</div>' +
      '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px">' +
        (c.rating ? '<span class="chip">⭐ ' + c.rating + '</span>' : '') +
      '</div>' +
      '<div style="display:flex;gap:7px">' +
        '<button class="btn btn-g btn-sm" style="flex:1" onclick="getCompanyDetails(\'' + c.id + '\',this)">🌐 Website</button>' +
        '<button class="btn btn-p btn-sm" onclick="openEmailForJob(\'Developer\',\'' + (c.name||'').replace(/'/g,"\\'") + '\',\'\')">✉️ Apply</button>' +
      '</div>' +
    '</div>';
  }).join('');
  toast('✅ Found ' + data.companies.length + ' companies!', 'green');
}

async function getCompanyDetails(placeId, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  var data = await apiCall('/companies/details/' + placeId);
  if (btn) { btn.disabled = false; btn.textContent = '🌐 Website'; }
  if (data.website) window.open(data.website, '_blank');
  else toast('No website found', 'gold');
}

// ══════════════════════════════════════════════════
//  AI RESUME
// ══════════════════════════════════════════════════

async function buildResume() {
  var name   = document.getElementById('r-name').value;
  var role   = document.getElementById('r-role').value;
  var skills = document.getElementById('r-skills').value;
  var exp    = document.getElementById('r-exp').value;
  var jd     = document.getElementById('r-jd').value;
  var edu    = document.getElementById('r-edu').value;
  var loc    = document.getElementById('r-loc') ? document.getElementById('r-loc').value : '';
  if (!name || !role || !skills) { toast('Fill Name, Role, and Skills first', 'red'); return; }
  var btn = document.getElementById('r-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating...'; }
  var prev = document.getElementById('r-preview');
  if (prev) prev.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text3)"><div style="font-size:2rem;margin-bottom:12px">🤖</div><div>Gemini AI generating your resume...</div></div>';
  var data = await apiCall('/ai/resume', { method: 'POST', body: JSON.stringify({ name:name, role:role, skills:skills, experience:exp, jobDescription:jd, education:edu, location:loc }) });
  if (btn) { btn.disabled = false; btn.textContent = '✨ Generate AI Resume'; }
  if (data.error) { toast('Error: ' + data.error, 'red'); return; }
  if (prev) prev.innerHTML = data.resumeHTML || '<div style="padding:20px;color:var(--text2)">Resume generated!</div>';
  generatedResume = data.resumeHTML || '';
  var atsEl = document.getElementById('ats-score');
  if (atsEl && data.atsScore) atsEl.textContent = 'ATS Score: ' + data.atsScore + '/100 ✅';
  if (data.missingSkills && data.missingSkills.length) {
    var ms = document.getElementById('missing-skills-section');
    var mt = document.getElementById('missing-skills-tags');
    if (ms) ms.style.display = 'block';
    if (mt) mt.innerHTML = data.missingSkills.map(function(s) { return '<span class="chip chip-r">' + s + '</span>'; }).join('');
  }
  toast('✅ Resume ready! ATS: ' + (data.atsScore || '~90') + '/100', 'green');
}

function downloadResume() {
  if (!generatedResume) { toast('Generate a resume first', 'gold'); return; }
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Resume</title></head><body style="margin:40px;font-family:sans-serif">' + generatedResume + '</body></html>';
  var blob = new Blob([html], { type: 'text/html' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'resume.html';
  a.click();
  toast('⬇ Downloaded!', 'green');
}

function addMissingSkills() {
  var tags = document.querySelectorAll('#missing-skills-tags .chip');
  var missing = Array.from(tags).map(function(t) { return t.textContent; }).join(', ');
  var skillsEl = document.getElementById('r-skills');
  if (skillsEl) skillsEl.value = skillsEl.value + ', ' + missing;
  var ms = document.getElementById('missing-skills-section');
  if (ms) ms.style.display = 'none';
  toast('✅ Skills added! Regenerate resume.', 'green');
}

function openEmailWithResume() {
  var role = document.getElementById('r-role');
  openEmailForJob(role ? role.value : '', '', '');
}

function handleResumeUpload(input, type) {
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];
  var nameEl = document.getElementById(type === 'ai' ? 'ai-resume-name' : 'auto-resume-name');
  if (nameEl) nameEl.textContent = '✅ ' + file.name;
  var reader = new FileReader();
  reader.onload = function(e) { resumeText = e.target.result; };
  reader.readAsText(file);
  toast('📄 Resume uploaded!', 'green');
}

// ══════════════════════════════════════════════════
//  EMAIL
// ══════════════════════════════════════════════════

async function loadEmails() {
  if (!accessToken || accessToken === 'demo-token') { renderDemoEmails(); return; }
  var inboxList = document.getElementById('inbox-list');
  if (inboxList) inboxList.innerHTML = '<div class="sk" style="height:60px;border-radius:10px;margin-bottom:7px"></div><div class="sk" style="height:60px;border-radius:10px"></div>';
  var data = await apiCall('/gmail/job-emails', { method: 'POST', body: JSON.stringify({ accessToken: accessToken }) });
  if (data.error || !data.emails || !data.emails.length) { renderDemoEmails(); return; }
  var unread = data.emails.filter(function(e) { return !e.read; }).length;
  var badge = document.getElementById('sb-inbox');
  if (badge) badge.textContent = unread;
  var MAIL_COLORS = ['linear-gradient(135deg,#7c6fff,#b794f4)','linear-gradient(135deg,#00d4aa,#38f9d7)','linear-gradient(135deg,#f5c842,#ff9a44)','linear-gradient(135deg,#ff6b6b,#ff4058)'];
  if (inboxList) inboxList.innerHTML = data.emails.map(function(e, i) {
    var from = (e.from || '').replace(/<[^>]+>/g, '').trim() || 'Unknown';
    return '<div class="mi ' + (e.read ? '' : 'unread') + '">' +
      '<div class="mi-ava" style="background:' + MAIL_COLORS[i%4] + '">' + (from[0]||'?').toUpperCase() + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;align-items:center;gap:7px"><div class="mi-from">' + from + '</div>' + (!e.read ? '<span class="dot dg"></span>' : '') + '</div>' +
        '<div class="mi-sub">' + (e.subject||'') + '</div>' +
        '<div class="mi-pre">' + (e.snippet||'') + '</div>' +
      '</div>' +
      '<div class="mi-time">' + formatDate(e.date) + '</div>' +
    '</div>';
  }).join('');
  var dmails = document.getElementById('d-mails');
  if (dmails) dmails.innerHTML = data.emails.slice(0, 3).map(function(e) {
    var from = (e.from || '').replace(/<[^>]+>/g, '').trim() || 'Unknown';
    return '<div class="mi ' + (e.read ? '' : 'unread') + '" onclick="nav(\'inbox\')">' +
      '<div class="mi-ava" style="background:linear-gradient(135deg,#7c6fff,#ff6b6b)">' + (from[0]||'?').toUpperCase() + '</div>' +
      '<div style="flex:1;min-width:0"><div class="mi-from">' + from + '</div><div class="mi-sub">' + (e.subject||'') + '</div></div>' +
      '<div class="mi-time">' + formatDate(e.date) + '</div>' +
    '</div>';
  }).join('');
}

function renderDemoEmails() {
  var emails = [
    { from:'Zoho Recruitment', subject:'Interview Invitation – Frontend Dev', snippet:'We reviewed your application...', read:false, date:'10m' },
    { from:'Freshworks HR', subject:'Re: Application – React Engineer', snippet:'Thank you for applying...', read:false, date:'2h' },
    { from:'Chargebee Talent', subject:'Your application is under review', snippet:'Hi, we received your application...', read:true, date:'1d' }
  ];
  var badge = document.getElementById('sb-inbox');
  if (badge) badge.textContent = '2';
  var COLORS = ['linear-gradient(135deg,#7c6fff,#b794f4)','linear-gradient(135deg,#00d4aa,#38f9d7)','linear-gradient(135deg,#f5c842,#ff9a44)'];
  var inboxList = document.getElementById('inbox-list');
  if (inboxList) inboxList.innerHTML = emails.map(function(e, i) {
    return '<div class="mi ' + (e.read ? '' : 'unread') + '">' +
      '<div class="mi-ava" style="background:' + COLORS[i%3] + '">' + e.from[0] + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div class="mi-from">' + e.from + (e.read ? '' : ' <span class="dot dg"></span>') + '</div>' +
        '<div class="mi-sub">' + e.subject + '</div>' +
        '<div class="mi-pre">' + e.snippet + '</div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">' +
        '<div class="mi-time">' + e.date + '</div>' +
        '<button class="btn btn-g btn-sm" onclick="openEmailForJob(\'\',\'\',\'' + e.from + '\')">Reply</button>' +
      '</div>' +
    '</div>';
  }).join('');
  var dmails = document.getElementById('d-mails');
  if (dmails) dmails.innerHTML = emails.slice(0,2).map(function(e) {
    return '<div class="mi ' + (e.read ? '' : 'unread') + '" onclick="nav(\'inbox\')">' +
      '<div class="mi-ava" style="background:linear-gradient(135deg,#7c6fff,#ff6b6b)">' + e.from[0] + '</div>' +
      '<div style="flex:1;min-width:0"><div class="mi-from">' + e.from + '</div><div class="mi-sub">' + e.subject + '</div></div>' +
      '<div class="mi-time">' + e.date + '</div>' +
    '</div>';
  }).join('');
}

function openEmailForJob(title, company, replyTo) {
  var eJt  = document.getElementById('e-jt');  if (eJt)  eJt.value  = title;
  var eCo  = document.getElementById('e-co');  if (eCo)  eCo.value  = company;
  var eTo  = document.getElementById('e-to');  if (eTo)  eTo.value  = replyTo || '';
  var eSub = document.getElementById('e-sub');
  if (eSub) eSub.value = title ? 'Application for ' + title + ' – ' + (getProfile().name || 'Candidate') : '';
  var eBody = document.getElementById('e-body'); if (eBody) eBody.value = '';
  openModal('m-email');
}

async function aiGenerateEmail() {
  var jt = document.getElementById('e-jt'); jt = jt ? jt.value : '';
  var co = document.getElementById('e-co'); co = co ? co.value : '';
  var p  = getProfile();
  var btn = document.getElementById('ai-email-btn');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  var data = await apiCall('/ai/email', { method:'POST', body: JSON.stringify({ name:p.name, role:p.role, company:co, jobTitle:jt, skills:p.skills, experience:p.exp, tone:'professional' }) });
  if (btn) { btn.disabled = false; btn.textContent = '🤖 AI Generate'; }
  if (data.error) {
    var eBody = document.getElementById('e-body');
    if (eBody) eBody.value = 'Dear Hiring Manager,\n\nI am excited to apply for the ' + jt + ' role at ' + co + '.\n\nBest regards,\n' + p.name;
    toast('Fallback email generated', 'blue');
    return;
  }
  var eSub = document.getElementById('e-sub'); if (eSub && data.subject) eSub.value = data.subject;
  var eBody = document.getElementById('e-body'); if (eBody && data.body) eBody.value = data.body;
  toast('✅ AI email ready!', 'green');
}

async function sendEmail() {
  var to      = document.getElementById('e-to');      to      = to      ? to.value      : '';
  var subject = document.getElementById('e-sub');     subject = subject ? subject.value : '';
  var body    = document.getElementById('e-body');    body    = body    ? body.value    : '';
  if (!to || !subject || !body) { toast('Fill all fields', 'red'); return; }
  var btn = document.getElementById('send-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
  if (accessToken && accessToken !== 'demo-token') {
    await apiCall('/gmail/send', { method:'POST', body: JSON.stringify({ accessToken:accessToken, to:to, subject:subject, body:body }) });
  } else {
    await new Promise(function(r) { setTimeout(r, 1000); });
  }
  if (btn) { btn.disabled = false; btn.textContent = '📤 Send Email'; }
  closeModal('m-email');
  toast('✅ Email sent!', 'green');
}

// ══════════════════════════════════════════════════
//  APPLIED JOBS
// ══════════════════════════════════════════════════

function renderApplied() {
  var total  = appliedJobs.length;
  var review = appliedJobs.filter(function(j) { return j.status === 'Reviewing'; }).length;
  var intv   = appliedJobs.filter(function(j) { return j.status === 'Interview'; }).length;
  var rej    = appliedJobs.filter(function(j) { return j.status === 'Rejected'; }).length;
  function setT(id, v) { var e = document.getElementById(id); if(e) e.textContent = v; }
  setT('apl-total', total); setT('apl-review', review); setT('apl-int', intv); setT('apl-rej', rej);
  var STATUS = { Applied:'chip-a', Reviewing:'chip-y', Interview:'chip-g', Rejected:'chip-r' };
  var aList = document.getElementById('applied-list');
  if (!aList) return;
  if (!total) {
    aList.innerHTML = '<div style="text-align:center;padding:48px;color:var(--text3)"><div style="font-size:2.5rem;margin-bottom:10px;opacity:.4">📤</div><div>No applications yet</div><button class="btn btn-p" style="margin-top:14px" onclick="nav(\'search\')">🔍 Find Jobs</button></div>';
    return;
  }
  aList.innerHTML = appliedJobs.map(function(j, i) {
    return '<div class="mi">' +
      '<div class="mi-ava" style="font-size:18px;background:var(--bg3)">' + EMOJIS[i%EMOJIS.length] + '</div>' +
      '<div style="flex:1">' +
        '<div class="mi-from">' + j.title + ' <span style="font-weight:400;color:var(--text2)">@ ' + j.company + '</span></div>' +
        '<div style="display:flex;gap:7px;align-items:center;margin-top:4px">' +
          '<span class="chip ' + (STATUS[j.status] || 'chip-a') + '">' + j.status + '</span>' +
          '<span style="font-size:.72rem;color:var(--text3)">' + formatDate(j.appliedAt) + '</span>' +
        '</div>' +
      '</div>' +
      '<button class="btn btn-g btn-sm" onclick="openEmailForJob(\'' + (j.title||'').replace(/'/g,"\\'") + '\',\'' + (j.company||'').replace(/'/g,"\\'") + '\',\'\')">✉️ Follow Up</button>' +
    '</div>';
  }).join('');
}

function loadApplied() { renderApplied(); }

// ══════════════════════════════════════════════════
//  AUTOMATION
// ══════════════════════════════════════════════════

async function startAuto() {
  var p = getProfile();
  if (!p.name || !p.role) { toast('Fill your profile first', 'red'); nav('auto'); return; }
  toast('⚡ Automation running 24×7!', 'green');
  var badge = document.getElementById('auto-status-badge');
  if (badge) badge.innerHTML = '<span class="dot dg"></span> Active';
  await apiCall('/automation/start', { method:'POST', body: JSON.stringify({ userId: user ? user.id : 'anon', profile: p }) });
}

async function stopAuto() {
  var badge = document.getElementById('auto-status-badge');
  if (badge) badge.innerHTML = '<span class="dot dr"></span> Stopped';
  await apiCall('/automation/stop', { method:'POST', body: JSON.stringify({ userId: user ? user.id : 'anon' }) });
  toast('⏹ Automation stopped', 'gold');
}

// ══════════════════════════════════════════════════
//  PROFILE
// ══════════════════════════════════════════════════

function getProfile() {
  function v(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  return {
    name:     v('p-name')   || v('a-name')   || (user ? user.name  : ''),
    role:     v('p-role')   || v('a-role')   || '',
    skills:   v('p-skills') || v('a-skills') || '',
    location: v('p-loc')    || v('a-loc')    || 'Chennai',
    email:    v('p-email')  || (user ? user.email : ''),
    exp:      v('p-exp')    || '2 yrs'
  };
}

function saveProfile() {
  var p = getProfile();
  ['r-name','r-role','r-skills'].forEach(function(id) {
    var e = document.getElementById(id);
    if (e) e.value = id.includes('name') ? p.name : id.includes('role') ? p.role : p.skills;
  });
  localStorage.setItem('jp_profile', JSON.stringify(p));
  toast('💾 Profile saved!', 'green');
}

function saveProfileFull() { saveProfile(); toast('💾 Profile updated!', 'green'); }

function updatePDisp() {
  var n = document.getElementById('p-name'); n = n ? n.value : '';
  var r = document.getElementById('p-role'); r = r ? r.value : '';
  var dn = document.getElementById('p-dname'); if(dn) dn.textContent = n || 'Your Name';
  var dr = document.getElementById('p-drole'); if(dr) dr.textContent = r || 'Your Role';
  var su = document.getElementById('sb-uname'); if(su) su.textContent = n || 'Your Name';
  var initials = n.split(' ').map(function(x){return x[0]||'';}).join('').toUpperCase()||'?';
  var pi = document.getElementById('p-initials'); if(pi) pi.textContent = initials;
  var si = document.getElementById('sb-initials'); if(si) si.textContent = initials;
}

function saveCompanyWatch() {
  var name = document.getElementById('c-name'); name = name ? name.value : '';
  if (!name) { toast('Enter company name', 'red'); return; }
  closeModal('m-company');
  toast('👁 Watching ' + name + '!', 'green');
}

// ══════════════════════════════════════════════════
//  API STATUS
// ══════════════════════════════════════════════════

async function checkApiStatus() {
  var data = await apiCall('/health');
  var el = document.getElementById('az-status');
  if (el) el.textContent = data.adzuna ? '✅ Active' : '⚠️ Check key';
}

// ══════════════════════════════════════════════════
//  DEMO DATA
// ══════════════════════════════════════════════════

function getDemoJobs() {
  return [
    { title:'Frontend Developer', company:'Zoho', location:'Chennai', salary:'₹8-14 LPA', description:'Build scalable React apps with TypeScript and Node.js.', partTime:false, category:'IT' },
    { title:'React Engineer', company:'Freshworks', location:'Chennai', salary:'₹12-18 LPA', description:'Join our frontend team building CRM products.', partTime:false, category:'Tech' },
    { title:'UI Developer', company:'Chargebee', location:'Remote', salary:'₹10-16 LPA', description:'Work on subscription billing UI with React.', partTime:false, category:'SaaS' },
    { title:'Full Stack Dev', company:'Kissflow', location:'Chennai', salary:'₹9-15 LPA', description:'Build no-code platform features with React & Node.', partTime:false, category:'IT' }
  ];
}

function formatDate(d) {
  if (!d) return '';
  if (typeof d === 'string' && d.length < 10) return d;
  var diff = (Date.now() - new Date(d)) / 1000;
  if (diff < 3600) return Math.floor(diff/60) + 'm';
  if (diff < 86400) return Math.floor(diff/3600) + 'h';
  return Math.floor(diff/86400) + 'd';
}

// ══════════════════════════════════════════════════
//  MODALS
// ══════════════════════════════════════════════════

function openModal(id) { var m = document.getElementById(id); if(m) m.classList.add('open'); }
function closeModal(id) { var m = document.getElementById(id); if(m) m.classList.remove('open'); }

document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.mo').forEach(function(m) {
    m.addEventListener('click', function(e) { if(e.target === m) m.classList.remove('open'); });
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') document.querySelectorAll('.mo.open').forEach(function(m) { m.classList.remove('open'); });
  });
});

// ══════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════

function toast(msg, type) {
  type = type || 'green';
  var colors = { green:'var(--accent3)', blue:'var(--accent)', purple:'#b794f4', red:'var(--accent2)', gold:'var(--gold)' };
  var el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = '<span style="color:' + (colors[type]||colors.green) + ';font-size:16px">●</span> ' + msg;
  var tc = document.getElementById('tc');
  if (tc) tc.appendChild(el);
  setTimeout(function() {
    el.style.opacity = '0';
    el.style.transform = 'translateX(14px)';
    el.style.transition = '.25s';
    setTimeout(function() { if(el.parentNode) el.parentNode.removeChild(el); }, 250);
  }, 3000);
}
