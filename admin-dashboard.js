// ============================================================
//  admin-dashboard.js — BrightSchool Result Broadsheet v3
//  All 10 issues resolved
// ============================================================
import {
  onAuthChange, authLogout,
  changeUserPassword, getCurrentUser,
  db, firestoreDoc, firestoreGetDoc,
  firestoreCollection, firestoreGetDocs,
  addStudent, updateStudent, deleteStudent, restoreStudent,
  graduateStudent, transferStudent, changeStudentReg,
  getAllStudents, getActiveStudents, getAlumniStudents, getInactiveStudents,
  getStudentsByClass, getStudentsByClassArm, getStudentByReg,
  saveScore, saveScoresBatch, deleteScoreById, tagAllUntaggedScores,
  getScoresByClassArmSubjectTerm, getScoresByClassArmTerm,
  getScoresByStudentTerm,
  saveClassSubjects, getClassSubjects, getSubjectsBySection,
  saveRemark, getRemarksByClassArmTerm, getRemarkByStudentTerm,
  saveSession, getSession, saveTeachers, getTeachers,
  approveResults, revokeApproval, getAllApprovals,
  fixAllStudentClassArms,
  getPendingUsers, approvePendingUser,
  saveTeacherNames, getTeacherNames,
  saveAttendance, saveAttendanceBatch, getAttendanceByClassDate,
  getAttendanceByClassTerm, getAttendanceByClassBaseTerm,
  getAllAttendanceByTerm, getAttendanceByStudent,
  saveHoliday, deleteHoliday, getHolidays
} from "./firebase.js";

// ══════════════════════════════════════════════════════════════
//  RBAC CONFIGURATION
// ══════════════════════════════════════════════════════════════
const MASTER_ADMINS = [
  "infinitetechnology04@gmail.com".toLowerCase(),
  "macpeppleibim@gmail.com".toLowerCase(),
];

let FORM_TEACHERS    = {};
let SUBJECT_TEACHERS = {};

// ── Constants ─────────────────────────────────────────────────
const SS_ARMS      = ["SS 1A","SS 1B","SS 2A","SS 2B","SS 3A","SS 3B"];
const JS_ARMS_C    = ["JS 1A","JS 1B","JS 2A","JS 2B","JS 3A","JS 3B"];
const BASIC_ARMS   = ["Basic 1A","Basic 1B","Basic 2A","Basic 2B","Basic 3A","Basic 3B","Basic 4A","Basic 4B","Basic 5A","Basic 5B"];
const NURSERY_ARMS = ["Nursery 1A","Nursery 1B","Nursery 2A","Nursery 2B","Nursery 3A","Nursery 3B"];
const CRECHE_ARMS  = ["CrecheA","CrecheB"];

const ALL_ARMS = [
  ...SS_ARMS, ...JS_ARMS_C, ...BASIC_ARMS, ...NURSERY_ARMS, ...CRECHE_ARMS
];

const SS_CLASSES      = ["SS 1","SS 2","SS 3"];
const JS_CLASSES      = ["JS 1","JS 2","JS 3"];
const BASIC_CLASSES   = ["Basic 1","Basic 2","Basic 3","Basic 4","Basic 5"];
const NURSERY_CLASSES = ["Nursery 1","Nursery 2","Nursery 3"];
const CRECHE_CLASSES  = ["Creche"];

const ALL_CLASSES = [
  ...SS_CLASSES, ...JS_CLASSES, ...BASIC_CLASSES, ...NURSERY_CLASSES, ...CRECHE_CLASSES
];

const TERM_LABELS = { "1":"1st Term","2":"2nd Term","3":"3rd Term" };

// armToBase: strips last character (arm letter) + trims
// "JS 1A" → "JS 1", "Basic 1A" → "Basic 1", "CrecheA" → "Creche"
const armToBase = arm => {
  if (!arm) return "";
  const t = arm.trim();
  // Creche special case
  if (t === "CrecheA" || t === "CrecheB") return "Creche";
  return t.slice(0, -1).trim();
};

// ── Role State ────────────────────────────────────────────────
let _user = null, _isMaster = false, _isFT = false, _isST = false;
let _ftClass = null, _stSubjects = [], _stArms = [];

function resolveRole(email) {
  const e = (email || "").toLowerCase().trim();
  _isMaster = _isFT = _isST = false;
  _ftClass = null; _stSubjects = []; _stArms = [];

  const ftKeys = Object.keys(FORM_TEACHERS);
  const stKeys = Object.keys(SUBJECT_TEACHERS);
  console.log("resolveRole — login email:", JSON.stringify(e));
  console.log("FT keys:", JSON.stringify(ftKeys));
  console.log("ST keys:", JSON.stringify(stKeys));

  if (MASTER_ADMINS.includes(e)) { _isMaster = true; console.log("Role: MASTER"); return; }
  if (FORM_TEACHERS[e])   { _isFT = true; _ftClass = FORM_TEACHERS[e]; console.log("Role: FT →", _ftClass); }
  if (SUBJECT_TEACHERS[e]) {
    _isST       = true;
    const cfg   = SUBJECT_TEACHERS[e];
    _stSubjects = cfg.subjects  || [];
    _stArms     = cfg.classArms || [];
    console.log("Role: ST — subjects:", _stSubjects, "arms:", _stArms);
  }
  // Note: unauthorized handling moved to auth flow
  // to avoid false logouts when teachers failed to load due to poor network
}

// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════
const $   = id => document.getElementById(id);
const $q  = sel => document.querySelector(sel);
const $qa = sel => document.querySelectorAll(sel);

const openModal  = id => $(id).classList.add("show");
const closeModal = id => $(id).classList.remove("show");

function toast(msg, type = "info") {
  const icons = {success:"check-circle",error:"x-circle",warning:"exclamation-triangle",info:"info-circle"};
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<i class="bi bi-${icons[type]||"info-circle"}-fill"></i> ${msg}`;
  $("toastContainer").appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

// Dynamic grading — reads from _grading which is loaded from Firebase settings
// Grades: A (dark green), B1/B2 (light green), C (blue), D (yellow), F (red)
function parseGradeRange(range) {
  var parts = (range || "").split("-").map(function(p){ return parseInt(p.trim(), 10); });
  return { min: isNaN(parts[0]) ? 0 : parts[0], max: isNaN(parts[1]) ? 100 : parts[1] };
}
function grade(n) {
  if (n >= parseGradeRange(_grading.A).min)  return "A";
  if (n >= parseGradeRange(_grading.B1).min) return "B1";
  if (n >= parseGradeRange(_grading.B2).min) return "B2";
  if (n >= parseGradeRange(_grading.C).min)  return "C";
  if (n >= parseGradeRange(_grading.D).min)  return "D";
  return "F";
}
function gradeClass(g) {
  return { A:"grade-A", B1:"grade-B1", B2:"grade-B2", C:"grade-C", D:"grade-D", F:"grade-F" }[g] || "";
}
function ordinal(n)    { const s=["th","st","nd","rd"],v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); }

function setDisplay(id, show) {
  const el = $(id);
  if (el) el.style.display = show ? (el.tagName==="DIV"||el.tagName==="ASIDE"?"":"flex") : "none";
}
function setDisplayFlex(id, show) {
  const el = $(id); if (el) el.style.display = show ? "flex" : "none";
}

document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => closeModal(b.dataset.close)));
document.querySelectorAll(".modal-backdrop").forEach(bd => bd.addEventListener("click", e => { if(e.target===bd) closeModal(bd.id); }));

// ── Sidebar ───────────────────────────────────────────────────
let sidebarOpen = window.innerWidth >= 992;
function applyLayout() {
  const sidebar = $("sidebar"), mw = $("mainWrapper");
  if (window.innerWidth >= 992) {
    sidebar.classList.remove("mobile-open");
    sidebarOpen ? sidebar.classList.remove("collapsed") : sidebar.classList.add("collapsed");
    mw.classList.toggle("expanded", !sidebarOpen);
    $("sidebarOverlay").classList.remove("show");
  } else {
    sidebar.classList.remove("collapsed"); mw.classList.remove("expanded");
    sidebar.classList.toggle("mobile-open", sidebarOpen);
    $("sidebarOverlay").classList.toggle("show", sidebarOpen);
  }
}
$("toggleBtn").addEventListener("click", () => { sidebarOpen = !sidebarOpen; applyLayout(); });
$("sidebarOverlay").addEventListener("click", () => { sidebarOpen = false; applyLayout(); });
window.addEventListener("resize", applyLayout);
applyLayout();

// ── Section nav ───────────────────────────────────────────────
window.showSection = id => {
  // Role guard — Admin-only sections
  const adminOnly = ["section-settings","section-recordbank","section-approval",
                     "section-promotion","section-alumni","section-teachers-role",
                     "section-school-config"];
  if (!_isMaster && adminOnly.includes(id)) return;

  // Print Results guard — not visible to Subject Teachers
  if (_isST && !_isFT && !_isMaster && id === "section-print-results") return;

  // Hide all sections
  document.querySelectorAll(".section").forEach(s => {
    s.classList.remove("active");
    s.style.display = "none";
  });
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));

  const target = $(id);
  if (target) {
    target.classList.add("active");
    target.style.display = "block";
  }
  document.querySelector(`[data-section="${id}"]`)?.classList.add("active");

  // Init print results session display when opening that section
  if (id === "section-print-results") initPrintResultsSection();

  if (window.innerWidth < 992) { sidebarOpen = false; applyLayout(); }
};
document.querySelectorAll(".nav-item").forEach(item => item.addEventListener("click", () => showSection(item.dataset.section)));
["scores","broadsheet","attendance"].forEach(k => {
  $(`qa-${k}`)?.addEventListener("click", () => showSection(`section-${k}`));
});
$("qa-recordbank")?.addEventListener("click", () => showSection("section-recordbank"));
$("qa-approval")?.addEventListener("click",   () => showSection("section-approval"));

// ── Auth ──────────────────────────────────────────────────────
let _students = [];
let _bsCache  = null; // Broadsheet cache — Excel reuses this, zero extra reads
let _sessionCache = null; // Session cache — reduces repeated getSession() reads
let _authResolved = false;
let _teachersLoaded = false;

onAuthChange(async user => {
  _authResolved = true;
  const overlay = $("authLoadingOverlay");

  if (!user) {
    // Only redirect if we were previously logged in
    // Prevents redirect on first page load before Firebase resolves
    if (overlay) overlay.style.display = "none";
    window.location.href = "admin-login.html";
    return;
  }

  // Load teachers with multiple retries — handles slow Nigerian networks
  var maxRetries = 3;
  for (var attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await loadTeachers();
      _teachersLoaded = true;
      break; // success
    } catch(e) {
      console.warn("loadTeachers attempt " + attempt + " failed:", e);
      if (attempt < maxRetries) {
        // Wait longer each retry — 1.5s, 3s, 5s
        await new Promise(r => setTimeout(r, attempt * 1500));
      }
    }
  }

  // If teachers still not loaded after 3 retries
  // Use cached data from offline persistence rather than logging out
  if (!_teachersLoaded) {
    console.warn("Teachers failed to load after retries — using cached data");
  }

  _user = user;
  resolveRole(user.email);

  // Only logout if truly no role AND teachers loaded successfully
  // If teachers failed to load, give benefit of doubt — don't logout
  if (!_isMaster && !_isFT && !_isST && _teachersLoaded) {
    console.error("NOT AUTHORIZED — no role found for:", user.email);
    toast("Your account is not authorized. Contact your Admin.", "error");
    setTimeout(() => authLogout(), 3500);
    return;
  }

  applyRoleUI();
  restoreSidebarTheme();
  if (overlay) overlay.style.display = "none";
  await Promise.allSettled([loadSession(), loadStudents()]);
});

// Safety timeout — increased to 30 seconds for slow Nigerian networks
// Only redirects if auth has NOT resolved at all (not just slow Firestore)
setTimeout(function() {
  if (!_authResolved) {
    console.warn("Auth timeout — redirecting to login");
    window.location.href = "admin-login.html";
  }
}, 30000); // 30 seconds instead of 15

$("logoutBtn").addEventListener("click", async () => { await authLogout(); window.location.href = "admin-login.html"; });

// ══════════════════════════════════════════════════════════════
//  APPLY ROLE UI
// ══════════════════════════════════════════════════════════════
function applyRoleUI() {
  // Badge
  let badge = "";
  if (_isMaster) badge = `<span class="badge badge-danger" style="font-size:.6rem;margin-left:6px">Master Admin</span>`;
  else if (_isFT && _isST) badge = `<span class="badge badge-primary" style="font-size:.6rem;margin-left:6px">Form+Subject · ${_ftClass}</span>`;
  else if (_isFT)           badge = `<span class="badge badge-info" style="font-size:.6rem;margin-left:6px">Form Teacher · ${_ftClass}</span>`;
  else if (_isST)           badge = `<span class="badge badge-success" style="font-size:.6rem;margin-left:6px">Subject Teacher</span>`;

  // Show email first, then replace with name if found in pendingUsers
  const el = $("adminEmailDisplay");
  if (el) el.innerHTML = (_user?.email||"") + badge;

  // Try to fetch display name — check teacherNames first, then pendingUsers
  if (_user && !_isMaster) {
    getTeacherNames().then(namesMap => {
      const email = (_user.email||"").toLowerCase().trim();
      if (namesMap[email]) {
        if (el) el.innerHTML = namesMap[email] + badge;
      } else {
        // Fallback: check pendingUsers collection
        firestoreGetDoc(firestoreDoc(db, "pendingUsers", _user.uid)).then(snap => {
          if (snap.exists() && snap.data().name) {
            if (el) el.innerHTML = snap.data().name + badge;
          }
        }).catch(() => {});
      }
    }).catch(() => {});
  }

  // Hide pending users and teacher names cards for non-admins
  const puCard = $("pendingUsersCard");
  if (puCard) puCard.style.display = _isMaster ? "block" : "none";
  const tnCard = $("teacherNamesCard");
  if (tnCard) tnCard.style.display = _isMaster ? "block" : "none";

  // Sidebar nav visibility — 16 items per spec
  setDisplayFlex("nav-menu",           true);                        // 1. All roles
  setDisplayFlex("nav-dashboard",      true);                        // 2. All roles
  setDisplayFlex("nav-students",       _isMaster || _isFT);          // 3. Admin + FT
  setDisplayFlex("nav-subjects",       _isMaster || _isFT);          // 4. Admin + FT
  setDisplayFlex("nav-scores",         true);                        // 5. All roles
  setDisplayFlex("nav-broadsheet",     true);                        // 6. All roles
  setDisplayFlex("nav-attendance",     _isMaster || _isFT);          // 7. Admin + FT
  setDisplayFlex("nav-exam",           true);                        // 8. All roles
  setDisplayFlex("nav-approval",       _isMaster);                   // 9. Admin only
  setDisplayFlex("nav-recordbank",     _isMaster);                   // 10. Admin only
  setDisplayFlex("nav-promotion",      _isMaster);                   // 11. Admin only
  setDisplayFlex("nav-alumni",         _isMaster);                   // 12. Admin only
  setDisplayFlex("nav-print-results",  _isMaster || _isFT);          // 13. Admin + FT
  setDisplayFlex("nav-teachers-role",  _isMaster);                   // 14. Admin only
  setDisplayFlex("nav-school-config",  _isMaster);                   // 15. Admin only
  setDisplayFlex("nav-settings",       true);                        // 16. All roles

  // Menu tiles — match sidebar visibility
  setDisplay("menu-students",      _isMaster || _isFT);
  setDisplay("menu-add-student",   _isMaster || _isFT);
  setDisplay("menu-subjects",      _isMaster || _isFT);
  setDisplay("menu-attendance",    _isMaster || _isFT);
  setDisplay("menu-approval",      _isMaster);
  setDisplay("menu-recordbank",    _isMaster);
  setDisplay("menu-promotion",     _isMaster);
  setDisplay("menu-alumni",        _isMaster);
  setDisplay("menu-print-results", _isMaster || _isFT);
  setDisplay("menu-teachers-role", _isMaster);
  setDisplay("menu-school-config", _isMaster);

  // Print Results role note
  const prNote = $("printResultsRoleNote");
  if (prNote) {
    if (_isMaster) prNote.textContent = " — Admin: check any student's result.";
    else if (_isFT) prNote.textContent = ` — Form Teacher: results for ${_ftClass} only.`;
  }

  // Print Results class arm selector — FT: only their class, Admin: all
  const prCard = $("prClassPrintCard");
  if (prCard) prCard.style.display = (_isFT || _isMaster) ? "block" : "none";

  // Quick access — keep backward compat
  setDisplay("qa-scores",     _isMaster || _isST || _isFT);
  setDisplay("qa-broadsheet", true);
  setDisplay("qa-attendance", _isMaster || _isFT);
  setDisplay("qa-results",    _isMaster || _isFT);
  setDisplay("qa-recordbank", _isMaster);
  setDisplay("qa-approval",   _isMaster);

  // Role info card
  const ri = $("roleInfoCard");
  if (ri) {
    if (_isMaster) {
      ri.innerHTML = `<strong style="color:var(--primary)">Master Admin</strong><br>
        Full access — all classes, students, subjects, scores, approvals.`;
    } else {
      let t = "";
      if (_isFT) t += `<strong style="color:var(--info)">Form Teacher</strong> — Class ${_ftClass} (Arms A &amp; B)<br>
        Add/edit students, manage subjects, enter scores, enter remarks, view broadsheet.<br><br>`;
      if (_isST) t += `<strong style="color:var(--success)">Subject Teacher</strong><br>
        Subjects: <strong>${_stSubjects.join(", ")}</strong><br>
        Class Arms: ${_stArms.join(", ")}`;
      ri.innerHTML = t || "Unknown role.";
    }
  }

  // FIX #5: Dual-role notice in dashboard
  const dn = $("dualRoleNotice");
  if (dn) dn.style.display = (_isFT && _isST) ? "block" : "none";

  // Role-based dashboard sections
  const adminCards = $("dashAdminCards");
  const ftCards    = $("dashFTCards");
  const stCards    = $("dashSTCards");
  const dualSTCard = $("dashDualSTCard");
  if (adminCards) adminCards.style.display = _isMaster ? "block" : "none";
  if (ftCards)    ftCards.style.display    = (_isFT && !_isMaster) ? "block" : "none";
  if (stCards)    stCards.style.display    = (_isST && !_isFT && !_isMaster) ? "block" : "none";
  // Dual role: show top 6 subject card inside FT section
  if (dualSTCard) dualSTCard.style.display = (_isFT && _isST && !_isMaster) ? "block" : "none";

  buildDropdowns();
  renderTeacherRows();
  applyAttendanceTabs();
  setTimeout(() => loadDashboardAnalytics(), 500);
}

// ══════════════════════════════════════════════════════════════
//  BUILD DROPDOWNS
// ══════════════════════════════════════════════════════════════
function buildDropdowns() {
  function opts(arr) { return arr.map(v => `<option value="${v}">${v}</option>`).join(""); }

  // Arms available to this user — truly role-based
  const ftArms    = _isFT ? ALL_ARMS.filter(a => armToBase(a) === _ftClass) : [];
  const scoreArms = _isMaster ? ALL_ARMS
                  : _isST && _isFT ? [...new Set([...ftArms, ..._stArms])] // dual role
                  : _isST ? _stArms   // ST only sees their assigned arms
                  : ftArms;           // FT only sees their class
  const scoreArmEl = $("scoreClassArm");
  if (scoreArmEl) {
    scoreArmEl.innerHTML = scoreArms.length ? opts(scoreArms) : '<option value="">No classes assigned</option>';
    scoreArmEl.disabled = !_isMaster && scoreArms.length <= 1;
  }

  // Broadsheet arms
  let bsSet = new Set();
  if (_isMaster) { ALL_ARMS.forEach(a => bsSet.add(a)); }
  else {
    if (_isFT) ALL_ARMS.filter(a => armToBase(a) === _ftClass).forEach(a => bsSet.add(a));
    if (_isST) _stArms.forEach(a => bsSet.add(a));
  }
  const bsArms  = ALL_ARMS.filter(a => bsSet.has(a));
  const bsArmEl = $("bsClassArm");
  if (bsArmEl) {
    bsArmEl.innerHTML = bsArms.length ? opts(bsArms) : '<option value="">No classes available</option>';
    bsArmEl.disabled  = !_isMaster && bsArms.length <= 1;
  }

  // Remarks arms
  const remArms  = _isMaster ? ALL_ARMS : _isFT ? ALL_ARMS.filter(a => armToBase(a) === _ftClass) : [];
  const remArmEl = $("remarkClassArm");
  if (remArmEl) {
    remArmEl.innerHTML = remArms.length ? opts(remArms) : '<option value="">Not assigned</option>';
    remArmEl.disabled  = !_isMaster && remArms.length <= 1;
  }

  // Subject management classes
  function groupedClassOpts(classes) {
    const groups = [
      { label:"Senior Secondary", list: SS_CLASSES },
      { label:"Junior Secondary", list: JS_CLASSES },
      { label:"Basic",            list: BASIC_CLASSES },
      { label:"Nursery",          list: NURSERY_CLASSES },
      { label:"Creche",           list: CRECHE_CLASSES }
    ];
    return groups.filter(g => g.list.some(c => classes.includes(c))).map(g =>
      `<optgroup label="${g.label}">${g.list.filter(c => classes.includes(c)).map(c => `<option value="${c}">${c}</option>`).join("")}</optgroup>`
    ).join("");
  }
  const subClasses = _isMaster ? ALL_CLASSES : _isFT ? [_ftClass] : [];
  const subClsEl   = $("subjectClass");
  if (subClsEl) {
    subClsEl.innerHTML = subClasses.length ? groupedClassOpts(subClasses) : '<option value="">Not assigned</option>';
    subClsEl.disabled  = !_isMaster && subClasses.length <= 1;
  }

  // Attendance arms — FT only sees their class, admin sees all
  const attArms  = _isMaster ? ALL_ARMS : _isFT ? ftArms : [];
  const attArmEl = $("attClassArm");
  if (attArmEl) {
    attArmEl.innerHTML = attArms.length ? opts(attArms) : '<option value="">Not assigned</option>';
    attArmEl.disabled  = !_isMaster && attArms.length <= 1;
  }

  // Analytics + per-student: admin sees all classes, FT only sees their own class
  const analyticsClasses = _isMaster ? ALL_CLASSES : _isFT ? [_ftClass] : ALL_CLASSES;
  ["analyticsClass","perStudentClass"].forEach(function(id) {
    const el = $(id);
    if (!el) return;
    if (_isFT && !_isMaster) {
      el.innerHTML = "<option value='" + _ftClass + "'>" + _ftClass + "</option>";
      el.value     = _ftClass;
      el.disabled  = true;
    } else if (id === "analyticsClass") {
      // Admin: populate only the individual class optgroup
      const grp = $("analyticsClassGroup");
      if (grp) grp.innerHTML = analyticsClasses.map(function(c){ return "<option value='" + c + "'>" + c + "</option>"; }).join("");
      el.disabled = false;
    } else {
      el.innerHTML = groupedClassOpts(analyticsClasses);
      el.disabled  = false;
    }
  });

  // Student filter class
  $("stuFilterClass").innerHTML = '<option value="">All Classes</option>' + opts(ALL_CLASSES);

  // Record Bank class — admin only, populate individual class optgroup
  const rbGrp = $("rbClassGroup");
  if (rbGrp) rbGrp.innerHTML = ALL_CLASSES.map(function(c){ return "<option value='" + c + "'>" + c + "</option>"; }).join("");

  // Promotion dropdowns — admin only
  const promFrom = $("promFromClass");
  const promTo   = $("promToClass");
  if (promFrom) promFrom.innerHTML = '<option value="">Select class...</option>' + groupedClassOpts(ALL_CLASSES);
  if (promTo)   promTo.innerHTML   = '<option value="">Select class...</option>' + groupedClassOpts(ALL_CLASSES);

  if (scoreArms.length) setTimeout(() => refreshSubjectDropdown(), 200);
  else {
    const sel = $("scoreSubject");
    if (sel) sel.innerHTML = '<option value="">Select class arm first</option>';
  }
}

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════
async function init() {
  await Promise.allSettled([loadSession(), loadStudents()]);
}

async function loadTeachers() {
  try {
    const data = await getTeachers();
    FORM_TEACHERS    = (data && data.formTeachers)    ? data.formTeachers    : {};
    SUBJECT_TEACHERS = (data && data.subjectTeachers) ? data.subjectTeachers : {};
    console.log("Teachers loaded — FT:", Object.keys(FORM_TEACHERS), "ST:", Object.keys(SUBJECT_TEACHERS));
  } catch(e) {
    console.error("loadTeachers failed:", e);
    // Don't leave as undefined — keep as empty objects
    FORM_TEACHERS    = FORM_TEACHERS    || {};
    SUBJECT_TEACHERS = SUBJECT_TEACHERS || {};
  }
  renderTeacherRows();
}

// School identity state
let _schoolName  = "Recomella Academy";
let _schoolLogo    = "./logo.png";
let _currentSession = "";  // always holds the active session
// Grading system — loaded from Firebase settings, used across broadsheet and score entry
let _grading = { A:"86-100", B1:"71-85", B2:"61-70", C:"50-60", D:"39-49", F:"0-38" };

async function loadSession() {
  try {
    const s = await getSession();
    _sessionCache = s; // Cache session — all other calls use this, zero extra reads
    const t = s.currentTerm || "1";
    _currentSession = s.session || "";  // store globally
    $("statSession").textContent = s.session || "—";
    $("statTerm").textContent    = TERM_LABELS[t] || "—";

    // Sync term dropdowns across all sections
    ["scoreTerm","subjectTerm","bsTerm","remarkTerm","approvalTerm",
     "attTerm","analyticsTerm","perStudentTerm","rbTerm","resTerm"].forEach(id => {
      const el = $(id); if (el) el.value = t;
    });

    // Sync session input in record bank
    // rbSession is now a select dropdown — populated separately

    if (_isMaster) {
      $("sessionInput").value    = s.session || "";
      $("termInput").value       = t;
      $("schoolNameInput").value = s.schoolName || "";
      if (s.termStartDate) { const el = $("termStartDate"); if(el) el.value = s.termStartDate; }
      if (s.termEndDate)   { const el = $("termEndDate");   if(el) el.value = s.termEndDate; }
      updateTermWeeksDisplay(s.termStartDate, s.termEndDate);
      // New school identity fields
      var setVal = function(id, val) { var el = $(id); if(el) el.value = val || ""; };
      setVal("schoolTypeInput",    s.schoolType);
      setVal("schoolAddressInput", s.schoolAddress);
      setVal("schoolPhoneInput",   s.schoolPhone);
      setVal("schoolMottoInput",   s.schoolMotto);
      setVal("nextTermBeginsInput",s.nextTermBegins);
      setVal("feesCrecheInput",    s.feesCreche);
      setVal("feesNurseryInput",   s.feesNursery);
      setVal("feesBasicInput",     s.feesBasic);
      setVal("feesJSSInput",       s.feesJSS);
      setVal("feesSSSInput",       s.feesSSS);
      // Principal remarks
      setVal("principalRemark1", s.principalRemark1);
      setVal("principalRemark2", s.principalRemark2);
      setVal("principalRemark3", s.principalRemark3);
      setVal("principalRemark4", s.principalRemark4);
      // Head Teacher remarks
      setVal("htRemark1", s.htRemark1);
      setVal("htRemark2", s.htRemark2);
      setVal("htRemark3", s.htRemark3);
      setVal("htRemark4", s.htRemark4);
      // Grading system
      setVal("gradeAInput",  s.gradeA  || "86-100");
      setVal("gradeB1Input", s.gradeB1 || "71-85");
      setVal("gradeB2Input", s.gradeB2 || "61-70");
      setVal("gradeCInput",  s.gradeC  || "50-60");
      setVal("gradeDInput",  s.gradeD  || "39-49");
      setVal("gradeFInput",  s.gradeF  || "0-38");
      // Logo preview
      if (s.schoolLogo) {
        var prev = $("schoolLogoPreview");
        if (prev) { prev.src = s.schoolLogo; prev.style.display = "block"; }
      }
    }
    // Always update _grading from Firebase settings (applies to all roles)
    if (s.gradeA)  _grading.A  = s.gradeA;
    if (s.gradeB1) _grading.B1 = s.gradeB1;
    if (s.gradeB2) _grading.B2 = s.gradeB2;
    if (s.gradeC)  _grading.C  = s.gradeC;
    if (s.gradeD)  _grading.D  = s.gradeD;
    if (s.gradeF)  _grading.F  = s.gradeF;
    if (s.schoolName) {
      _schoolName = s.schoolName;
      const bn = $("brandName"); if (bn) bn.textContent = s.schoolName;
    }

    // Current week of term — visible to all roles
    const totalWeeks = countSchoolWeeks(s.termStartDate, s.termEndDate);
    const cwEl = $("statCurrentWeek");
    const twEl = $("statTotalWeeks");
    if (cwEl) {
      if (s.termStartDate) {
        const today     = new Date();
        const start     = new Date(s.termStartDate);
        const diffDays  = Math.floor((today - start) / (1000*60*60*24));
        const currentWk = diffDays >= 0 ? Math.min(Math.ceil((diffDays + 1) / 7), totalWeeks||99) : 0;
        // Break "Week" and number onto separate lines
        cwEl.innerHTML  = currentWk > 0
          ? `<span style="font-size:.65rem;font-weight:700;display:block;color:#16a34a">WEEK</span><span style="font-size:1.6rem;font-weight:900;line-height:1;color:#16a34a">${currentWk}</span>`
          : "—";
        if (twEl) twEl.textContent = totalWeeks > 0 ? totalWeeks + " weeks this term" : "Set term dates in Settings";
      } else {
        cwEl.innerHTML = `<span style="font-size:.75rem;color:var(--text-muted)">Set term<br>dates</span>`;
        if (twEl) twEl.textContent = "Set term dates in Settings";
      }
    }
  } catch(e) { console.error(e); }
}

// ── Calculate and display term weeks ────────────────────────────
function countSchoolWeeks(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const s = new Date(startDate), e = new Date(endDate);
  if (isNaN(s) || isNaN(e) || e <= s) return 0;
  const days = Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1;
  return Math.ceil(days / 7);
}

function updateTermWeeksDisplay(startDate, endDate) {
  const weeks = countSchoolWeeks(startDate, endDate);
  const info  = $("termWeeksInfo");
  const text  = $("termWeeksText");
  if (!info || !text) return;
  if (weeks > 0) {
    text.textContent = weeks + " weeks in this term (" + startDate + " to " + endDate + ")";
    info.style.display = "block";
  } else {
    info.style.display = "none";
  }
}

// Live update weeks display when dates change
["termStartDate","termEndDate"].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener("change", () => {
    const s = $("termStartDate")?.value;
    const e = $("termEndDate")?.value;
    updateTermWeeksDisplay(s, e);
  });
});

async function loadStudents() {
  try {
    // Smart loading — only load what each role needs
    // Admin needs all students (full management view)
    // Form Teacher only needs their own class arm (saves ~475 reads per login)
    // Subject Teacher only needs their assigned arms
    if (_isMaster) {
      _students = await getActiveStudents();
    } else if (_isFT && !_isST) {
      // Form Teacher — load only their class (both arms for population count)
      var armA = _ftClass + "A";
      var armB = _ftClass + "B";
      var results = await Promise.all([
        getStudentsByClassArm(armA),
        getStudentsByClassArm(armB)
      ]);
      _students = results[0].concat(results[1]);
    } else if (_isST && !_isFT) {
      // Subject Teacher — load only their assigned arms
      var stResults = await Promise.all(_stArms.map(function(arm){ return getStudentsByClassArm(arm); }));
      _students = stResults.reduce(function(acc, arr){ return acc.concat(arr); }, []);
    } else if (_isFT && _isST) {
      // Dual role — load FT class + ST arms
      var ftArmA = _ftClass + "A";
      var ftArmB = _ftClass + "B";
      var allArms = [ftArmA, ftArmB].concat(_stArms.filter(function(a){ return a !== ftArmA && a !== ftArmB; }));
      var dualResults = await Promise.all(allArms.map(function(arm){ return getStudentsByClassArm(arm); }));
      _students = dualResults.reduce(function(acc, arr){ return acc.concat(arr); }, []);
    } else {
      _students = await getActiveStudents();
    }

    // Remove duplicates (in case arms overlap)
    var seen = {};
    _students = _students.filter(function(s){
      if (seen[s.regNumber]) return false;
      seen[s.regNumber] = true;
      return true;
    });

    const male    = _students.filter(s => s.gender === "Male").length;
    const female  = _students.filter(s => s.gender === "Female").length;
    const classes = new Set(_students.map(s => s.classBase)).size;
    $("statStudents").textContent = _students.length;
    const sm = $("statMale");   if (sm) sm.textContent = male;
    const sf = $("statFemale"); if (sf) sf.textContent = female;
    const sc = $("statClasses"); if (sc) sc.textContent = classes;
    renderStudentTable(_students);
    if (_isMaster) loadDashboardAnalytics();
  } catch(e) { console.error("loadStudents:", e); }
}

// ══════════════════════════════════════════════════════════════
//  STUDENTS
// ══════════════════════════════════════════════════════════════
function renderStudentTable(list) {
  const tbody = $("studentsTable");
  const pool  = _isMaster ? list
    : _isFT && _isST ? list.filter(s => s.classBase === _ftClass || _stArms.includes(s.classArm))
    : _isFT  ? list.filter(s => s.classBase === _ftClass)
    : _isST  ? list.filter(s => _stArms.includes(s.classArm))
    : [];
  if (!pool.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding:30px;color:var(--text-muted)">No students found.</td></tr>`;
    return;
  }
  tbody.innerHTML = pool.map(s => {
    const soArr  = Array.isArray(s.subjectsOffered) ? s.subjectsOffered : [];
    const soTag  = (!s.subjectsOffered || s.subjectsOffered === "all")
      ? `<span class="badge badge-success">All Subjects</span>`
      : `<span class="badge badge-info" title="${soArr.join(", ")}">${soArr.length} subject${soArr.length!==1?"s":""}</span>`;
    const status  = s.status || "active";
    const statusTag = status === "active"     ? `<span class="badge badge-success">Active</span>` :
                      status === "graduated"   ? `<span class="badge" style="background:#7c3aed;color:#fff">Graduated</span>` :
                      status === "transferred" ? `<span class="badge badge-warning">Transferred</span>` :
                      status === "inactive"    ? `<span class="badge badge-muted">Inactive</span>` :
                      `<span class="badge badge-success">Active</span>`;
    return `<tr>
      <td><strong>${s.regNumber}</strong></td>
      <td>${s.fullName||"—"}</td>
      <td>${s.classBase||"—"}</td>
      <td><span class="badge badge-primary">Arm ${s.arm||"—"}</span></td>
      <td>${s.gender||"—"}</td>
      <td>${soTag}</td>
      <td>${statusTag}</td>
      <td><div class="action-btns">
        <button class="btn-icon btn-edit" onclick="editStudent('${s.regNumber}')"><i class="bi bi-pencil-fill"></i></button>
        ${_isMaster?`<button class="btn-icon btn-delete" onclick="confirmDeleteStudent('${s.regNumber}','${(s.fullName||s.regNumber).replace(/'/g,"\\'")}')"><i class="bi bi-trash-fill"></i></button>`:""}
      </div></td>
    </tr>`;
  }).join("");
}

function filterStudents() {
  const q   = $("stuSearch").value.toLowerCase();
  const cls = $("stuFilterClass").value;
  const arm = $("stuFilterArm").value;
  let pool  = _students;
  if (!_isMaster && _isFT) pool = pool.filter(s => s.classBase === _ftClass);
  if (cls) pool = pool.filter(s => s.classBase === cls);
  if (arm) pool = pool.filter(s => s.arm === arm);
  if (q)   pool = pool.filter(s => s.fullName?.toLowerCase().includes(q) || s.regNumber?.toLowerCase().includes(q));
  renderStudentTable(pool);
}
$("stuSearch").addEventListener("input",  filterStudents);
$("stuFilterClass").addEventListener("change", filterStudents);
$("stuFilterArm").addEventListener("change",   filterStudents);

// FIX #2: Load class subjects into checkboxes — search all 3 terms
async function loadSubjectCheckboxes(classBase, selected) {
  const wrap = $("subjectCheckboxes");
  wrap.innerHTML = `<p style="color:var(--text-muted);font-size:.8rem">Loading subjects…</p>`;
  let subjects = [];
  for (const t of ["1","2","3"]) {
    subjects = await getClassSubjects(classBase, t, _currentSession);
    if (subjects.length) break;
  }
  if (!subjects.length) {
    wrap.innerHTML = `<p style="color:var(--warning);font-size:.82rem">
      ⚠ No subjects found for ${classBase}. Go to Subjects section and add subjects first.</p>`;
    return;
  }
  wrap.innerHTML = subjects.map(s => {
    const chk = Array.isArray(selected) && selected.includes(s) ? "checked" : "";
    return `<label class="subj-label" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;
      font-size:.85rem;font-weight:600;background:#f8fafc;padding:7px 13px;border-radius:8px;
      border:1.5px solid var(--border);margin:2px;transition:all .15s">
      <input type="checkbox" class="subj-check" value="${s}" ${chk}
        style="accent-color:var(--primary);width:15px;height:15px"/> ${s}
    </label>`;
  }).join("");
}

$("sAllSubjects").addEventListener("change", async e => {
  const wrap = $("specificSubjectsWrap");
  if (e.target.checked) {
    // Offering all — hide specific subject selector
    wrap.style.display = "none";
  } else {
    // Specific subjects — show selector and load subjects for selected class
    wrap.style.display = "block";
    const cls = $("sClass").value;
    if (cls) {
      await loadSubjectCheckboxes(cls, []);
    } else {
      $("subjectCheckboxes").innerHTML = `<p style="font-size:.82rem;color:var(--text-muted)">
        Please select a <strong>Class</strong> above first to see available subjects.</p>`;
    }
  }
});

// FIX #2: When class changes, reload subject checkboxes
$("sClass").addEventListener("change", async () => {
  const cls = $("sClass").value;
  if (cls && !$("sAllSubjects").checked) {
    await loadSubjectCheckboxes(cls, []);
  }
});

// Add Student button
$("addStudentBtn").addEventListener("click", () => {
  $("studentModalTitle").textContent = "Add Student";
  $("studentEditId").value = "";
  $("sRegNumber").value = ""; $("sFullName").value = ""; $("sGender").value = "";
  const ppEl = $("sParentPhone"); if (ppEl) ppEl.value = "";
  const peEl = $("sParentEmail"); if (peEl) peEl.value = "";
  const paEl = $("sParentAddr");  if (paEl) paEl.value = "";
  $("sAllSubjects").checked = true;
  $("specificSubjectsWrap").style.display = "none";
  $("subjectCheckboxes").innerHTML = "";
  $("sRegNumber").disabled = false;
  $("sArm").disabled = false;
  // Hide Transfer button for new students
  const tBtn = $("transferStudentBtn"); if (tBtn) tBtn.style.display = "none";
  // FIX #6: Admin has full access; form teacher locked to their class
  if (_isMaster) {
    $("sClass").value = ""; $("sClass").disabled = false;
  } else if (_isFT) {
    $("sClass").value = _ftClass; $("sClass").disabled = true;
  }
  openModal("studentModal");
});

$("saveStudentBtn").addEventListener("click", async () => {
  const editId = $("studentEditId").value;
  const reg    = $("sRegNumber").value.trim().toUpperCase();
  const name   = $("sFullName").value.trim();
  const cls    = $("sClass").value;
  const arm    = $("sArm").value;
  const gender = $("sGender").value;
  if (!reg || !name || !cls || !arm) { toast("Fill all required fields.", "error"); return; }

  let subjectsOffered = "all";
  if (!$("sAllSubjects").checked) {
    const checked = [...document.querySelectorAll(".subj-check:checked")].map(c => c.value);
    subjectsOffered = checked.length ? checked : "all";
  }

  // Normalize classArm: always "JS 1A" format (no extra space before arm letter)
  const classArm     = `${cls}${arm}`;
  const parentPhone  = $("sParentPhone")?.value.trim() || "";
  const parentEmail  = $("sParentEmail")?.value.trim() || "";
  const parentAddr   = $("sParentAddr")?.value.trim()  || "";
  const data = { regNumber: reg, fullName: name, classBase: cls, arm, classArm, gender, subjectsOffered, parentPhone, parentEmail, parentAddr };
  const btn = $("saveStudentBtn"); btn.disabled = true; btn.textContent = "Saving…";
  try {
    if (editId) {
      if (_isMaster && reg !== editId) {
        // RegNumber changed — migrate all related data to new reg number
        const btn2 = $("saveStudentBtn"); btn2.textContent = "Migrating data…";
        const result = await changeStudentReg(editId, reg, data);
        toast(
          "Reg number updated. Migrated: " +
          result.scores + " score(s), " +
          result.remarks + " remark(s), " +
          result.attendance + " attendance record(s).",
          "success"
        );
      } else {
        await updateStudent(editId, data);
        toast("Student updated.", "success");
      }
    } else {
      // ── Duplicate reg number check ─────────────────────────
      // addStudent uses setDoc without merge — it would silently overwrite
      // an existing student's data. Block this completely.
      const existing = await getStudentByReg(reg);
      if (existing) {
        const nameEl = $("sRegNumber");
        if (nameEl) {
          nameEl.style.borderColor = "var(--danger)";
          nameEl.style.boxShadow   = "0 0 0 3px rgba(220,38,38,.15)";
          setTimeout(function(){ nameEl.style.borderColor = ""; nameEl.style.boxShadow = ""; }, 4000);
        }
        toast(
          "Reg No. " + reg + " is already in use by " +
          (existing.fullName || "another student") +
          " in " + (existing.classArm || "—") +
          ". Please use a different Reg No.",
          "error"
        );
        return;
      }
      await addStudent(data);
      toast("Student added.", "success");
    }
    closeModal("studentModal");
    await loadStudents();
  } catch(e) { toast(e.message, "error"); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save"></i> Save Student'; }
});

// Admin can edit regNumber and class/arm; form teacher cannot
window.editStudent = async function(reg) {
  const s = _students.find(x => x.regNumber === reg); if (!s) return;
  $("studentModalTitle").textContent = "Edit Student";
  $("studentEditId").value = reg;
  $("sRegNumber").value    = s.regNumber;
  $("sFullName").value     = s.fullName  || "";
  $("sClass").value        = s.classBase || "";
  $("sArm").value          = s.arm       || "A";
  $("sGender").value       = s.gender    || "";
  const ppEl = $("sParentPhone"); if (ppEl) ppEl.value = s.parentPhone || "";
  const peEl = $("sParentEmail"); if (peEl) peEl.value = s.parentEmail || "";
  const paEl = $("sParentAddr");  if (paEl) paEl.value = s.parentAddr  || "";
  $("sRegNumber").disabled = !_isMaster;
  $("sClass").disabled     = !_isMaster;
  $("sArm").disabled       = !_isMaster;
  // Show Transfer button for Admin only when editing existing student
  const tBtn = $("transferStudentBtn");
  if (tBtn) tBtn.style.display = _isMaster ? "inline-flex" : "none";

  const isAll = !s.subjectsOffered || s.subjectsOffered === "all";
  $("sAllSubjects").checked = isAll;
  $("specificSubjectsWrap").style.display = isAll ? "none" : "block";
  if (!isAll && s.classBase) {
    await loadSubjectCheckboxes(s.classBase, Array.isArray(s.subjectsOffered) ? s.subjectsOffered : []);
  }
  openModal("studentModal");
};

let _delReg = null;
window.confirmDeleteStudent = function(reg, name) {
  $("confirmMsg").textContent = `Remove "${name}" from active students? Their records (scores, attendance, remarks) are preserved and can be restored anytime.`;
  _delReg = reg;
  openModal("confirmModal");
};

// Transfer Out handler
$("transferStudentBtn")?.addEventListener("click", async () => {
  const reg = $("studentEditId").value;
  if (!reg) return;
  const s = _students.find(x => x.regNumber === reg);
  const name = s ? s.fullName : reg;
  if (!confirm(`Mark "${name}" as Transferred Out?\n\nThey will leave the active student list.\nAll their records (scores, attendance, results) are permanently preserved.\n\nContinue?`)) return;
  try {
    await transferStudent(reg, _currentSession);
    toast(name + " marked as transferred. All records preserved.", "info");
    closeModal("studentModal");
    await loadStudents();
  } catch(e) { toast(e.message, "error"); }
});
$("confirmDeleteBtn").addEventListener("click", async () => {
  if (!_delReg) return;
  const btn = $("confirmDeleteBtn"); btn.disabled = true; btn.textContent = "Removing…";
  try {
    await deleteStudent(_delReg);
    toast("Student removed. All records preserved and can be restored.", "info");
    closeModal("confirmModal");
    await loadStudents();
  } catch(e) { toast(e.message, "error"); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-trash"></i> Delete'; _delReg = null; }
});


// ══════════════════════════════════════════════════════════════
//  SUBJECTS
// ══════════════════════════════════════════════════════════════
let _classSubjects    = [];
let _copySubjectsSrc  = null; // { term, session, subjects } — source for copy

// Search previous terms/sessions for subjects to copy from
async function findPreviousSubjects(cls, currentTerm, currentSession) {
  // Search order: previous terms in current session, then previous session all terms
  var termOrder = ["3","2","1"];
  var prevTerms = termOrder.filter(function(t){ return t !== currentTerm; });

  // 1. Try previous terms in current session
  for (var i = 0; i < prevTerms.length; i++) {
    var subs = await getClassSubjects(cls, prevTerms[i], currentSession);
    if (subs.length) return { term: prevTerms[i], session: currentSession, subjects: subs };
  }

  // 2. Try all terms in previous session (guess previous session year)
  if (currentSession) {
    var parts = currentSession.split("/");
    if (parts.length === 2) {
      var y1 = parseInt(parts[0]) - 1;
      var y2 = parseInt(parts[1]) - 1;
      var prevSession = y1 + "/" + y2;
      for (var j = 0; j < termOrder.length; j++) {
        var prevSubs = await getClassSubjects(cls, termOrder[j], prevSession);
        if (prevSubs.length) return { term: termOrder[j], session: prevSession, subjects: prevSubs };
      }
    }
  }

  // 3. Try old untagged docs (no session)
  for (var k = 0; k < termOrder.length; k++) {
    var oldSubs = await getClassSubjects(cls, termOrder[k], "");
    if (oldSubs.length) return { term: termOrder[k], session: "previous session", subjects: oldSubs };
  }

  return null;
}

$("loadSubjectsBtn").addEventListener("click", async () => {
  const cls  = $("subjectClass").value;
  const term = $("subjectTerm").value;
  if (!cls) { toast("Select a class.", "error"); return; }
  const notice = $("copySubjectsNotice");
  notice.style.display = "none";
  _copySubjectsSrc = null;
  try {
    _classSubjects = await getClassSubjects(cls, term, _currentSession);
    if (_classSubjects.length) {
      renderChips();
      toast(`${_classSubjects.length} subject(s) loaded for ${cls} — ${TERM_LABELS[term]}.`, "success");
    } else {
      // Subjects empty — search for previous subjects to copy
      renderChips();
      const src = await findPreviousSubjects(cls, term, _currentSession);
      if (src) {
        _copySubjectsSrc = src;
        $("copySubjectsFrom").textContent =
          "Found " + src.subjects.length + " subject(s) from " +
          TERM_LABELS[src.term] + " — " + src.session + ". Copy them as a starting point?";
        notice.style.display = "block";
        toast("No subjects yet for this term. You can copy from a previous term.", "info");
      } else {
        toast("No subjects found. Add subjects below.", "info");
      }
    }
  } catch(e) { toast(e.message, "error"); }
});

$("copySubjectsBtn")?.addEventListener("click", () => {
  if (!_copySubjectsSrc) return;
  _classSubjects = _copySubjectsSrc.subjects.slice(); // copy array
  renderChips();
  $("copySubjectsNotice").style.display = "none";
  toast(_classSubjects.length + " subject(s) copied. Edit if needed then save.", "success");
});

function renderChips() {
  $("subjectsList").innerHTML = _classSubjects.length
    ? _classSubjects.map((s, i) =>
        `<div style="display:inline-flex;align-items:center;gap:6px;background:var(--primary-light);
          color:var(--primary);padding:6px 14px;border-radius:99px;font-weight:700;font-size:.83rem">
          ${s}
          <button onclick="removeChip(${i})" style="background:none;border:none;cursor:pointer;
            color:var(--primary);font-size:1.1rem;line-height:1;padding:0">&times;</button>
        </div>`).join("")
    : `<p style="color:var(--text-muted);font-size:.82rem">No subjects yet. Add subjects below and save.</p>`;
}

window.removeChip = i => { _classSubjects.splice(i, 1); renderChips(); };

$("addSubjectChipBtn").addEventListener("click", () => {
  const val = $("newSubjectInput").value.trim();
  if (!val) return;
  if (_classSubjects.map(s => s.toLowerCase()).includes(val.toLowerCase())) { toast("Already added.", "warning"); return; }
  _classSubjects.push(val);
  renderChips();
  $("newSubjectInput").value = "";
});
$("newSubjectInput").addEventListener("keydown", e => { if (e.key === "Enter") $("addSubjectChipBtn").click(); });

$("saveSubjectsBtn").addEventListener("click", async () => {
  const cls  = $("subjectClass").value;
  const term = $("subjectTerm").value;
  if (!cls) { toast("Select a class.", "error"); return; }
  if (!_classSubjects.length) { toast("Add at least one subject.", "error"); return; }
  const btn = $("saveSubjectsBtn"); btn.disabled = true; btn.textContent = "Saving…";
  try {
    await saveClassSubjects(cls, term, _classSubjects, _currentSession);
    toast(`Subjects saved for ${cls} — ${TERM_LABELS[term]}.`, "success");
  } catch(e) { toast(e.message, "error"); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save"></i> Save Subjects'; }
});

// ══════════════════════════════════════════════════════════════
//  SCORES  — FIX #1 #3 #7 #8
// ══════════════════════════════════════════════════════════════
let _scoreStudents = [], _scoreData = {}, _scoreMap = {};

// FIX #1: Load subjects dynamically from Firestore when class/term changes
async function refreshSubjectDropdown() {
  const classArm  = $("scoreClassArm").value;
  const term      = $("scoreTerm").value;
  if (!classArm || !term) return;
  const classBase = armToBase(classArm);
  const sel = $("scoreSubject");
  sel.innerHTML = '<option value="">Loading…</option>';
  try {
    let subs = await getClassSubjects(classBase, term, _currentSession);
    // Only pure subject teachers (not form teachers) get subject filtering
    if (_isST && !_isMaster && !_isFT) subs = subs.filter(s => _stSubjects.includes(s));
    sel.innerHTML = subs.length
      ? '<option value="">Select Subject</option>' + subs.map(s => `<option value="${s}">${s}</option>`).join("")
      : '<option value="">No subjects found for this class/term</option>';
  } catch(e) {
    sel.innerHTML = '<option value="">Error loading subjects</option>';
  }
}

$("scoreClassArm").addEventListener("change", refreshSubjectDropdown);
$("scoreTerm").addEventListener("change",     refreshSubjectDropdown);

$("loadScoresBtn").addEventListener("click", async () => {
  const classArm  = $("scoreClassArm").value;
  const term      = $("scoreTerm").value;
  const subject   = $("scoreSubject").value;
  const classBase = classArm ? armToBase(classArm) : "";

  if (!classArm) { toast("Select a class arm.", "error"); return; }
  if (!term)     { toast("Select a term.", "error"); return; }
  if (!subject)  { toast("Select a subject.", "error"); return; }

  // Authorization check
  if (!_isMaster) {
    if (_isFT && !_isST) {
      // Form teacher — any subject, but only their own class
      if (armToBase(classArm) !== _ftClass) {
        toast(`You can only enter scores for your class (${_ftClass}).`, "error"); return;
      }
    } else if (_isST && !_isFT) {
      // Subject teacher — any class/arm is fine, but only their assigned subjects
      if (!_stSubjects.includes(subject)) {
        toast(`You are not assigned to teach "${subject}".`, "error"); return;
      }
    } else if (_isFT && _isST) {
      // Dual role — any subject in FT class, OR assigned subjects in any arm
      const inFTClass = armToBase(classArm) === _ftClass;
      const inSTSub   = _stSubjects.includes(subject);
      if (!inFTClass && !inSTSub) {
        toast(`Not authorized for this class/subject combination.`, "error"); return;
      }
    }
  }

  const btn = $("loadScoresBtn"); btn.disabled = true; btn.textContent = "Loading…";
  try {
    // FIX #8: Always fresh fetch — this gives us fullName + all fields
    const all = await getStudentsByClassArm(classArm);

    // Filter to only students offering this subject
    _scoreStudents = all.filter(function(s) {
      var offAll = !s.subjectsOffered || s.subjectsOffered === "all";
      return offAll || (Array.isArray(s.subjectsOffered) && s.subjectsOffered.includes(subject));
    }).sort((a, b) => (a.regNumber||"").localeCompare(b.regNumber||"", undefined, {numeric:true}));

    // Load existing saved scores — no session filter so old scores still appear
    const saved = await getScoresByClassArmSubjectTerm(classArm, subject, term);
    _scoreData = {};

    // Silently tag old scores (no session field) with current session
    // Creates new doc with session in ID, then deletes the old untagged doc
    // This ensures old scores belong to current session and won't bleed into future sessions
    const untagged = saved.filter(sc => !sc.session && _currentSession);
    if (untagged.length && _currentSession) {
      Promise.all(untagged.map(async function(sc) {
        // 1. Save new doc with session tagged
        await saveScore(Object.assign({}, sc, { session: _currentSession }));
        // 2. Delete old doc (no session in ID) so it never bleeds into future sessions
        if (sc.id) await deleteScoreById(sc.id);
      })).catch(function(e) { console.warn("Session tagging failed:", e); });
    }

    // Include scores: matching current session OR still-untagged old ones
    saved.forEach(sc => {
      if (!sc.session || sc.session === _currentSession) {
        _scoreData[sc.regNumber] = sc;
      }
    });

    // Cache score map for skip-unchanged optimization in save handler
    _scoreMap = Object.assign({}, _scoreData);

    renderScoreTable(classArm, subject, term);
    $("scoresCardTitle").innerHTML =
      `<i class="bi bi-list-check"></i> ${classArm} — ${subject} — ${TERM_LABELS[term]}
       <span class="badge badge-muted" style="margin-left:8px">${_scoreStudents.length} student(s)</span>`;
    $("scoresCard").style.display = "block";

    toast(
      _scoreStudents.length
        ? `${_scoreStudents.length} student(s) loaded for ${classArm}.`
        : `No students found in ${classArm}. Add students first.`,
      _scoreStudents.length ? "success" : "warning"
    );
  } catch(e) { toast(e.message, "error"); console.error(e); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Load'; }
});

// FIX #8: Names clearly visible — font-weight:700 on name cell
function renderScoreTable(classArm, subject, term) {
  const tbody = $("scoresTable");
  if (!_scoreStudents.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding:36px;color:var(--text-muted)">
      <i class="bi bi-inbox" style="font-size:2rem;display:block;margin-bottom:10px"></i>
      No students found in <strong>${classArm}</strong>.
      <br><small>Make sure students have been added to this class.</small>
    </td></tr>`;
    return;
  }
  tbody.innerHTML = _scoreStudents.map(s => {
    const sc    = _scoreData[s.regNumber] || {};
    const t1Val = sc.test1 != null ? sc.test1 : "";
    const t2Val = sc.test2 != null ? sc.test2 : "";
    const exVal = sc.exam  != null ? sc.exam  : "";
    const total = (Number(t1Val)||0) + (Number(t2Val)||0) + (Number(exVal)||0);
    const g     = total > 0 ? grade(total) : "—";
    return `<tr>
      <td><strong>${s.regNumber}</strong></td>
      <td style="font-weight:700;min-width:160px">${s.fullName || "—"}</td>
      <td style="text-align:center">
        <input type="number" class="score-input" id="t1_${s.regNumber}"
          value="${t1Val}" min="0" max="20" placeholder="0" style="width:66px"/>
      </td>
      <td style="text-align:center">
        <input type="number" class="score-input" id="t2_${s.regNumber}"
          value="${t2Val}" min="0" max="20" placeholder="0" style="width:66px"/>
      </td>
      <td style="text-align:center">
        <input type="number" class="score-input" id="ex_${s.regNumber}"
          value="${exVal}" min="0" max="60" placeholder="0" style="width:66px"/>
      </td>
      <td style="text-align:center;font-weight:800" id="tot_${s.regNumber}">${total||"—"}</td>
      <td style="text-align:center;font-weight:800" id="grd_${s.regNumber}"
          class="${gradeClass(g)}">${g}</td>
    </tr>`;
  }).join("");

  _scoreStudents.forEach(s => {
    ["t1","t2","ex"].forEach(p => {
      const inp = $(`${p}_${s.regNumber}`);
      if (inp) inp.addEventListener("input", () => liveTotal(s.regNumber));
    });
  });
}

function liveTotal(reg) {
  const clamp = (id, max) => {
    const inp = $(id); if (!inp || inp.value === "") return 0;
    let v = parseInt(inp.value) || 0;
    if (v < 0)   { v = 0;   inp.value = 0; }
    if (v > max) { v = max; inp.value = max; }
    return v;
  };
  const t1    = clamp(`t1_${reg}`, 20);
  const t2    = clamp(`t2_${reg}`, 20);
  const ex    = clamp(`ex_${reg}`, 60);
  const total = t1 + t2 + ex;
  const g     = total > 0 ? grade(total) : "—";
  const tc = $(`tot_${reg}`); if (tc) tc.textContent = total || "—";
  const gc = $(`grd_${reg}`); if (gc) { gc.textContent = g; gc.className = gradeClass(g); }
}

$("saveScoresBtn").addEventListener("click", async () => {
  const classArm  = $("scoreClassArm").value;
  const term      = $("scoreTerm").value;
  const subject   = $("scoreSubject").value;
  const classBase = classArm ? armToBase(classArm) : "";
  if (!classArm || !term || !subject || !_scoreStudents.length) {
    toast("Load students first before saving.", "error"); return;
  }
  const sessionData = _sessionCache || await getSession();
  const session     = sessionData.session || "";
  const btn = $("saveScoresBtn"); btn.disabled = true; btn.textContent = "Uploading…";
  try {
    // Build scores array — skip unchanged scores to save writes
    var scoresToSave = [];
    _scoreStudents.forEach(function(s) {
      var t1 = Math.min(Math.max(parseInt($("t1_"+s.regNumber)?.value)||0, 0), 20);
      var t2 = Math.min(Math.max(parseInt($("t2_"+s.regNumber)?.value)||0, 0), 20);
      var ex = Math.min(Math.max(parseInt($("ex_"+s.regNumber)?.value)||0, 0), 60);
      // Check if score changed from what was loaded — skip if unchanged
      var existing = _scoreMap && _scoreMap[s.regNumber];
      if (existing &&
          (existing.test1||0) === t1 &&
          (existing.test2||0) === t2 &&
          (existing.exam||0)  === ex) {
        return; // Unchanged — skip write
      }
      scoresToSave.push({
        regNumber: s.regNumber, fullName: s.fullName,
        classArm, classBase, subject,
        term: String(term), session,
        test1: t1, test2: t2, exam: ex
      });
    });

    if (!scoresToSave.length) {
      toast("No changes detected — nothing to save.", "info");
      return;
    }

    // Batch write — atomic, all or nothing, one network call
    await saveScoresBatch(scoresToSave);
    toast("Scores uploaded (" + scoresToSave.length + " changed) — " + subject + " / " + classArm + " / " + TERM_LABELS[term] + ".", "success");
  } catch(e) { toast(e.message, "error"); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-cloud-upload-fill"></i> Save & Upload Scores'; }
});

// ══════════════════════════════════════════════════════════════
//  BROADSHEET — FIX #9: Works for form teachers
// ══════════════════════════════════════════════════════════════
$("loadBroadsheetBtn").addEventListener("click", async () => {
  const classArm  = $("bsClassArm").value;
  const term      = $("bsTerm").value;
  const classBase = classArm ? armToBase(classArm) : "";
  if (!classArm || !term) { toast("Select class arm and term.", "error"); return; }

  const btn = $("loadBroadsheetBtn"); btn.disabled = true; btn.textContent = "Building…";
  try {
    const [students, allScoresRaw, subjects] = await Promise.all([
      getStudentsByClassArm(classArm),
      getScoresByClassArmTerm(classArm, term),
      getClassSubjects(classBase, term, _currentSession)
    ]);
    const allScores = allScoresRaw.filter(sc => !sc.session || sc.session === _currentSession);
    if (!students.length) { toast("No students found in this class arm.", "warning"); return; }
    if (!subjects.length) { toast("No subjects set up for this class/term yet.", "warning"); return; }

    // Cache broadsheet data — Excel download reuses this, zero extra reads
    _bsCache = { classArm, term, students, allScores, subjects };

    renderBroadsheet(classArm, term, students, allScores, subjects);
    $("broadsheetCard").style.display  = "block";
    $("downloadExcelBtn").style.display = "inline-flex";
  } catch(e) { toast(e.message, "error"); console.error(e); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Load'; }
});

function renderBroadsheet(classArm, term, students, allScores, subjects) {
  // Build score lookup: reg → {subject → scoreDoc}
  const scoreMap = {};
  allScores.forEach(sc => {
    if (!scoreMap[sc.regNumber]) scoreMap[sc.regNumber] = {};
    scoreMap[sc.regNumber][sc.subject] = sc;
  });

  // Enrich students with offered subjects + grand total
  const rows = students.map(s => {
    const offAll  = !s.subjectsOffered || s.subjectsOffered === "all";
    const offered = subjects.filter(sub => offAll || (Array.isArray(s.subjectsOffered) && s.subjectsOffered.includes(sub)));
    let grand = 0;
    offered.forEach(sub => {
      const sc = scoreMap[s.regNumber]?.[sub];
      if (sc) grand += (sc.test1||0) + (sc.test2||0) + (sc.exam||0);
    });
    return { ...s, offered, grand };
  });

  // Overall position in arm (sorted by grand total)
  const posMap = {};
  [...rows].sort((a,b) => b.grand - a.grand).forEach((r, i) => { posMap[r.regNumber] = ordinal(i+1); });

  // Per-subject position (only among students offering that subject)
  const subjPos = {};
  subjects.forEach(sub => {
    const offerers = rows.filter(r => r.offered.includes(sub))
      .map(r => { const sc=scoreMap[r.regNumber]?.[sub]; return { reg:r.regNumber, total:sc?(sc.test1||0)+(sc.test2||0)+(sc.exam||0):0 }; })
      .sort((a,b) => b.total - a.total);
    subjPos[sub] = {};
    offerers.forEach((r, i) => { subjPos[sub][r.reg] = ordinal(i+1); });
  });

  // Subject stats
  const subjAvg = {}, subjHigh = {}, subjLow = {};
  subjects.forEach(sub => {
    const tots = rows.filter(r => r.offered.includes(sub))
      .map(r => { const sc=scoreMap[r.regNumber]?.[sub]; return sc?(sc.test1||0)+(sc.test2||0)+(sc.exam||0):0; });
    subjAvg[sub]  = tots.length ? (tots.reduce((a,b)=>a+b,0)/tots.length).toFixed(1) : "—";
    subjHigh[sub] = tots.length ? Math.max(...tots) : "—";
    subjLow[sub]  = tots.length ? Math.min(...tots) : "—";
  });

  $("broadsheetHeader").querySelector("h5").innerHTML =
    `<i class="bi bi-table"></i> ${classArm} Broadsheet — ${TERM_LABELS[term]}
     <span class="badge badge-muted" style="margin-left:8px">${students.length} Students</span>`;

  // Build thead (2 rows)
  let thead = `<tr>
    <th rowspan="2">S/N</th>
    <th rowspan="2" style="text-align:left;min-width:140px">Student Name</th>
    <th rowspan="2">Reg No.</th>`;
  subjects.forEach(s => { thead += `<th colspan="5" style="background:#4338ca">${s}</th>`; });
  thead += `<th rowspan="2">Grand<br>Total</th><th rowspan="2">Average</th><th rowspan="2">Position</th></tr><tr>`;
  subjects.forEach(() => { thead += `<th class="sub-header">T1</th><th class="sub-header">T2</th><th class="sub-header">Ex</th><th class="sub-header">Total</th><th class="sub-header">Pos</th>`; });
  thead += "</tr>";
  $("broadsheetThead").innerHTML = thead;

  // Build tbody
  let tbody = "";
  [...rows].sort((a,b) => (a.regNumber||"").localeCompare(b.regNumber||"", undefined, {numeric:true})).forEach((r, idx) => {
    let cols = "";
    subjects.forEach(sub => {
      if (!r.offered.includes(sub)) {
        cols += `<td colspan="5" style="text-align:center;color:#94a3b8;background:#f9fafb;font-size:.72rem">N/A</td>`;
        return;
      }
      const sc  = scoreMap[r.regNumber]?.[sub];
      const t1  = sc?.test1||0, t2=sc?.test2||0, ex=sc?.exam||0, tot=t1+t2+ex;
      const g   = tot > 0 ? grade(tot) : "—";
      const pos = subjPos[sub]?.[r.regNumber] || "—";
      cols += `<td>${t1||"—"}</td><td>${t2||"—"}</td><td>${ex||"—"}</td>
               <td class="${tot>0?gradeClass(g):""}" style="font-weight:800">${tot||"—"}</td>
               <td class="pos-cell">${pos}</td>`;
    });
    const avg = r.offered.length > 0 ? (r.grand / r.offered.length).toFixed(1) : "0";
    tbody += `<tr>
      <td>${idx+1}</td>
      <td class="student-info">${r.fullName||"—"}</td>
      <td>${r.regNumber}</td>
      ${cols}
      <td style="font-weight:800">${r.grand}</td>
      <td style="font-weight:800">${avg}</td>
      <td class="pos-cell">${posMap[r.regNumber]||"—"}</td>
    </tr>`;
  });

  // Summary rows
  tbody += `
    <tr class="summary-row">
      <td colspan="3" style="text-align:left;font-weight:800;font-size:.78rem">CLASS AVERAGE</td>
      ${subjects.map(s=>`<td colspan="4" style="font-weight:800">${subjAvg[s]}</td><td>—</td>`).join("")}
      <td colspan="3">—</td>
    </tr>
    <tr class="summary-row">
      <td colspan="3" style="text-align:left;font-weight:800;font-size:.78rem">HIGHEST SCORE</td>
      ${subjects.map(s=>`<td colspan="4" style="font-weight:800">${subjHigh[s]}</td><td>—</td>`).join("")}
      <td colspan="3">—</td>
    </tr>
    <tr class="summary-row">
      <td colspan="3" style="text-align:left;font-weight:800;font-size:.78rem">LOWEST SCORE</td>
      ${subjects.map(s=>`<td colspan="4" style="font-weight:800">${subjLow[s]}</td><td>—</td>`).join("")}
      <td colspan="3">—</td>
    </tr>`;

  $("broadsheetTbody").innerHTML = tbody;
}

$("downloadExcelBtn").addEventListener("click", async function() {
  var classArm  = $("bsClassArm").value;
  var term      = $("bsTerm").value;
  var classBase = armToBase(classArm);
  if (!classArm || !term) { toast("Load broadsheet first.", "error"); return; }

  if (typeof XLSX === "undefined") {
    toast("Excel library not loaded. Refresh and try again.", "error");
    return;
  }

  var btn = $("downloadExcelBtn");
  btn.disabled = true; btn.textContent = "Generating...";

  try {
    // Reuse cached broadsheet data — ZERO extra Firestore reads
    // Only fetch session (lightweight — 1 read, usually cached)
    var students, allScores, subjects;
    if (_bsCache && _bsCache.classArm === classArm && _bsCache.term === term) {
      students  = _bsCache.students;
      allScores = _bsCache.allScores;
      subjects  = _bsCache.subjects;
    } else {
      // Fallback — reload if cache mismatch
      var results = await Promise.all([
        getStudentsByClassArm(classArm),
        getScoresByClassArmTerm(classArm, term),
        getClassSubjects(classBase, term, _currentSession)
      ]);
      students  = results[0];
      allScores = results[1].filter(function(sc){ return !sc.session || sc.session === _currentSession; });
      subjects  = results[2];
    }
    var sessionData = _sessionCache || await getSession();

    if (!students.length)  { toast("No students found.", "error"); return; }
    if (!subjects.length)  { toast("No subjects found.", "error"); return; }

    var ftPair  = Object.entries(FORM_TEACHERS).find(function(p) { return p[1] === classBase; });
    var ftEmail = ftPair ? ftPair[0] : "-";

    // Score lookup
    var scoreMap = {};
    allScores.forEach(function(sc) {
      if (!scoreMap[sc.regNumber]) scoreMap[sc.regNumber] = {};
      scoreMap[sc.regNumber][sc.subject] = sc;
    });

    // Enrich students
    var rows = students.map(function(s) {
      var offAll  = !s.subjectsOffered || s.subjectsOffered === "all";
      var offered = subjects.filter(function(sub) {
        return offAll || (Array.isArray(s.subjectsOffered) && s.subjectsOffered.includes(sub));
      });
      var grand = 0;
      offered.forEach(function(sub) {
        var sc = scoreMap[s.regNumber] && scoreMap[s.regNumber][sub];
        if (sc) grand += (sc.test1||0) + (sc.test2||0) + (sc.exam||0);
      });
      return Object.assign({}, s, { offered: offered, grand: grand });
    }).sort(function(a, b) { return (a.regNumber||"").localeCompare(b.regNumber||"", undefined, {numeric:true}); });

    // Position map
    var posMap = {};
    rows.slice().sort(function(a,b) { return b.grand - a.grand; }).forEach(function(r, i) {
      posMap[r.regNumber] = ordinal(i + 1);
    });

    // Subject stats + per-subject position map
    var subjAvg = {}, subjHigh = {}, subjLow = {};
    var subjectPosMap = {}; // subjectPosMap[subject][regNumber] = "1st", "2nd" etc.
    subjects.forEach(function(sub) {
      var tots = rows.filter(function(r) { return r.offered.includes(sub); }).map(function(r) {
        var sc = scoreMap[r.regNumber] && scoreMap[r.regNumber][sub];
        return { reg: r.regNumber, total: sc ? (sc.test1||0)+(sc.test2||0)+(sc.exam||0) : 0 };
      });
      // Sort descending for position
      var sorted = tots.slice().sort(function(a,b){ return b.total - a.total; });
      subjectPosMap[sub] = {};
      sorted.forEach(function(item, i) {
        subjectPosMap[sub][item.reg] = ordinal(i + 1);
      });
      var totVals = tots.map(function(t){ return t.total; });
      subjAvg[sub]  = totVals.length ? (totVals.reduce(function(a,b){return a+b;},0)/totVals.length).toFixed(1) : "-";
      subjHigh[sub] = totVals.length ? Math.max.apply(null, totVals) : "-";
      subjLow[sub]  = totVals.length ? Math.min.apply(null, totVals) : "-";
    });

    // ── BUILD WORKSHEET ──────────────────────────────────────
    var wsData = [];

    // HEADER
    wsData.push([(_schoolName || "BrightSchool").toUpperCase()]);
    wsData.push(["RESULT BROADSHEET"]);
    wsData.push(["Session: " + (sessionData.session||"-") + "  |  Term: " + TERM_LABELS[term] + "  |  Class: " + classArm]);
    wsData.push(["Form Teacher: " + ftEmail]);
    wsData.push([""]);

    // TABLE HEADER ROW 1 — subject group labels
    var h1 = ["S/N", "Student Name", "Reg No."];
    subjects.forEach(function(s) { h1.push(s, "", "", "", ""); });
    h1.push("Grand Total", "Average", "Position");
    wsData.push(h1);

    // TABLE HEADER ROW 2 — sub-columns
    var h2 = ["", "", ""];
    subjects.forEach(function() { h2.push("T1", "T2", "Exam", "Total", "Pos"); });
    h2.push("", "", "");
    wsData.push(h2);

    // STUDENT ROWS
    rows.forEach(function(r, idx) {
      var row = [idx + 1, r.fullName || "-", r.regNumber];
      subjects.forEach(function(sub) {
        if (!r.offered.includes(sub)) {
          row.push("N/A", "", "", "", "");
        } else {
      // Replace zero scores with dash — students who didn't take exam show -
      var sc = scoreMap[r.regNumber] && scoreMap[r.regNumber][sub];
          var t1 = sc && sc.test1 ? sc.test1 : "-";
          var t2 = sc && sc.test2 ? sc.test2 : "-";
          var ex = sc && sc.exam  ? sc.exam  : "-";
          var tot = (sc && (sc.test1||sc.test2||sc.exam))
            ? (sc.test1||0)+(sc.test2||0)+(sc.exam||0) : "-";
          var subPos = subjectPosMap[sub] ? (subjectPosMap[sub][r.regNumber] || "-") : "-";
          row.push(t1, t2, ex, tot, subPos);
        }
      });
      var avg = r.offered.length > 0 && r.grand > 0
        ? parseFloat((r.grand / r.offered.length).toFixed(1)) : (r.grand > 0 ? r.grand : "-");
      row.push(r.grand || "-", avg, posMap[r.regNumber] || "-");
      wsData.push(row);
    });

    // SUMMARY ROWS
    var avgRow  = ["", "CLASS AVERAGE",  ""];
    var highRow = ["", "HIGHEST SCORE",  ""];
    var lowRow  = ["", "LOWEST SCORE",   ""];
    subjects.forEach(function(sub) {
      avgRow.push( "",  "",  "", subjAvg[sub],  "");
      highRow.push("",  "",  "", subjHigh[sub], "");
      lowRow.push( "",  "",  "", subjLow[sub],  "");
    });
    avgRow.push("", "", "");  highRow.push("", "", "");  lowRow.push("", "", "");
    wsData.push(avgRow); wsData.push(highRow); wsData.push(lowRow);

    // FOOTER
    wsData.push([""]);
    wsData.push(["Signature: ___________________________"]);
    wsData.push(["Developed by Brightest Digital Services"]);
    wsData.push(["Date Generated: " + new Date().toLocaleDateString("en-GB", {day:"2-digit",month:"long",year:"numeric"})]);

    // BUILD WORKBOOK
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths
    var cw = [{wch:5},{wch:30},{wch:15}];
    subjects.forEach(function() { cw.push({wch:5},{wch:5},{wch:6},{wch:7},{wch:5}); });
    cw.push({wch:12},{wch:9},{wch:9});
    ws["!cols"] = cw;

    var sheetName = classArm.replace(/[\/\\*?\[\]]/g,"").substring(0,31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    // DOWNLOAD
    var wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    var blob  = new Blob([wbout], { type: "application/octet-stream" });
    var url   = URL.createObjectURL(blob);
    var a     = document.createElement("a");
    var fname = "Broadsheet_" + classArm + "_" + TERM_LABELS[term] + "_" + (sessionData.session||"2024") + ".xlsx";
    a.href    = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);

    toast("Excel downloaded successfully.", "success");

  } catch(e) { console.error(e); toast("Excel error: " + e.message, "error"); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-file-earmark-excel-fill"></i> Download Excel'; }
});

// ══════════════════════════════════════════════════════════════
//  REMARKS
// ══════════════════════════════════════════════════════════════
let _remStudents = [];

$("loadRemarksBtn").addEventListener("click", async () => {
  const classArm  = $("remarkClassArm").value;
  const term      = $("remarkTerm").value;
  const classBase = classArm ? armToBase(classArm) : "";
  if (!classArm) { toast("Select a class arm.", "error"); return; }
  if (_isFT && !_isMaster && classBase !== _ftClass) {
    toast("You can only enter remarks for your own class.", "error"); return;
  }
  const btn = $("loadRemarksBtn"); btn.disabled = true; btn.textContent = "Loading…";
  try {
    _remStudents = (await getStudentsByClassArm(classArm))
      .sort((a,b) => (a.regNumber||"").localeCompare(b.regNumber||"", undefined, {numeric:true}));
    const existing = await getRemarksByClassArmTerm(classArm, term, _currentSession);
    const remMap   = {};
    existing.forEach(r => { remMap[r.regNumber] = r.remark; });

    // ── Calculate positions for each student ──────────────
    // Fetch all scores for the class arm and compute grand total per student
    const allScoresRaw = await getScoresByClassArmTerm(classArm, term);
    const armScores    = allScoresRaw.filter(sc => !sc.session || sc.session === _currentSession);
    const totalsMap    = {};
    armScores.forEach(sc => {
      if (!totalsMap[sc.regNumber]) totalsMap[sc.regNumber] = 0;
      totalsMap[sc.regNumber] += (sc.test1||0) + (sc.test2||0) + (sc.exam||0);
    });
    // Sort descending to get rank
    const posMap = {};
    Object.keys(totalsMap)
      .sort((a,b) => totalsMap[b] - totalsMap[a])
      .forEach((reg, i) => { posMap[reg] = ordinal(i + 1); });

    $("remarksCardTitle").innerHTML = `<i class="bi bi-chat-left-quote-fill"></i> ${classArm} — ${TERM_LABELS[term]}`;
    $("remarksCard").style.display = "block";
    $("remarksTable").innerHTML = _remStudents.map(s => {
      const pos    = posMap[s.regNumber] || "—";
      const total  = totalsMap[s.regNumber] || 0;
      const posColor = pos === "1st" ? "#16a34a" : pos === "2nd" ? "#2563eb" : pos === "3rd" ? "#d97706" : "var(--text)";
      return `<tr>
        <td><strong>${s.regNumber}</strong></td>
        <td style="font-weight:700">${s.fullName||"—"}</td>
        <td><span class="badge badge-primary">Arm ${s.arm||"—"}</span></td>
        <td style="text-align:center">
          <span style="font-weight:900;font-size:.95rem;color:${posColor}">${pos}</span>
          ${total > 0 ? `<br><small style="color:var(--text-muted);font-size:.7rem">${total} pts</small>` : ""}
        </td>
        <td><input type="text" class="form-control" id="rem_${s.regNumber}"
          value="${(remMap[s.regNumber]||"").replace(/"/g,"&quot;")}"
          placeholder="Enter remark for this student…" style="font-size:.85rem"/></td>
      </tr>`;
    }).join("");
    toast(`${_remStudents.length} student(s) loaded.`, "success");
  } catch(e) { toast(e.message, "error"); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Load Students'; }
});

$("saveRemarksBtn").addEventListener("click", async () => {
  const classArm  = $("remarkClassArm").value;
  const term      = $("remarkTerm").value;
  const classBase = classArm ? armToBase(classArm) : "";
  if (!classArm || !_remStudents.length) return;
  const btn = $("saveRemarksBtn"); btn.disabled = true; btn.textContent = "Saving…";
  try {
    await Promise.all(_remStudents.map(s => {
      const remark = $(`rem_${s.regNumber}`)?.value.trim() || "";
      return saveRemark(s.regNumber, classArm, classBase, term, remark, _currentSession);
    }));
    toast("All remarks saved.", "success");
  } catch(e) { toast(e.message, "error"); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save"></i> Save All Remarks'; }
});

// ══════════════════════════════════════════════════════════════
//  APPROVALS  — Master Admin only
// ══════════════════════════════════════════════════════════════
$("loadApprovalsBtn").addEventListener("click", async () => {
  const term = $("approvalTerm").value;
  const btn  = $("loadApprovalsBtn"); btn.disabled = true; btn.textContent = "Loading…";
  try {
    const list = await getAllApprovals(_currentSession);
    const map  = {};
    list.filter(a => a.term === String(term)).forEach(a => { map[a.classArm] = a.approved; });
    $("approvalsGrid").innerHTML = ALL_ARMS.map(arm => {
      const approved = map[arm] === true;
      return `<div style="background:var(--white);border:1.5px solid ${approved?"var(--success)":"var(--border)"};
        border-radius:12px;padding:18px;text-align:center;transition:border-color .2s">
        <div style="font-weight:800;font-size:.92rem;margin-bottom:8px">${arm}</div>
        <div style="margin-bottom:12px">
          <span class="badge ${approved?"badge-success":"badge-muted"}">${approved?"✓ Approved":"⏳ Pending"}</span>
        </div>
        ${approved
          ? `<button class="btn btn-danger btn-sm" onclick="handleApproval('${arm}','${term}',false)"><i class="bi bi-x-circle"></i> Revoke</button>`
          : `<button class="btn btn-success btn-sm" onclick="handleApproval('${arm}','${term}',true)"><i class="bi bi-check-circle"></i> Approve</button>`
        }
      </div>`;
    }).join("");
  } catch(e) { toast(e.message, "error"); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Load Status'; }
});

window.handleApproval = async function(classArm, term, approve) {
  try {
    if (approve) { await approveResults(classArm, term, _currentSession); toast(`${classArm} approved — students can now view results.`, "success"); }
    else         { await revokeApproval(classArm, term, _currentSession);  toast(`${classArm} approval revoked.`, "info"); }
    $("loadApprovalsBtn").click();
  } catch(e) { toast(e.message, "error"); }
};

// ══════════════════════════════════════════════════════════════
//  TEACHER MANAGEMENT — Master Admin only
// ══════════════════════════════════════════════════════════════
function sectionToArms(section) {
  if (section === "JS")      return [...JS_ARMS_C];
  if (section === "SS")      return [...SS_ARMS];
  if (section === "BASIC")   return [...BASIC_ARMS];
  if (section === "NURSERY") return [...NURSERY_ARMS];
  if (section === "CRECHE")  return [...CRECHE_ARMS];
  return [...ALL_ARMS];
}

function sectionLabel(section) {
  if (section === "JS")      return "Junior Secondary (JS)";
  if (section === "SS")      return "Senior Secondary (SS)";
  if (section === "BASIC")   return "Basic (1–5)";
  if (section === "NURSERY") return "Nursery (1–3)";
  if (section === "CRECHE")  return "Creche";
  if (section === "ALL")     return "All Sections";
  return section || "—";
}

function renderTeacherRows() {
  if (!_isMaster) return;

  const ftBody = $("ftTeacherBody");
  if (ftBody) {
    const entries = Object.entries(FORM_TEACHERS);
    ftBody.innerHTML = entries.length ? entries.map(([email, cls], i) => `
      <tr>
        <td><input class="form-control form-control-sm ft-email" data-i="${i}" value="${email}" placeholder="teacher@email.com"/></td>
        <td>
          <select class="form-select form-select-sm ft-class" data-i="${i}">
            ${ALL_CLASSES.map(c => `<option ${c===cls?"selected":""}>${c}</option>`).join("")}
          </select>
        </td>
        <td><button class="btn btn-danger btn-sm" onclick="removeFT(${i})"><i class="bi bi-trash"></i></button></td>
      </tr>`).join("") : `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:12px">No form teachers added yet.</td></tr>`;
  }

  const stBody = $("stTeacherBody");
  if (stBody) {
    const entries = Object.entries(SUBJECT_TEACHERS);
    stBody.innerHTML = entries.length ? entries.map(([email, cfg], i) => `
      <tr>
        <td style="font-size:.82rem;font-weight:700">${email}</td>
        <td style="font-size:.82rem">${sectionLabel(cfg.section)}</td>
        <td style="font-size:.82rem">${(cfg.subjects||[]).join(", ") || "—"}</td>
        <td><button class="btn btn-danger btn-sm" onclick="removeST(${i})"><i class="bi bi-trash"></i></button></td>
      </tr>`).join("") : `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:12px">No subject teachers added yet.</td></tr>`;
  }
}

window.addFTRow = function() {
  const email = $("newFTEmail").value.trim().toLowerCase();
  const cls   = $("newFTClass").value;
  if (!email || !cls) { toast("Enter email and class.", "error"); return; }
  if (FORM_TEACHERS[email]) { toast("Email already added.", "error"); return; }
  FORM_TEACHERS[email] = cls;
  $("newFTEmail").value = "";
  renderTeacherRows();
};

window.removeFT = function(i) {
  const key = Object.keys(FORM_TEACHERS)[i];
  if (key) delete FORM_TEACHERS[key];
  renderTeacherRows();
};

window.loadSTSubjects = async function() {
  const section = $("newSTSection").value;
  const term    = $("scoreTerm")?.value || "1";
  if (!section) { toast("Select a section first.", "error"); return; }
  const btn = $("loadSTSubjectsBtn");
  btn.disabled = true; btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Loading…';
  try {
    // Pass current session so session-specific subjects are found correctly
    const subjects = await getSubjectsBySection(section, term, _currentSession);
    const wrap = $("stSubjectsCheckboxWrap");
    if (!subjects.length) {
      wrap.innerHTML = `<span style="font-size:.82rem;color:var(--text-muted)">No subjects found for ${sectionLabel(section)} section. Make sure subjects are saved in the Subjects section first.</span>`;
    } else {
      wrap.innerHTML = subjects.map(s =>
        `<label style="display:flex;align-items:center;gap:6px;font-size:.83rem;font-weight:700;cursor:pointer;background:var(--white);padding:6px 10px;border-radius:6px;border:1.5px solid var(--border)">
          <input type="checkbox" class="st-sub-check" value="${s}" style="accent-color:var(--primary);width:15px;height:15px"/> ${s}
        </label>`
      ).join("");
    }
    wrap.style.display = "flex";
    $("loadSTSubjectsHint").textContent = `${subjects.length} subject(s) loaded for ${sectionLabel(section)} section`;
  } catch(e) { toast(e.message, "error"); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Load Subjects'; }
};

window.addSTRow = function() {
  const email   = $("newSTEmail").value.trim().toLowerCase();
  const section = $("newSTSection").value;
  const checked = Array.from(document.querySelectorAll(".st-sub-check:checked")).map(c => c.value);
  if (!email)          { toast("Enter teacher email.", "error"); return; }
  if (!section)        { toast("Select a section.", "error"); return; }
  if (!checked.length) { toast("Select at least one subject.", "error"); return; }

  // Expand arms at save time using the updated sectionToArms
  const arms = sectionToArms(section);

  SUBJECT_TEACHERS[email] = { subjects: checked, classArms: arms, section };
  $("newSTEmail").value    = "";
  $("newSTSection").value  = "";
  $("stSubjectsCheckboxWrap").style.display = "none";
  $("stSubjectsCheckboxWrap").innerHTML     = "";
  $("loadSTSubjectsHint").textContent       = "Select a section first, then load subjects";
  renderTeacherRows();
  toast(`${email} added as subject teacher.`, "success");
};

window.removeST = function(i) {
  const key = Object.keys(SUBJECT_TEACHERS)[i];
  if (key) delete SUBJECT_TEACHERS[key];
  renderTeacherRows();
};

$("saveTeachersBtn")?.addEventListener("click", async () => {
  // Rebuild FORM_TEACHERS from live table inputs
  const emails  = document.querySelectorAll(".ft-email");
  const classes = document.querySelectorAll(".ft-class");
  const ft = {};
  emails.forEach((el, i) => {
    const email = el.value.trim().toLowerCase();
    const cls   = classes[i]?.value;
    if (email && cls) ft[email] = cls;
  });
  FORM_TEACHERS = ft;
  console.log("Saving — FT:", JSON.stringify(FORM_TEACHERS), "ST:", JSON.stringify(SUBJECT_TEACHERS));
  const btn = $("saveTeachersBtn"); btn.disabled = true; btn.textContent = "Saving…";
  try {
    await saveTeachers(FORM_TEACHERS, SUBJECT_TEACHERS);
    toast("Teacher roles saved successfully. ✓", "success");
    renderTeacherRows();
  } catch(e) { console.error("saveTeachers error:", e); toast("Save failed: " + e.message, "error"); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save"></i> Save Teacher Roles'; }
});

$("saveSTBtn")?.addEventListener("click", async () => {
  // Same as saveTeachersBtn — saves everything together
  $("saveTeachersBtn")?.click();
});

// ══════════════════════════════════════════════════════════════
//  SETTINGS  — Master Admin only
// ══════════════════════════════════════════════════════════════

// Save School Identity
$("saveSchoolBtn")?.addEventListener("click", async () => {
  var name    = ($("schoolNameInput")?.value    || "").trim();
  var type    = ($("schoolTypeInput")?.value    || "").trim();
  var address = ($("schoolAddressInput")?.value || "").trim();
  var phone   = ($("schoolPhoneInput")?.value   || "").trim();
  var motto   = ($("schoolMottoInput")?.value   || "").trim();
  if (!name) { toast("Enter school name.", "error"); return; }
  var btn = $("saveSchoolBtn"); btn.disabled = true; btn.textContent = "Saving…";
  try {
    var s = _sessionCache || await getSession();
    await saveSession(s.session||"", s.currentTerm||"1", name, _schoolLogo||s.schoolLogo||"",
      s.termStartDate||"", s.termEndDate||"",
      { schoolType: type, schoolAddress: address, schoolPhone: phone, schoolMotto: motto });
    _schoolName = name;
    var bn = $("brandName"); if (bn) bn.textContent = name;
    _sessionCache = null; toast("School identity saved. ✓", "success");
  } catch(e) { toast(e.message, "error"); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save"></i> Save School Identity'; }
});

// Save Next Term Info + Fees
$("saveFeesBtn")?.addEventListener("click", async () => {
  var btn = $("saveFeesBtn"); btn.disabled = true; btn.textContent = "Saving…";
  try {
    var s = _sessionCache || await getSession();
    await saveSession(s.session||"", s.currentTerm||"1", s.schoolName||"", s.schoolLogo||"",
      s.termStartDate||"", s.termEndDate||"", {
        nextTermBegins:  $("nextTermBeginsInput")?.value  || "",
        feesCreche:      $("feesCrecheInput")?.value      || "",
        feesNursery:     $("feesNurseryInput")?.value     || "",
        feesBasic:       $("feesBasicInput")?.value       || "",
        feesJSS:         $("feesJSSInput")?.value         || "",
        feesSSS:         $("feesSSSInput")?.value         || ""
      });
    _sessionCache = null; toast("Next term info saved. ✓", "success");
  } catch(e) { toast(e.message, "error"); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save"></i> Save Next Term Info'; }
});

// Save Principal Remarks
$("savePrincipalRemarksBtn")?.addEventListener("click", async () => {
  var btn = $("savePrincipalRemarksBtn"); btn.disabled = true; btn.textContent = "Saving…";
  try {
    var s = _sessionCache || await getSession();
    await saveSession(s.session||"", s.currentTerm||"1", s.schoolName||"", s.schoolLogo||"",
      s.termStartDate||"", s.termEndDate||"", {
        principalRemark1: $("principalRemark1")?.value || "",
        principalRemark2: $("principalRemark2")?.value || "",
        principalRemark3: $("principalRemark3")?.value || "",
        principalRemark4: $("principalRemark4")?.value || ""
      });
    _sessionCache = null; toast("Principal remarks saved. ✓", "success");
  } catch(e) { toast(e.message, "error"); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save"></i> Save Principal Remarks'; }
});

// Save Head Teacher Remarks
$("saveHtRemarksBtn")?.addEventListener("click", async () => {
  var btn = $("saveHtRemarksBtn"); btn.disabled = true; btn.textContent = "Saving…";
  try {
    var s = _sessionCache || await getSession();
    await saveSession(s.session||"", s.currentTerm||"1", s.schoolName||"", s.schoolLogo||"",
      s.termStartDate||"", s.termEndDate||"", {
        htRemark1: $("htRemark1")?.value || "",
        htRemark2: $("htRemark2")?.value || "",
        htRemark3: $("htRemark3")?.value || "",
        htRemark4: $("htRemark4")?.value || ""
      });
    _sessionCache = null; toast("Head Teacher remarks saved. ✓", "success");
  } catch(e) { toast(e.message, "error"); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save"></i> Save Head Teacher Remarks'; }
});

// Save Grading System
$("saveGradingBtn")?.addEventListener("click", async () => {
  var btn = $("saveGradingBtn"); btn.disabled = true; btn.textContent = "Saving…";
  try {
    var s = _sessionCache || await getSession();
    await saveSession(s.session||"", s.currentTerm||"1", s.schoolName||"", s.schoolLogo||"",
      s.termStartDate||"", s.termEndDate||"", {
        gradeA:  $("gradeAInput")?.value  || "86-100",
        gradeB1: $("gradeB1Input")?.value || "71-85",
        gradeB2: $("gradeB2Input")?.value || "61-70",
        gradeC:  $("gradeCInput")?.value  || "50-60",
        gradeD:  $("gradeDInput")?.value  || "39-49",
        gradeF:  $("gradeFInput")?.value  || "0-38"
      });
    _sessionCache = null; toast("Grading system saved. ✓", "success");
  } catch(e) { toast(e.message, "error"); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save"></i> Save Grading System'; }
});

$("saveSessionBtn")?.addEventListener("click", async () => {
  const session   = $("sessionInput").value.trim();
  const term      = $("termInput").value;
  const startDate = $("termStartDate")?.value || "";
  const endDate   = $("termEndDate")?.value   || "";
  if (!session) { toast("Enter a session.", "error"); return; }
  const btn = $("saveSessionBtn"); btn.disabled = true; btn.textContent = "Saving...";
  try {
    if (_currentSession) {
      const { tagged } = await tagAllUntaggedScores(_currentSession);
      if (tagged > 0) console.log("Tagged " + tagged + " old score(s) with session " + _currentSession);
    }
    var s = _sessionCache || await getSession();
    await saveSession(session, term, _schoolName||s.schoolName||"", _schoolLogo||s.schoolLogo||"", startDate, endDate);
    _sessionCache = null; // Clear cache — next call fetches fresh data
    _currentSession = session;
    toast("Session saved.", "success");
    $("statSession").textContent = session;
    $("statTerm").textContent    = TERM_LABELS[term];
    updateTermWeeksDisplay(startDate, endDate);
  } catch(e) { toast(e.message, "error"); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save"></i> Save Session'; }
});

// ══════════════════════════════════════════════════════════════
//  DATA REPAIR — Fix classArm format on existing students
// ══════════════════════════════════════════════════════════════
$("fixClassArmBtn")?.addEventListener("click", async () => {
  if (!_isMaster) { toast("Only Master Admin can run data repair.", "error"); return; }
  const btn = $("fixClassArmBtn"); btn.disabled = true; btn.textContent = "Fixing…";
  const res = $("fixClassArmResult");
  try {
    const { fixed, already } = await fixAllStudentClassArms();
    if (res) {
      res.innerHTML = fixed > 0
        ? `<span style="color:var(--success)"><i class="bi bi-check-circle-fill"></i> Fixed <strong>${fixed}</strong> student record(s). ${already} were already correct. Reload the page to confirm.</span>`
        : `<span style="color:var(--success)"><i class="bi bi-check-circle-fill"></i> All <strong>${already}</strong> student records already have the correct format. No changes needed.</span>`;
    }
    toast(fixed > 0 ? `Fixed ${fixed} student record(s). Subject teachers should now see students.` : "All records already correct.", fixed > 0 ? "success" : "info");
    await loadStudents();
  } catch(e) {
    if (res) res.innerHTML = `<span style="color:var(--danger)">Error: ${e.message}</span>`;
    toast(e.message, "error");
  }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-wrench-adjustable"></i> Fix All Student classArm Values'; }
});

// ══════════════════════════════════════════════════════════════
//  ATTENDANCE — Tabs
// ══════════════════════════════════════════════════════════════
document.querySelectorAll(".att-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll(".att-tab").forEach(b => b.classList.remove("active","btn-primary"));
    document.querySelectorAll(".att-tab-content").forEach(c => c.style.display = "none");
    btn.classList.add("active","btn-primary");
    const tabEl = $(tab); if (tabEl) tabEl.style.display = "block";
  });
});

// ── Show analytics/per-student tabs for form teachers and admin ──
function applyAttendanceTabs() {
  const analyticsTab  = $("attTabAnalytics");
  const studentTab    = $("attTabStudent");
  if (analyticsTab) analyticsTab.style.display = (_isMaster || _isFT) ? "" : "none";
  if (studentTab)   studentTab.style.display   = (_isMaster || _isFT) ? "" : "none";

  // For FT: clicking Analytics auto-triggers generate with their class pre-filled
  if (_isFT && !_isMaster) {
    if (analyticsTab) analyticsTab.onclick = function() {
      // switch tab visually
      document.querySelectorAll(".att-tab").forEach(function(b){ b.classList.remove("active","btn-primary"); });
      document.querySelectorAll(".att-tab-content").forEach(function(c){ c.style.display="none"; });
      analyticsTab.classList.add("active","btn-primary");
      const tabEl = $("att-analytics"); if (tabEl) tabEl.style.display = "block";
      // auto-generate with FT class
      const clsEl = $("analyticsClass");
      if (clsEl) clsEl.value = _ftClass;
      $("generateAnalyticsBtn")?.click();
    };
    if (studentTab) studentTab.onclick = function() {
      document.querySelectorAll(".att-tab").forEach(function(b){ b.classList.remove("active","btn-primary"); });
      document.querySelectorAll(".att-tab-content").forEach(function(c){ c.style.display="none"; });
      studentTab.classList.add("active","btn-primary");
      const tabEl = $("att-student"); if (tabEl) tabEl.style.display = "block";
      // auto-load with FT class
      const clsEl = $("perStudentClass");
      if (clsEl) clsEl.value = _ftClass;
      $("loadPerStudentBtn")?.click();
    };
  }
}

// ── Set today's date on load ──────────────────────────────────
const attDateEl = $("attDate");
if (attDateEl) attDateEl.value = new Date().toISOString().split("T")[0];

// ── Helpers ───────────────────────────────────────────────────
function getWeekNumber(dateStr) {
  // Returns ISO week number
  const d = new Date(dateStr);
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const w = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - w) / 86400000 - 3 + (w.getDay() + 6) % 7) / 7);
}

function getDayName(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-NG", { weekday: "short" });
}

function isWeekend(dateStr) {
  const d = new Date(dateStr).getDay();
  return d === 0 || d === 6;
}

// ══════════════════════════════════════════════════════════════
//  LOAD ATTENDANCE — Daily Entry
// ══════════════════════════════════════════════════════════════
let _attStudents = [];

$("loadAttBtn")?.addEventListener("click", async () => {
  const classArm = $("attClassArm").value;
  const term     = $("attTerm").value;
  const date     = $("attDate").value;
  if (!classArm) { toast("Select a class arm.", "error"); return; }
  if (!date)     { toast("Select a date.", "error"); return; }

  // Role check
  if (_isFT && !_isMaster && armToBase(classArm) !== _ftClass) {
    toast("You can only take attendance for your own class.", "error"); return;
  }

  // Weekend check
  if (isWeekend(date)) { toast("Attendance is only recorded Mon–Fri.", "warning"); return; }

  const btn = $("loadAttBtn"); btn.disabled = true; btn.textContent = "Loading...";
  try {
    const sessionData = _sessionCache || await getSession();
    const session     = sessionData.session || "";
    const holidays    = await getHolidays(session, term);
    const isHoliday   = holidays.some(h => h.date === date);

    _attStudents = (await getStudentsByClassArm(classArm))
      .sort((a,b) => (a.regNumber||"").localeCompare(b.regNumber||"", undefined, {numeric:true}));

    // Load existing records for this date
    const existing = await getAttendanceByClassDate(classArm, date);
    const attMap   = {};
    existing.forEach(r => { attMap[r.regNumber] = r; });

    const dayName = new Date(date).toLocaleDateString("en-NG", { weekday:"long", day:"2-digit", month:"short", year:"numeric" });
    $("attEntryTitle").innerHTML = `<i class="bi bi-list-check"></i> ${classArm} — ${dayName}`;
    $("attHolidayBadge").style.display = isHoliday ? "flex" : "none";
    $("attEntryCard").style.display = "block";

    if (isHoliday) {
      $("attEntryTable").innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted)">
        <i class="bi bi-calendar-x" style="font-size:1.5rem;display:block;margin-bottom:8px"></i>
        This date is marked as a <strong>Holiday</strong>. No attendance can be taken.
      </td></tr>`;
      $("saveAttBtn").style.display = "none";
      return;
    }

    $("saveAttBtn").style.display = "inline-flex";

    if (!_attStudents.length) {
      $("attEntryTable").innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted)">No students found in ${classArm}.</td></tr>`;
      return;
    }

    $("attEntryTable").innerHTML = _attStudents.map(s => {
      const rec = attMap[s.regNumber] || {};
      const am  = rec.morning   !== undefined ? rec.morning   : 1;
      const pm  = rec.afternoon !== undefined ? rec.afternoon : 1;
      const tot = am + pm;
      const status = rec.status || (tot === 2 ? "Present" : tot === 0 ? "Absent" : "Late");
      return `<tr>
        <td><strong>${s.regNumber}</strong></td>
        <td style="font-weight:700;min-width:140px">${s.fullName||"—"}</td>
        <td><span class="badge ${s.gender==="Female"?"badge-pink":"badge-blue"}" style="font-size:.7rem">${s.gender||"—"}</span></td>
        <td style="text-align:center">
          <select class="form-select form-select-sm att-am" id="am_${s.regNumber}" style="width:72px;margin:auto" onchange="calcAttTotal('${s.regNumber}')">
            <option value="1" ${am===1?"selected":""}>1</option>
            <option value="0" ${am===0?"selected":""}>0</option>
          </select>
        </td>
        <td style="text-align:center">
          <select class="form-select form-select-sm att-pm" id="pm_${s.regNumber}" style="width:72px;margin:auto" onchange="calcAttTotal('${s.regNumber}')">
            <option value="1" ${pm===1?"selected":""}>1</option>
            <option value="0" ${pm===0?"selected":""}>0</option>
          </select>
        </td>
        <td style="text-align:center;font-weight:800" id="att-tot_${s.regNumber}">${tot}</td>
        <td style="text-align:center">
          <select class="form-select form-select-sm att-status" id="att-status_${s.regNumber}" style="width:90px;margin:auto" onchange="calcAttTotal('${s.regNumber}')">
            <option ${status==="Present"?"selected":""}>Present</option>
            <option ${status==="Absent"?"selected":""}>Absent</option>
            <option ${status==="Late"?"selected":""}>Late</option>
            <option ${status==="Holiday"?"selected":""}>Holiday</option>
          </select>
        </td>
        <td><input type="text" class="form-control form-control-sm att-remark" id="att-rem_${s.regNumber}" value="${rec.remark||""}" placeholder="Optional"/></td>
      </tr>`;
    }).join("");

    // Daily History
    loadAttHistory(classArm, term, session);

  } catch(e) { toast(e.message, "error"); console.error(e); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-search"></i> Load'; }
});

window.calcAttTotal = function(reg) {
  const statusEl = $("att-status_"+reg);
  const status   = statusEl ? statusEl.value : "";
  const amEl = $("am_"+reg);
  const pmEl = $("pm_"+reg);

  // If this student is set to Holiday — mark ALL students as Holiday
  if (status === "Holiday") {
    _attStudents.forEach(function(s) {
      const sSt = $("att-status_"+s.regNumber);
      const sAm = $("am_"+s.regNumber);
      const sPm = $("pm_"+s.regNumber);
      const sTo = $("att-tot_"+s.regNumber);
      if (sSt) sSt.value = "Holiday";
      if (sAm) sAm.value = 0;
      if (sPm) sPm.value = 0;
      if (sTo) sTo.textContent = "H";
    });
    return;
  }

  // Normal calculation for non-Holiday
  if (amEl) { /* keep value */ }
  if (pmEl) { /* keep value */ }
  const am  = parseInt(amEl?.value)||0;
  const pm  = parseInt(pmEl?.value)||0;
  const tot = am + pm;
  const el  = $("att-tot_"+reg);
  if (el) el.textContent = tot;
  if (statusEl) statusEl.value = tot === 2 ? "Present" : tot === 0 ? "Absent" : "Late";
};

async function loadAttHistory(classArm, term, session) {
  try {
    const recs = await getAttendanceByClassTerm(classArm, term, session);
    const byDate = {};
    recs.forEach(r => {
      if (!byDate[r.date]) byDate[r.date] = { present:0, absent:0, late:0 };
      if (r.status === "Present") byDate[r.date].present++;
      else if (r.status === "Absent") byDate[r.date].absent++;
      else if (r.status === "Late") byDate[r.date].late++;
    });
    const dates = Object.keys(byDate).sort().reverse().slice(0,10);
    if (!dates.length) { $("attHistoryCard").style.display = "none"; return; }
    $("attHistoryCard").style.display = "block";
    $("attHistoryBody").innerHTML = dates.map(d => {
      const info = byDate[d];
      const label = new Date(d).toLocaleDateString("en-NG", { weekday:"short", day:"2-digit", month:"short" });
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
        <span style="font-weight:700;color:var(--text-dark)">${label}</span>
        <span style="font-size:.8rem">
          <span style="color:#10b981;font-weight:700">P${info.present}</span>
          <span style="color:#ef4444;font-weight:700;margin:0 6px">A${info.absent}</span>
          <span style="color:#f59e0b;font-weight:700">L${info.late}</span>
        </span>
      </div>`;
    }).join("");
  } catch(e) { console.error("loadAttHistory:", e); }
}

// ── Save Attendance ───────────────────────────────────────────
$("saveAttBtn")?.addEventListener("click", async () => {
  const classArm = $("attClassArm").value;
  const term     = $("attTerm").value;
  const date     = $("attDate").value;
  if (!_attStudents.length) { toast("Load students first.", "error"); return; }

  const sessionData = _sessionCache || await getSession();
  const session     = sessionData.session || "";
  const week        = getWeekNumber(date);
  const btn         = $("saveAttBtn"); btn.disabled = true; btn.textContent = "Saving...";

  try {
    // Build records array
    var records = _attStudents.map(function(s) {
      var am     = parseInt($("am_"+s.regNumber)?.value)||0;
      var pm     = parseInt($("pm_"+s.regNumber)?.value)||0;
      var status = $("att-status_"+s.regNumber)?.value || "Present";
      var remark = $("att-rem_"+s.regNumber)?.value.trim() || "";
      return {
        regNumber: s.regNumber,
        fullName:  s.fullName,
        gender:    s.gender,
        classArm,
        classBase: armToBase(classArm),
        date, term: String(term), session, week: String(week),
        morning: am, afternoon: pm, total: am+pm,
        status, remark
      };
    });

    // Batch write — atomic, all or nothing, one network round trip
    // Prevents partial attendance saves if network drops mid-way
    await saveAttendanceBatch(records);
    toast("Attendance saved — " + records.length + " student(s).", "success");
    loadAttHistory(classArm, term, session);
  } catch(e) { toast(e.message, "error"); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-cloud-upload-fill"></i> Save Attendance'; }
});

// ══════════════════════════════════════════════════════════════
//  ANALYTICS — Admin only
// ══════════════════════════════════════════════════════════════
$("generateAnalyticsBtn")?.addEventListener("click", async () => {
  const classBase = $("analyticsClass").value;
  const term      = $("analyticsTerm").value;
  if (!classBase) { toast("Select a class or section.", "error"); return; }
  const btn = $("generateAnalyticsBtn"); btn.disabled = true; btn.textContent = "Generating...";

  // Detect section-wide options
  const isSectionView = classBase === "__ALL__" || classBase === "__SECONDARY__" || classBase === "__BASIC_NURSERY_CRECHE__";

  // Hide/show appropriate result sections
  const sectionSummaryEl = $("sectionSummaryResult");
  const analyticsResultEl = $("analyticsResult");
  if (sectionSummaryEl) sectionSummaryEl.style.display = "none";
  if (analyticsResultEl) analyticsResultEl.style.display = "none";

  try {
    const sessionData = _sessionCache || await getSession();
    const session     = sessionData.session || "";

    if (isSectionView) {
      // ── SECTION / SCHOOL-WIDE VIEW ──────────────────────────
      var sectionClasses = [];
      var sectionTitle   = "";
      if (classBase === "__ALL__") {
        sectionClasses = ALL_CLASSES.slice();
        sectionTitle   = "Entire School";
      } else if (classBase === "__SECONDARY__") {
        sectionClasses = SS_CLASSES.concat(JS_CLASSES);
        sectionTitle   = "Secondary Section (SS + JS)";
      } else {
        sectionClasses = BASIC_CLASSES.concat(NURSERY_CLASSES).concat(CRECHE_CLASSES);
        sectionTitle   = "Basic, Nursery & Creche";
      }

      // Fetch all students + attendance + holidays for these classes
      const [allStudentsArr, holidays] = await Promise.all([
        Promise.all(sectionClasses.map(function(c){ return getStudentsByClass(c); })).then(function(r){ return r.flat(); }),
        getHolidays(session, term)
      ]);
      const recsArr = await Promise.all(
        sectionClasses.map(function(c){ return getAttendanceByClassBaseTerm(c, term, session); })
      );
      const allRecs = recsArr.flat();

      const holidayDates = new Set(holidays.map(function(h){ return h.date; }));
      allRecs.filter(function(r){ return r.status === "Holiday"; }).forEach(function(r){ holidayDates.add(r.date); });
      const nonHolRecs = allRecs.filter(function(r){ return r.status !== "Holiday" && !holidayDates.has(r.date); });

      const totalStudents = allStudentsArr.length;
      const boys          = allStudentsArr.filter(function(s){ return s.gender === "Male"; }).length;
      const girls         = allStudentsArr.filter(function(s){ return s.gender === "Female"; }).length;

      const schoolDays  = [...new Set(nonHolRecs.map(function(r){ return r.date; }))].filter(function(d){ return !isWeekend(d); }).length;
      const possible    = schoolDays * 2 * totalStudents;

      const presRecs    = nonHolRecs.filter(function(r){ return r.status === "Present"; });
      const totalAM     = presRecs.reduce(function(s,r){ return s+(r.morning||0); }, 0);
      const totalPM     = presRecs.reduce(function(s,r){ return s+(r.afternoon||0); }, 0);
      const totalPres   = totalAM + totalPM;

      const boysPresRecs  = presRecs.filter(function(r){ return r.gender === "Male"; });
      const girlsPresRecs = presRecs.filter(function(r){ return r.gender === "Female"; });
      const boysAM   = boysPresRecs.reduce(function(s,r){ return s+(r.morning||0); }, 0);
      const boysPM   = boysPresRecs.reduce(function(s,r){ return s+(r.afternoon||0); }, 0);
      const girlsAM  = girlsPresRecs.reduce(function(s,r){ return s+(r.morning||0); }, 0);
      const girlsPM  = girlsPresRecs.reduce(function(s,r){ return s+(r.afternoon||0); }, 0);
      const boysPres  = boysAM + boysPM;
      const girlsPres = girlsAM + girlsPM;

      const termPct = possible > 0 ? ((totalPres/possible)*100).toFixed(1) : "0";
      const termAvg = (schoolDays*2) > 0 ? (totalPres/(schoolDays*2)).toFixed(1) : "0";

      const $t = $("sectionSummaryTitle");
      if ($t) $t.innerHTML = "<i class='bi bi-globe'></i> " + sectionTitle + " — " + TERM_LABELS[term];

      $("sectionSummaryCards").innerHTML = [
        { val: totalStudents,         lbl: "Total Students",               sub: boys+"B · "+girls+"G",               color:"#4f46e5" },
        { val: totalAM+"+"+totalPM,   lbl: "Total Attendance (AM + PM)",   sub: "Total: "+totalPres+" sessions",     color:"#059669" },
        { val: termPct+"%",           lbl: "Term Attendance %",            sub: totalPres+" ÷ "+possible+" × 100",   color:"#2563eb" },
        { val: termAvg,               lbl: "Average Per Session",          sub: "Total ÷ school sessions open",      color:"#7c3aed" },
        { val: boysAM+"+"+boysPM,     lbl: "Boys Attendance (AM + PM)",    sub: "Total: "+boysPres+" sessions",      color:"#0891b2" },
        { val: girlsAM+"+"+girlsPM,   lbl: "Girls Attendance (AM + PM)",   sub: "Total: "+girlsPres+" sessions",     color:"#db2777" }
      ].map(function(c){ return `<div class="stat-card">
        <div class="stat-icon" style="background:${c.color}22"><i class="bi bi-bar-chart-fill" style="color:${c.color}"></i></div>
        <div><div class="stat-val" style="color:${c.color};font-size:1.1rem">${c.val}</div>
        <div class="stat-lbl">${c.lbl}</div>
        <div style="font-size:.7rem;color:var(--text-muted);margin-top:2px;word-break:break-word">${c.sub}</div></div>
      </div>`; }).join("");

      if (sectionSummaryEl) sectionSummaryEl.style.display = "block";

    } else {
      // ── INDIVIDUAL CLASS VIEW (existing logic) ──────────────
      const termWeeks = countSchoolWeeks(sessionData.termStartDate, sessionData.termEndDate);

    // Fetch BOTH arms combined
    const [students, recs, holidays] = await Promise.all([
      getStudentsByClass(classBase),
      getAttendanceByClassBaseTerm(classBase, term, session),
      getHolidays(session, term)
    ]);

    const holidayDates  = new Set(holidays.map(h => h.date));
    // Also treat dates where attendance status is "Holiday" as holiday dates
    recs.filter(r => r.status === "Holiday").forEach(r => holidayDates.add(r.date));

    const totalStudents = students.length;
    const boys  = students.filter(s => s.gender === "Male").length;
    const girls = students.filter(s => s.gender === "Female").length;

    // Group by date — use r.total (morning+afternoon sessions) not record count
    const byDate = {};
    recs.forEach(r => {
      if (r.status === "Holiday" || holidayDates.has(r.date)) return;
      if (!byDate[r.date]) byDate[r.date] = { present:0, absent:0, late:0, boys:0, girls:0 };
      const d = byDate[r.date];
      if (r.status === "Present") {
        d.present += r.total||2; // AM + PM sessions
        if (r.gender === "Male") d.boys += r.total||2;
        else d.girls += r.total||2;
      }
      else if (r.status === "Absent") d.absent++;
      else if (r.status === "Late")   d.late++;
    });

    const schoolDays    = Object.keys(byDate).filter(d => !isWeekend(d)).length;
    // Possible = students × school days × 2 sessions
    const totalPossible = schoolDays * 2 * totalStudents;
    const totalPresent  = Object.values(byDate).reduce((s, d) => s + d.present, 0);
    const boysPresent   = Object.values(byDate).reduce((s, d) => s + d.boys, 0);
    const girlsPresent  = Object.values(byDate).reduce((s, d) => s + d.girls, 0);
    const totalLate     = recs.filter(r => !holidayDates.has(r.date) && r.status === "Late").length;
    const totalAbsent   = recs.filter(r => !holidayDates.has(r.date) && r.status === "Absent").length;
    const termRate      = totalPossible > 0 ? ((totalPresent / totalPossible) * 100).toFixed(1) : "0";
    const boysRate      = boys  > 0 && schoolDays > 0 ? ((boysPresent  / (boys*schoolDays*2))  * 100).toFixed(1) : "0";
    const girlsRate     = girls > 0 && schoolDays > 0 ? ((girlsPresent / (girls*schoolDays*2)) * 100).toFixed(1) : "0";

    // Total holidays
    const totalHolidays = holidayDates.size;

    // ── Group by week using session totals ────────────────────
    const termStart2 = sessionData.termStartDate ? new Date(sessionData.termStartDate) : null;
    const byWeekTemp = {};
    Object.keys(byDate).sort().forEach(d => {
      if (isWeekend(d)) return;
      let wk;
      if (termStart2) {
        const diff = Math.floor((new Date(d) - termStart2) / (7*24*60*60*1000));
        wk = "Week " + (diff + 1);
      } else { wk = "Week " + getWeekNumber(d); }
      if (!byWeekTemp[wk]) byWeekTemp[wk] = { days:0, present:0, boys:0, girls:0, absent:0 };
      byWeekTemp[wk].days++;
      byWeekTemp[wk].present += byDate[d].present; // already summed sessions
      byWeekTemp[wk].boys    += byDate[d].boys;
      byWeekTemp[wk].girls   += byDate[d].girls;
      byWeekTemp[wk].absent  += byDate[d].absent;
    });
    const weekKeysSorted = Object.keys(byWeekTemp).sort((a,b) => parseInt(a.split(" ")[1]) - parseInt(b.split(" ")[1]));

    // ── CORRECT FORMULAS ──────────────────────────────────────
    // Term attendance rate = Total present ÷ (students × school days × 2) × 100
    const termRateCorrect = totalPossible > 0
      ? ((totalPresent / totalPossible) * 100).toFixed(1) : "0";

    // Term average = Total present ÷ (school days × 2) — average sessions per day
    const termAvg = (schoolDays * 2) > 0
      ? (totalPresent / (schoolDays * 2)).toFixed(1) : "0";

    // This week % = Total present this week ÷ (students × school days this week × 2) × 100
    const lastWk     = weekKeysSorted[weekKeysSorted.length - 1];
    const lastWkData = lastWk ? byWeekTemp[lastWk] : null;
    const weekPct    = lastWkData && (lastWkData.days * 2 * totalStudents) > 0
      ? ((lastWkData.present / (lastWkData.days * 2 * totalStudents)) * 100).toFixed(1) : "0";

    $("analyticsCards").innerHTML = [
      { val: totalStudents,      lbl: "Total Students",        sub: boys+"B · "+girls+"G",                           color:"#4f46e5" },
      { val: schoolDays,         lbl: "School Days Open",      sub: (termWeeks||"?")+" weeks · excl. holidays",      color:"#0891b2" },
      { val: totalHolidays,      lbl: "Total Holidays",        sub: "Days school was closed",                        color:"#f59e0b" },
      { val: totalPresent,       lbl: "Total Attendance Term", sub: totalPossible+" possible sessions",              color:"#10b981" },
      { val: termRateCorrect+"%",lbl: "Term Attendance Rate",  sub: totalPresent+" ÷ "+totalPossible+" × 100",       color:"#059669" },
      { val: termAvg,            lbl: "Term Avg Per Session",  sub: totalPresent+" ÷ "+(schoolDays*2)+" sessions",   color:"#7c3aed" },
      { val: weekPct+"%",        lbl: "This Week Att. %",      sub: lastWk||"No data yet",                           color:"#0ea5e9" },
      { val: totalLate,          lbl: "Total Late",            sub: totalAbsent+" Absences",                         color:"#f59e0b" },
      { val: boysRate+"%",       lbl: "Boys Att. Rate",        sub: boysPresent+" ÷ "+(boys*schoolDays*2)+" × 100",  color:"#2563eb" },
      { val: girlsRate+"%",      lbl: "Girls Att. Rate",       sub: girlsPresent+" ÷ "+(girls*schoolDays*2)+" × 100",color:"#db2777" }
    ].map(c => `<div class="stat-card">
      <div class="stat-icon" style="background:${c.color}22"><i class="bi bi-bar-chart-fill" style="color:${c.color}"></i></div>
      <div><div class="stat-val" style="color:${c.color}">${c.val}</div>
      <div class="stat-lbl">${c.lbl}</div>
      <div style="font-size:.7rem;color:var(--text-muted);margin-top:2px;word-break:break-word">${c.sub}</div></div>
    </div>`).join("");

    // ── Weekly breakdown table ────────────────────────────────
    const termStart = sessionData.termStartDate ? new Date(sessionData.termStartDate) : null;
    const byWeek = byWeekTemp; // already built above
    const weekKeys = weekKeysSorted;
    const weekRows = weekKeys.map(wk => {
      const w = byWeek[wk];
      // Week % = total present ÷ (students × school days this week × 2) × 100
      const possible = w.days * 2 * totalStudents;
      const pct = possible > 0 ? ((w.present / possible) * 100).toFixed(1) : "0";
      const pctClass = parseFloat(pct) >= 75 ? "badge-success" : parseFloat(pct) >= 50 ? "badge-warning" : "badge-danger";
      return `<tr>
        <td>${wk}</td><td>${w.days * 2}</td>
        <td>${w.boys}</td><td>${w.girls}</td><td>${w.present}</td>
        <td><span class="badge ${w.absent>0?"badge-danger":"badge-success"}">${w.absent}</span></td>
        <td><span class="badge ${pctClass}">${pct}%</span></td>
      </tr>`;
    });
    // Term total row in weekly table
    const termTotalRow = `<tr style="background:#e0e7ff;font-weight:900">
      <td>TERM TOTAL</td>
      <td>${schoolDays * 2}</td>
      <td>${boysPresent}</td><td>${girlsPresent}</td><td>${totalPresent}</td>
      <td><span class="badge badge-danger">${totalAbsent}</span></td>
      <td><span class="badge badge-success">${termRateCorrect}%</span></td>
    </tr>`;
    $("weeklyTableBody").innerHTML = weekRows.join("") + termTotalRow || `<tr><td colspan="7" style="text-align:center;padding:16px;color:var(--text-muted)">No data.</td></tr>`;

    // Top student by attendance
    const studentAttMap = {};
    recs.forEach(r => {
      if (!studentAttMap[r.regNumber]) studentAttMap[r.regNumber] = { name: r.fullName, present: 0 };
      if (r.status === "Present") studentAttMap[r.regNumber].present += r.total||2;
    });
    let topStudent = null, topScore = -1;
    Object.values(studentAttMap).forEach(v => { if (v.present > topScore) { topScore = v.present; topStudent = v; } });
    const topStudentHtml = topStudent
      ? `<div style="margin-top:12px;padding:12px 16px;background:var(--success-light);border-radius:8px;font-size:.85rem">
          <i class="bi bi-star-fill" style="color:#f59e0b"></i>
          <strong> Highest Attendance:</strong> ${topStudent.name}
          <span class="badge badge-success" style="margin-left:8px">${topScore} sessions</span>
          <span style="color:var(--text-muted);font-size:.78rem;margin-left:6px">
            (${(totalPossible>0?((topScore/totalPossible)*100).toFixed(1):"0")}%)
          </span>
        </div>`
      : "";
    const analyticsTopEl = $("analyticsTopStudent");
    if (analyticsTopEl) analyticsTopEl.innerHTML = topStudentHtml;

    // Daily detail
    $("dailyDetailBody").innerHTML = Object.keys(byDate).sort().reverse().map(d => {
      const info = byDate[d];
      const isH  = holidayDates.has(d);
      return `<tr>
        <td>${d}</td><td>${getDayName(d)}</td>
        <td>${isH?"H":info.boys}</td><td>${isH?"H":info.girls}</td>
        <td>${isH?"Holiday":`<span class="badge badge-success">${info.present}</span>`}</td>
        <td>${isH?"—":`<span class="badge badge-danger">${info.absent}</span>`}</td>
      </tr>`;
    }).join("") || `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted)">No records found.</td></tr>`;

    $("analyticsResult").style.display = "block";
    } // end else (individual class view)

  } catch(e) { toast(e.message, "error"); console.error(e); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-bar-chart-fill"></i> Generate Report'; }
});

// ══════════════════════════════════════════════════════════════
//  PER-STUDENT SUMMARY — Admin only
// ══════════════════════════════════════════════════════════════
let _perStudentData = { students:[], weekKeys:[], summaryMap:{}, possible:0, classBase:"", term:"" };

$("loadPerStudentBtn")?.addEventListener("click", async () => {
  const classBase = $("perStudentClass").value;
  const term      = $("perStudentTerm").value;
  if (!classBase) { toast("Select a class.", "error"); return; }
  const btn = $("loadPerStudentBtn"); btn.disabled = true; btn.textContent = "Loading...";
  try {
    const sessionData  = _sessionCache || await getSession();
    const session      = sessionData.session || "";
    const termStart    = sessionData.termStartDate || null;

    // ── Detect section for Att B/F — B/F only accumulates within same section ──
    function getClassSection(cb) {
      var c = (cb||"").toLowerCase();
      if (c.startsWith("creche"))  return "creche";
      if (c.startsWith("nursery")) return "nursery";
      if (c.startsWith("basic"))   return "basic";
      return "secondary"; // JS and SS share secondary
    }
    const currentSection = getClassSection(classBase);

    // ── Fetch current term data ──
    const [students, recs, holidays] = await Promise.all([
      getStudentsByClass(classBase),
      getAttendanceByClassBaseTerm(classBase, term, session),
      getHolidays(session, term)
    ]);

    // ── Fetch previous terms for Att B/F ──
    // Term 1 → no B/F
    // Term 2 → fetch Term 1
    // Term 3 → fetch Term 1 + Term 2
    var prevTermRecs = [];
    if (term === "2") {
      prevTermRecs = await getAttendanceByClassBaseTerm(classBase, "1", session);
    } else if (term === "3") {
      var [t1recs, t2recs] = await Promise.all([
        getAttendanceByClassBaseTerm(classBase, "1", session),
        getAttendanceByClassBaseTerm(classBase, "2", session)
      ]);
      prevTermRecs = t1recs.concat(t2recs);
    }

    // Build Att B/F per student — only sessions within same section
    // Section check: only accumulate if the attendance record's classBase matches same section
    var attBF = {}; // regNumber → total sessions from previous terms
    prevTermRecs.forEach(function(r) {
      if (r.status === "Holiday") return;
      if (getClassSection(r.classBase||"") !== currentSection) return; // different section — skip
      if (r.status !== "Present") return;
      if (!attBF[r.regNumber]) attBF[r.regNumber] = 0;
      attBF[r.regNumber] += r.total || 2;
    });

    const holidayDates = new Set(holidays.map(h => h.date));
    recs.filter(r => r.status === "Holiday").forEach(r => holidayDates.add(r.date));

    const nonHolRecs  = recs.filter(r => r.status !== "Holiday" && !holidayDates.has(r.date));
    const schoolDates = [...new Set(nonHolRecs.map(r => r.date))].filter(d => !isWeekend(d)).sort();
    const possible    = schoolDates.length * 2;

    // Build week labels in term order
    const weekSet = new Set();
    schoolDates.forEach(d => {
      let wkLabel;
      if (termStart) {
        const diff = Math.floor((new Date(d) - new Date(termStart)) / (7*24*60*60*1000));
        wkLabel = "Wk " + (diff + 1);
      } else {
        wkLabel = "Wk " + getWeekNumber(d);
      }
      weekSet.add(wkLabel);
    });
    const weekKeys = [...weekSet].sort((a,b) => parseInt(a.split(" ")[1]) - parseInt(b.split(" ")[1]));

    // Build per-student weekly summary — skip Holiday records
    const summaryMap = {};
    nonHolRecs.forEach(r => {
      if (!summaryMap[r.regNumber]) {
        summaryMap[r.regNumber] = { present:0, absent:0, weeks:{} };
        weekKeys.forEach(wk => { summaryMap[r.regNumber].weeks[wk] = 0; });
      }
      let wkLabel;
      if (termStart) {
        const diff = Math.floor((new Date(r.date) - new Date(termStart)) / (7*24*60*60*1000));
        wkLabel = "Wk " + (diff + 1);
      } else {
        wkLabel = "Wk " + getWeekNumber(r.date);
      }
      if (r.status === "Present") {
        summaryMap[r.regNumber].present += r.total || 2;
        if (summaryMap[r.regNumber].weeks[wkLabel] !== undefined) {
          summaryMap[r.regNumber].weeks[wkLabel] += r.total || 2;
        }
      } else {
        summaryMap[r.regNumber].absent++;
      }
    });

    // Cache for Excel export — include attBF
    _perStudentData = { students, weekKeys, summaryMap, possible, classBase, term, attBF, currentSection };

    // Build table header — add Att B/F column after Total
    const showBF = term !== "1"; // only show B/F column for Term 2 and 3
    const theadRow = `<tr>
      <th>Reg No.</th><th>Student Name</th><th>Gender</th>
      ${weekKeys.map(wk => `<th style="text-align:center">${wk}<br><small>/10</small></th>`).join("")}
      <th style="text-align:center">Total<br><small>/${possible}</small></th>
      ${showBF ? `<th style="text-align:center;background:#e0f2fe;color:#0369a1">Att B/F<br><small>cumulative</small></th>` : ""}
      <th style="text-align:center">Att %</th>
    </tr>`;
    $("perStudentThead").innerHTML = theadRow;

    const sorted = students.sort((a,b) => (a.regNumber||"").localeCompare(b.regNumber||"", undefined, {numeric:true}));

    // Pre-compute class totals for footer
    const classWkTotals = {};
    weekKeys.forEach(wk => { classWkTotals[wk] = 0; });
    let classOverallTotal = 0;
    sorted.forEach(s => {
      const info = summaryMap[s.regNumber] || { present:0, weeks:{} };
      const studentTermTotal = weekKeys.reduce((sum, wk) => sum + (info.weeks?.[wk]||0), 0);
      weekKeys.forEach(wk => { classWkTotals[wk] += info.weeks?.[wk]||0; });
      classOverallTotal += studentTermTotal;
    });
    const classPct = possible > 0 && sorted.length > 0
      ? ((classOverallTotal / (possible * sorted.length)) * 100).toFixed(1) : "0";

    $("perStudentTbody").innerHTML = sorted.map(s => {
      const info = summaryMap[s.regNumber] || { present:0, absent:0, weeks:{} };
      const studentTermTotal = weekKeys.reduce((sum, wk) => sum + (info.weeks?.[wk]||0), 0);
      const bf = attBF[s.regNumber] || 0;
      const cumulative = studentTermTotal + bf; // current term + all previous terms
      const pct = possible > 0 ? ((studentTermTotal / possible) * 100).toFixed(1) : "0";
      const cls = parseFloat(pct) >= 75 ? "badge-success" : parseFloat(pct) >= 50 ? "badge-warning" : "badge-danger";
      const wkCells = weekKeys.map(wk => `<td style="text-align:center">${info.weeks?.[wk]||0}</td>`).join("");
      return `<tr>
        <td><strong>${s.regNumber}</strong></td>
        <td style="font-weight:700">${s.fullName||"—"}</td>
        <td><span class="badge ${s.gender==="Female"?"badge-pink":"badge-blue"}" style="font-size:.7rem">${s.gender||"—"}</span></td>
        ${wkCells}
        <td style="text-align:center;font-weight:800">${studentTermTotal}</td>
        ${showBF ? `<td style="text-align:center;font-weight:800;background:#e0f2fe;color:#0369a1">${cumulative}</td>` : ""}
        <td style="text-align:center"><span class="badge ${cls}">${pct}%</span></td>
      </tr>`;
    }).join("") +
    `<tr style="background:#e0e7ff;font-weight:900;font-size:.82rem">
      <td colspan="3" style="text-align:left">CLASS TOTAL</td>
      ${weekKeys.map(wk => `<td style="text-align:center">${classWkTotals[wk]}</td>`).join("")}
      <td style="text-align:center">${classOverallTotal}</td>
      ${showBF ? `<td style="text-align:center;background:#e0f2fe">—</td>` : ""}
      <td style="text-align:center"><span class="badge badge-primary">${classPct}%</span></td>
    </tr>` ||
    `<tr><td colspan="${4+weekKeys.length+(showBF?1:0)}" style="text-align:center;padding:20px;color:var(--text-muted)">No students found.</td></tr>`;

    $("perStudentTitle").innerHTML = `<i class="bi bi-people-fill"></i> ${classBase} — ${TERM_LABELS[term]} Student Summary (${students.length} students)`;
    $("perStudentCard").style.display = "block";
  } catch(e) { toast(e.message, "error"); console.error(e); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Load'; }
});

// ── Export per-student to Excel ───────────────────────────────
$("exportPerStudentBtn")?.addEventListener("click", function() {
  if (!_perStudentData.students.length) { toast("Load data first.", "error"); return; }
  if (typeof XLSX === "undefined") { toast("Excel library not loaded.", "error"); return; }

  var d        = _perStudentData;
  var wsData   = [];
  var possible = d.possible;
  var showBF   = d.term !== "1";

  wsData.push([(_schoolName||"BrightSchool").toUpperCase()]);
  wsData.push(["ATTENDANCE SUMMARY — " + d.classBase + " — " + TERM_LABELS[d.term]]);
  wsData.push([""]);

  var hRow = ["Reg No.", "Student Name", "Gender"];
  d.weekKeys.forEach(function(wk) { hRow.push(wk + " (/10)"); });
  hRow.push("Total (/" + possible + ")");
  if (showBF) hRow.push("Att B/F (cumulative)");
  hRow.push("Att %");
  wsData.push(hRow);

  d.students.sort(function(a,b){ return (a.regNumber||"").localeCompare(b.regNumber||"",undefined,{numeric:true}); }).forEach(function(s) {
    var info = d.summaryMap[s.regNumber] || { present:0, weeks:{} };
    var studentTermTotal = d.weekKeys.reduce(function(sum,wk){ return sum+(info.weeks?.[wk]||0); }, 0);
    var bf   = (d.attBF && d.attBF[s.regNumber]) || 0;
    var cum  = studentTermTotal + bf;
    var pct  = possible > 0 ? parseFloat(((studentTermTotal/possible)*100).toFixed(1)) : 0;
    var row  = [s.regNumber, s.fullName||"—", s.gender||"—"];
    d.weekKeys.forEach(function(wk) { row.push(info.weeks?.[wk]||0); });
    row.push(studentTermTotal);
    if (showBF) row.push(cum);
    row.push(pct+"%");
    wsData.push(row);
  });

  wsData.push([""]);
  wsData.push(["Generated: " + new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"})]);
  wsData.push(["Developed by Brightest Digital Services"]);

  var wb  = XLSX.utils.book_new();
  var ws  = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = [{wch:12},{wch:28},{wch:10}];
  d.weekKeys.forEach(function() { ws["!cols"].push({wch:8}); });
  if (showBF) ws["!cols"].push({wch:10},{wch:18},{wch:8});
  else ws["!cols"].push({wch:10},{wch:8});

  var sheetName = d.classBase.replace(/[\/\\*?\[\]]/g,"").substring(0,31);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  var wbout = XLSX.write(wb, { bookType:"xlsx", type:"array" });
  var blob  = new Blob([wbout], { type:"application/octet-stream" });
  var url   = URL.createObjectURL(blob);
  var a     = document.createElement("a");
  a.href    = url;
  a.download = "Attendance_" + d.classBase + "_" + TERM_LABELS[d.term] + ".xlsx";
  document.body.appendChild(a); a.click();
  setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
  toast("Excel downloaded.", "success");
});

// ══════════════════════════════════════════════════════════════
//  DASHBOARD ANALYTICS — Role-based
// ══════════════════════════════════════════════════════════════
async function loadDashboardAnalytics() {
  try {
    const sessionData = _sessionCache || await getSession();
    const term        = sessionData.currentTerm || "1";
    const session     = sessionData.session || "";
    const today       = new Date().toISOString().split("T")[0];
    const holidays    = await getHolidays(session, term);
    const holidayDates = new Set(holidays.map(h => h.date));

    // ── ADMIN: School-wide stats ──────────────────────────────
    if (_isMaster) {
      const allStudents = await getAllStudents();
      const classGroups = {};
      allStudents.forEach(s => {
        if (!classGroups[s.classArm]) classGroups[s.classArm] = [];
        classGroups[s.classArm].push(s);
      });

      // 1st position per class
      const firstPosRows = [];
      await Promise.all(Object.keys(classGroups).map(async arm => {
        const scoresRaw = await getScoresByClassArmTerm(arm, term);
        const scores = scoresRaw.filter(sc => !sc.session || sc.session === session);
        const totals = {};
        scores.forEach(sc => { totals[sc.regNumber] = (totals[sc.regNumber]||0)+(sc.test1||0)+(sc.test2||0)+(sc.exam||0); });
        let best = null, bestScore = -1;
        classGroups[arm].forEach(s => { const t=totals[s.regNumber]||0; if(t>bestScore){bestScore=t;best=s;} });
        if (best && bestScore > 0) firstPosRows.push({ arm, name: best.fullName, score: bestScore });
      }));
      const fpEl = $("firstPositionList");
      if (fpEl) fpEl.innerHTML = firstPosRows.length
        ? firstPosRows.sort((a,b)=>a.arm.localeCompare(b.arm)).map(r =>
            `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 12px;border-bottom:1px solid var(--border)">
              <div><span class="badge badge-warning" style="margin-right:6px">${r.arm}</span><strong>${r.name}</strong></div>
              <span class="badge badge-primary">${r.score} pts</span>
            </div>`).join("")
        : `<div style="color:var(--text-muted);padding:8px">No score data yet.</div>`;

      // Highest attendance per class (excluding holidays)
      const allAttRecs = await getAllAttendanceByTerm(term, session);
      const attByClass = {};
      allAttRecs.filter(r => !holidayDates.has(r.date)).forEach(r => {
        if (!attByClass[r.classArm]) attByClass[r.classArm] = {};
        if (!attByClass[r.classArm][r.regNumber]) attByClass[r.classArm][r.regNumber] = { name:r.fullName, total:0 };
        if (r.status === "Present") attByClass[r.classArm][r.regNumber].total += r.total||2;
      });
      const highAttRows = [];
      Object.keys(attByClass).forEach(arm => {
        let best = null, bestAtt = -1;
        Object.values(attByClass[arm]).forEach(v => { if(v.total>bestAtt){bestAtt=v.total;best=v;} });
        if (best) highAttRows.push({ arm, name: best.name, total: bestAtt });
      });
      const haEl = $("highAttendanceList");
      if (haEl) haEl.innerHTML = highAttRows.length
        ? highAttRows.sort((a,b)=>a.arm.localeCompare(b.arm)).map(r =>
            `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 12px;border-bottom:1px solid var(--border)">
              <div><span class="badge badge-success" style="margin-right:6px">${r.arm}</span><strong>${r.name}</strong></div>
              <span class="badge badge-info">${r.total} sessions</span>
            </div>`).join("")
        : `<div style="color:var(--text-muted);padding:8px">No attendance data yet.</div>`;

      // Attendance stat cards (excluding holidays)
      allAttRecs.filter(r => r.status === "Holiday").forEach(r => holidayDates.add(r.date));
      const nonHolAtt = allAttRecs.filter(r => r.status !== "Holiday" && !holidayDates.has(r.date));

      const totalHolidayDates = holidayDates.size;

      // Today's attendance — AM + PM separately
      const todayRecs   = nonHolAtt.filter(r => r.date === today && r.status === "Present");
      const todayAM     = todayRecs.reduce((s, r) => s + (r.morning||0), 0);
      const todayPM     = todayRecs.reduce((s, r) => s + (r.afternoon||0), 0);
      const todayPres   = todayAM + todayPM;

      // Term total sessions present
      const termPres = nonHolAtt
        .filter(r => r.status === "Present")
        .reduce((s, r) => s + (r.total||2), 0);

      // School days open this term
      const schoolDaysOpen = [...new Set(nonHolAtt.map(r => r.date))].filter(d => !isWeekend(d)).length;

      // This week: Total sessions present ÷ (students × school days this week × 2) × 100
      const weekNum      = getWeekNumber(today);
      const weekRecs     = nonHolAtt.filter(r => r.week === String(weekNum) && r.session === session);
      const weekPres     = weekRecs.filter(r => r.status === "Present").reduce((s, r) => s + (r.total||2), 0);
      const weekDays     = [...new Set(weekRecs.map(r => r.date))].filter(d => !isWeekend(d)).length;
      const weekStudents = [...new Set(weekRecs.map(r => r.regNumber))].length;
      const weekPoss     = weekDays * 2 * (weekStudents || 1);
      const weekPct      = weekPoss > 0 ? ((weekPres / weekPoss) * 100).toFixed(1) : "0";

      const el = id => $(id);
      if (el("statAttToday")) {
        el("statAttToday").innerHTML = todayAM + "+" + todayPM +
          `<div style="font-size:.72rem;color:var(--text-muted);font-weight:600;margin-top:2px">Total: ${todayPres} sessions</div>`;
      }
      if (el("statAttWeek"))   el("statAttWeek").textContent   = weekPres;
      if (el("statHolidays"))  el("statHolidays").textContent  = totalHolidayDates;
      if (el("statAttTerm"))   el("statAttTerm").textContent   = termPres;
      if (el("statAttWeekPct"))el("statAttWeekPct").textContent= weekPct + "%";
      if (el("statSession"))   el("statSession").textContent   = session || "—";
      if (el("statTerm"))      el("statTerm").textContent      = TERM_LABELS[term] || "—";
      if (el("statClasses"))   el("statClasses").textContent   = new Set(allStudents.map(s=>s.classBase)).size;
    }

    // ── FORM TEACHER: Class-specific stats ───────────────────
    if (_isFT && !_isMaster) {
      const ftArms      = ALL_ARMS.filter(a => armToBase(a) === _ftClass);
      const [ftStudents, allFtAttRaw] = await Promise.all([
        getStudentsByClass(_ftClass),
        Promise.all(ftArms.map(arm => getAttendanceByClassTerm(arm, term, session))).then(r => r.flat())
      ]);
      const allFtScRaw = (await Promise.all(ftArms.map(arm => getScoresByClassArmTerm(arm, term)))).flat();
      const allFtSc = allFtScRaw.filter(sc => !sc.session || sc.session === session);

      // Exclude holiday records (same as admin formula)
      const ftHolidayDates = new Set(holidays.map(h => h.date));
      allFtAttRaw.filter(r => r.status === "Holiday").forEach(r => ftHolidayDates.add(r.date));
      const nonHolFtAtt = allFtAttRaw.filter(r => r.status !== "Holiday" && !ftHolidayDates.has(r.date));

      // Today: AM + PM sessions (same as admin)
      const todayFtRecs = nonHolFtAtt.filter(r => r.date === today && r.status === "Present");
      const todayFtAM   = todayFtRecs.reduce((s, r) => s + (r.morning||0), 0);
      const todayFtPM   = todayFtRecs.reduce((s, r) => s + (r.afternoon||0), 0);
      const todayFtPres = todayFtAM + todayFtPM;

      // This week: Total present sessions ÷ (students × school days this week × 2) × 100
      const weekNumFt    = getWeekNumber(today);
      const weekFtRecs   = nonHolFtAtt.filter(r => r.week === String(weekNumFt) && r.session === session);
      const weekFtPres   = weekFtRecs.filter(r => r.status === "Present").reduce((s, r) => s + (r.total||2), 0);
      const weekFtDays   = [...new Set(weekFtRecs.map(r => r.date))].filter(d => !isWeekend(d)).length;
      const weekFtPoss   = weekFtDays * 2 * ftStudents.length;
      const weekFtPct    = weekFtPoss > 0 ? ((weekFtPres / weekFtPoss) * 100).toFixed(1) : "0";

      // Term: total present sessions (r.total = AM + PM)
      const termFtPres   = nonHolFtAtt.filter(r => r.status === "Present").reduce((s, r) => s + (r.total||2), 0);

      // School days open (unique non-holiday, non-weekend dates)
      const schoolDaysFt = [...new Set(nonHolFtAtt.map(r => r.date))].filter(d => !isWeekend(d)).length;
      // Term % = total present ÷ (students × school days × 2) × 100
      const possibleFt   = schoolDaysFt * 2 * ftStudents.length;
      const termPctFt    = possibleFt > 0 ? ((termFtPres / possibleFt) * 100).toFixed(1) : "0";

      const fe = id => $(id);
      if (fe("ftStatSession"))  fe("ftStatSession").textContent  = session||"—";
      if (fe("ftStatTerm"))     fe("ftStatTerm").textContent     = TERM_LABELS[term]||"—";
      if (fe("ftStatAttToday")) {
        fe("ftStatAttToday").innerHTML = todayFtAM + "+" + todayFtPM +
          `<div style="font-size:.7rem;color:var(--text-muted);font-weight:600;margin-top:2px">Total: ${todayFtPres}</div>`;
      }
      if (fe("ftStatAttWeek"))  fe("ftStatAttWeek").textContent  = weekFtPres + " (" + weekFtPct + "%)";
      if (fe("ftStatAttTerm"))  fe("ftStatAttTerm").textContent  = termFtPres;
      if (fe("ftStatAttPct"))   fe("ftStatAttPct").textContent   = termPctFt + "%";

      // Top 6 students in class
      const totals = {};
      allFtSc.forEach(sc => { totals[sc.regNumber]=(totals[sc.regNumber]||0)+(sc.test1||0)+(sc.test2||0)+(sc.exam||0); });
      const ranked = ftStudents
        .map(s => ({ name: s.fullName, reg: s.regNumber, classArm: s.classArm, score: totals[s.regNumber]||0 }))
        .filter(s => s.score > 0)
        .sort((a,b) => b.score - a.score)
        .slice(0, 6);
      const ftFpEl = $("ftFirstPositionList");
      if (ftFpEl) {
        if (!ranked.length) {
          ftFpEl.innerHTML = `<div style="padding:12px;color:var(--text-muted)">No score data yet for ${_ftClass}.</div>`;
        } else {
          ftFpEl.innerHTML = ranked.map((s, i) => {
            const medal = i===0?"🥇":i===1?"🥈":i===2?"🥉":"";
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 16px;border-bottom:1px solid var(--border)">
              <div style="font-size:.83rem">${medal} <strong>${ordinal(i+1)}</strong> — ${s.name}
                <span style="color:var(--text-muted);font-size:.75rem;margin-left:4px">(${s.classArm})</span>
              </div>
              <span class="badge badge-primary">${s.score} pts</span>
            </div>`;
          }).join("");
        }
      }

      // Dual role: also load top 6 per subject they teach
      if (_isST) {
        const dualEl = $("dualStTopStudentsList");
        if (dualEl) {
          dualEl.innerHTML = "<div style='padding:12px;color:var(--text-muted)'>Loading...</div>";
          const dualArmMap = {};
          _stArms.forEach(function(arm) {
            var base = armToBase(arm);
            if (!dualArmMap[base]) dualArmMap[base] = [];
            dualArmMap[base].push(arm);
          });
          var dualHtml = "";
          for (var si = 0; si < _stSubjects.length; si++) {
            var subject = _stSubjects[si];
            var subScores = [], subStudents = [];
            var armKeys = Object.keys(dualArmMap);
            for (var ai = 0; ai < armKeys.length; ai++) {
              var arms = dualArmMap[armKeys[ai]];
              var scRaw = (await Promise.all(arms.map(function(arm){ return getScoresByClassArmSubjectTerm(arm, subject, term); }))).flat();
              var sc = scRaw.filter(function(s){ return !s.session || s.session === session; });
              var stu = (await Promise.all(arms.map(function(arm){ return getStudentsByClassArm(arm); }))).flat();
              sc.forEach(function(s){ subScores.push(s); });
              stu.forEach(function(s){ subStudents.push(s); });
            }
            var dualTotals = {};
            subScores.forEach(function(sc){ dualTotals[sc.regNumber] = (dualTotals[sc.regNumber]||0)+(sc.test1||0)+(sc.test2||0)+(sc.exam||0); });
            var dualRanked = subStudents
              .map(function(s){ return { name:s.fullName, reg:s.regNumber, classArm:s.classArm, score:dualTotals[s.regNumber]||0 }; })
              .filter(function(s){ return s.score > 0; })
              .sort(function(a,b){ return b.score - a.score; })
              .slice(0, 6);
            if (dualRanked.length) {
              dualHtml += "<div style='padding:10px 16px;border-bottom:1.5px solid var(--border)'>";
              dualHtml += "<div style='font-weight:800;font-size:.85rem;color:var(--primary);margin-bottom:8px'><i class='bi bi-book-fill'></i> " + subject + "</div>";
              dualRanked.forEach(function(s, i){
                var medal = i===0?"🥇":i===1?"🥈":i===2?"🥉":"";
                dualHtml += "<div style='display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border)'>";
                dualHtml += "<div style='font-size:.83rem'>" + medal + " <strong>" + ordinal(i+1) + "</strong> — " + s.name + " <span style='color:var(--text-muted);font-size:.75rem;margin-left:4px'>(" + s.classArm + ")</span></div>";
                dualHtml += "<span class='badge badge-primary'>" + s.score + " pts</span></div>";
              });
              dualHtml += "</div>";
            }
          }
          dualEl.innerHTML = dualHtml || "<div style='padding:12px;color:var(--text-muted)'>No score data yet.</div>";
        }
      }
    }

    // ── SUBJECT TEACHER: Top 6 students per subject across all classes ─
    if (_isST && !_isFT && !_isMaster) {
      const stEl = $("stTopStudentsList");
      if (!stEl) return;
      stEl.innerHTML = `<div style="padding:12px;color:var(--text-muted)">Loading top students...</div>`;

      // Group arms by class
      const classArmMap = {};
      _stArms.forEach(arm => {
        const base = armToBase(arm);
        if (!classArmMap[base]) classArmMap[base] = [];
        classArmMap[base].push(arm);
      });

      let html = "";
      for (const subject of _stSubjects) {
        // Collect all students across ALL classes for this subject
        const allScores   = [];
        const allStudents = [];
        for (const [classBase, arms] of Object.entries(classArmMap)) {
          const scRaw = (await Promise.all(arms.map(arm => getScoresByClassArmSubjectTerm(arm, subject, term)))).flat();
          const sc    = scRaw.filter(s => !s.session || s.session === session);
          const stu = (await Promise.all(arms.map(arm => getStudentsByClassArm(arm)))).flat();
          sc.forEach(s  => allScores.push(s));
          stu.forEach(s => allStudents.push(s));
        }
        const totals = {};
        allScores.forEach(sc => { totals[sc.regNumber] = (totals[sc.regNumber]||0)+(sc.test1||0)+(sc.test2||0)+(sc.exam||0); });
        const ranked = allStudents
          .map(s => ({ name:s.fullName, reg:s.regNumber, classArm:s.classArm, score:totals[s.regNumber]||0 }))
          .filter(s => s.score > 0)
          .sort((a,b) => b.score - a.score)
          .slice(0, 6);

        if (ranked.length) {
          html += `<div style="padding:10px 16px;border-bottom:1.5px solid var(--border)">
            <div style="font-weight:800;font-size:.85rem;color:var(--primary);margin-bottom:8px">
              <i class="bi bi-book-fill"></i> ${subject}
            </div>`;
          ranked.forEach((s, i) => {
            const medal = i===0?"🥇":i===1?"🥈":i===2?"🥉":"";
            html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border)">
              <div style="font-size:.83rem">${medal} <strong>${ordinal(i+1)}</strong> — ${s.name}
                <span style="color:var(--text-muted);font-size:.75rem;margin-left:4px">(${s.classArm})</span>
              </div>
              <span class="badge badge-primary">${s.score} pts</span>
            </div>`;
          });
          html += `</div>`;
        }
      }
      stEl.innerHTML = html || `<div style="padding:12px;color:var(--text-muted)">No score data available yet.</div>`;
    }

  } catch(e) { console.error("loadDashboardAnalytics:", e); }
}

// ══════════════════════════════════════════════════════════════
//  RECORD BANK — Admin only
// ══════════════════════════════════════════════════════════════
let _rbData = { students:[], weekKeys:[], summaryMap:{}, possible:0, classBase:"", term:"", session:"" };

$("loadRecordBankBtn")?.addEventListener("click", async () => {
  if (!_isMaster) { toast("Record Bank is admin only.", "error"); return; }
  const session   = $("rbSession").value;
  const term      = $("rbTerm").value;
  const classVal  = $("rbClass").value;
  if (!session)  { toast("Please select an academic session.", "error"); return; }
  if (!classVal) { toast("Select a class or section.", "error"); return; }

  // Resolve section values into class lists
  var isSectionRb = classVal === "__ALL__" || classVal === "__SECONDARY__" || classVal === "__BASIC_NURSERY_CRECHE__";
  var rbClasses = [];
  var rbLabel   = classVal;
  if (classVal === "__ALL__") {
    rbClasses = ALL_CLASSES.slice();
    rbLabel   = "Entire School";
  } else if (classVal === "__SECONDARY__") {
    rbClasses = SS_CLASSES.concat(JS_CLASSES);
    rbLabel   = "Secondary Section (SS + JS)";
  } else if (classVal === "__BASIC_NURSERY_CRECHE__") {
    rbClasses = BASIC_CLASSES.concat(NURSERY_CLASSES).concat(CRECHE_CLASSES);
    rbLabel   = "Basic, Nursery & Creche";
  } else {
    rbClasses = [classVal];
    rbLabel   = classVal;
  }

  const classBase = isSectionRb ? rbLabel : classVal;
  const btn = $("loadRecordBankBtn"); btn.disabled = true; btn.textContent = "Loading...";
  try {
    const [allStudentsRaw, allRecsRaw, holidays, sessionData] = await Promise.all([
      Promise.all(rbClasses.map(function(c){ return getStudentsByClass(c); })).then(function(r){ return r.flat(); }),
      Promise.all(rbClasses.map(function(c){ return getAttendanceByClassBaseTerm(c, term, session); })).then(function(r){ return r.flat(); }),
      getHolidays(session, term),
      getSession()
    ]);

    var students = allStudentsRaw;
    var recs     = allRecsRaw;

    const termStart     = sessionData.termStartDate || null;
    const holidayDates  = new Set(holidays.map(h => h.date));
    // Also treat attendance Holiday status dates as holidays
    recs.filter(r => r.status === "Holiday").forEach(r => holidayDates.add(r.date));

    const nonHolRecs  = recs.filter(r => r.status !== "Holiday" && !holidayDates.has(r.date));
    const schoolDates = [...new Set(nonHolRecs.map(r => r.date))].filter(d => !isWeekend(d)).sort();
    const schoolDays  = schoolDates.length;
    const possible    = schoolDays * 2;
    const boys        = students.filter(s => s.gender === "Male").length;
    const girls       = students.filter(s => s.gender === "Female").length;

    // Build week labels
    const weekSet = new Set();
    schoolDates.forEach(d => {
      let wkLabel;
      if (termStart) {
        const diff = Math.floor((new Date(d) - new Date(termStart)) / (7*24*60*60*1000));
        wkLabel = "Wk " + (diff + 1);
      } else {
        wkLabel = "Wk " + getWeekNumber(d);
      }
      weekSet.add(wkLabel);
    });
    const weekKeys = [...weekSet].sort((a,b) => parseInt(a.split(" ")[1]) - parseInt(b.split(" ")[1]));

    // Per-student weekly summary — skip Holiday records
    const summaryMap = {};
    nonHolRecs.forEach(r => {
      if (!summaryMap[r.regNumber]) {
        summaryMap[r.regNumber] = { present:0, absent:0, weeks:{} };
        weekKeys.forEach(wk => { summaryMap[r.regNumber].weeks[wk] = 0; });
      }
      let wkLabel;
      if (termStart) {
        const diff = Math.floor((new Date(r.date) - new Date(termStart)) / (7*24*60*60*1000));
        wkLabel = "Wk " + (diff + 1);
      } else {
        wkLabel = "Wk " + getWeekNumber(r.date);
      }
      if (r.status === "Present") {
        summaryMap[r.regNumber].present += r.total||2;
        if (summaryMap[r.regNumber].weeks[wkLabel] !== undefined)
          summaryMap[r.regNumber].weeks[wkLabel] += r.total||2;
      } else {
        summaryMap[r.regNumber].absent++;
      }
    });

    // Cache for Excel export
    _rbData = { students, weekKeys, summaryMap, possible, classBase, term, session };

    const totalPresent = Object.values(summaryMap).reduce((a,v) => a + v.present, 0);
    const boysPresent  = nonHolRecs.filter(r => r.status==="Present" && r.gender==="Male").length;
    const girlsPresent = nonHolRecs.filter(r => r.status==="Present" && r.gender==="Female").length;
    const termRate     = (possible * students.length) > 0
      ? ((totalPresent/(possible*students.length))*100).toFixed(1) : "0";

    // Stat cards
    $("rbAttCards").innerHTML = [
      { val: students.length, lbl:"Total Students",       color:"#4f46e5" },
      { val: schoolDays,      lbl:"School Days Open",     color:"#0891b2" },
      { val: totalPresent,    lbl:"Total Present (Term)", color:"#10b981" },
      { val: termRate+"%",    lbl:"Average Attendance",   color:"#7c3aed" },
      { val: boysPresent,     lbl:"Boys Attendance",      color:"#2563eb" },
      { val: girlsPresent,    lbl:"Girls Attendance",     color:"#db2777" },
    ].map(c => `<div class="stat-card">
      <div><div class="stat-val" style="color:${c.color}">${c.val}</div><div class="stat-lbl">${c.lbl}</div></div>
    </div>`).join("");

    // Weekly breakdown — use nonHolRecs (holidays already excluded)
    const byWeek = {};
    nonHolRecs.forEach(r => {
      if (isWeekend(r.date)) return;
      let wk;
      if (termStart) {
        const diff = Math.floor((new Date(r.date) - new Date(termStart)) / (7*24*60*60*1000));
        wk = "Week " + (diff + 1);
      } else {
        wk = "Week " + getWeekNumber(r.date);
      }
      if (!byWeek[wk]) byWeek[wk] = { days:new Set(), present:0, boys:0, girls:0 };
      byWeek[wk].days.add(r.date);
      if (r.status === "Present") {
        byWeek[wk].present++;
        if (r.gender === "Male") byWeek[wk].boys++; else byWeek[wk].girls++;
      }
    });
    $("rbWeeklyBody").innerHTML = Object.keys(byWeek)
      .sort((a,b) => parseInt(a.split(" ")[1]) - parseInt(b.split(" ")[1]))
      .map(wk => {
        const w = byWeek[wk];
        const d = w.days.size;
        const poss = d * 2 * students.length;
        const pct  = poss > 0 ? ((w.present/poss)*100).toFixed(1) : "0";
        return `<tr><td>${wk}</td><td>${d*2}</td><td>${w.present}</td><td>${w.boys}</td><td>${w.girls}</td><td><strong>${pct}%</strong></td></tr>`;
      }).join("") || `<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--text-muted)">No attendance data.</td></tr>`;

    // Individual student summary — with weekly columns + class totals row
    const sorted = students.sort((a,b) => (a.regNumber||"").localeCompare(b.regNumber||"", undefined, {numeric:true}));
    $("rbStudentThead").innerHTML = `<tr>
      <th>Reg No.</th><th>Student Name</th><th>Gender</th>
      ${weekKeys.map(wk => `<th style="text-align:center">${wk}<br><small>/10</small></th>`).join("")}
      <th style="text-align:center">Total<br><small>/${possible}</small></th>
      <th style="text-align:center">Att %</th>
    </tr>`;

    // Compute class week totals and overall total for footer
    const classTotals = {};
    weekKeys.forEach(wk => { classTotals[wk] = 0; });
    let classOverallTotal = 0;
    sorted.forEach(s => {
      const info = summaryMap[s.regNumber] || { present:0, weeks:{} };
      weekKeys.forEach(wk => { classTotals[wk] += info.weeks?.[wk]||0; });
      classOverallTotal += info.present;
    });
    const classOverallPct = (possible * sorted.length) > 0
      ? ((classOverallTotal/(possible*sorted.length))*100).toFixed(1) : "0";

    const studentRows = sorted.map(s => {
      const info = summaryMap[s.regNumber] || { present:0, absent:0, weeks:{} };
      const pct  = possible > 0 ? ((info.present/possible)*100).toFixed(1) : "0";
      const cls  = parseFloat(pct) >= 75 ? "badge-success" : parseFloat(pct) >= 50 ? "badge-warning" : "badge-danger";
      const wkCells = weekKeys.map(wk => `<td style="text-align:center">${info.weeks?.[wk]||0}</td>`).join("");
      return `<tr>
        <td><strong>${s.regNumber}</strong></td>
        <td style="font-weight:700">${s.fullName||"—"}</td>
        <td><span class="badge ${s.gender==="Female"?"badge-pink":"badge-blue"}" style="font-size:.7rem">${s.gender||"—"}</span></td>
        ${wkCells}
        <td style="text-align:center;font-weight:800">${info.present}</td>
        <td style="text-align:center"><span class="badge ${cls}">${pct}%</span></td>
      </tr>`;
    }).join("");

    const totalsRow = `<tr style="background:#e0e7ff;font-weight:900;font-size:.82rem">
      <td colspan="3" style="text-align:left">CLASS TOTAL</td>
      ${weekKeys.map(wk => `<td style="text-align:center">${classTotals[wk]}</td>`).join("")}
      <td style="text-align:center">${classOverallTotal}</td>
      <td style="text-align:center"><span class="badge badge-primary">${classOverallPct}%</span></td>
    </tr>`;

    $("rbStudentBody").innerHTML = studentRows
      ? studentRows + totalsRow
      : `<tr><td colspan="${4+weekKeys.length}" style="text-align:center;padding:16px;color:var(--text-muted)">No students found.</td></tr>`;

    // Broadsheet record — individual class only (not for section views)
    const rbBsCard = $("rbBroadsheetCard");
    if (isSectionRb) {
      if (rbBsCard) rbBsCard.style.display = "none";
    } else {
      if (rbBsCard) rbBsCard.style.display = "block";
      const allArms    = ALL_ARMS.filter(a => armToBase(a) === classVal);
      const scoresList = await Promise.all(allArms.map(arm => getScoresByClassArmTerm(arm, term, session)));
      const allScores  = scoresList.flat();
      const subjects   = await getClassSubjects(classVal, term, session);
      const scoreMap   = {};
      allScores.forEach(sc => {
        if (!scoreMap[sc.regNumber]) scoreMap[sc.regNumber] = {};
        scoreMap[sc.regNumber][sc.subject] = sc;
      });

    const bsRows = students.map(s => {
      const offAll  = !s.subjectsOffered || s.subjectsOffered === "all";
      const offered = subjects.filter(sub => offAll || (Array.isArray(s.subjectsOffered) && s.subjectsOffered.includes(sub)));
      let grand = 0;
      offered.forEach(sub => { const sc = scoreMap[s.regNumber]?.[sub]; if(sc) grand += (sc.test1||0)+(sc.test2||0)+(sc.exam||0); });
      return { ...s, offered, grand };
    }).sort((a,b) => (a.regNumber||"").localeCompare(b.regNumber||"", undefined, {numeric:true}));

    const posMap = {};
    [...bsRows].sort((a,b) => b.grand - a.grand).forEach((r,i) => { posMap[r.regNumber] = ordinal(i+1); });

    let bsThead = `<tr><th rowspan="2">S/N</th><th rowspan="2" style="text-align:left;min-width:140px">Student Name</th><th rowspan="2">Reg No.</th>`;
    subjects.forEach(s => { bsThead += `<th colspan="5" style="background:#4338ca">${s}</th>`; });
    bsThead += `<th rowspan="2">Grand Total</th><th rowspan="2">Average</th><th rowspan="2">Position</th></tr><tr>`;
    subjects.forEach(() => { bsThead += `<th class="sub-header">T1</th><th class="sub-header">T2</th><th class="sub-header">Ex</th><th class="sub-header">Total</th><th class="sub-header">Pos</th>`; });
    bsThead += "</tr>";

    let bsTbody = "";
    bsRows.forEach((r, idx) => {
      let cols = "";
      subjects.forEach(sub => {
        if (!r.offered.includes(sub)) { cols += `<td colspan="5" style="text-align:center;color:#94a3b8;font-size:.72rem">N/A</td>`; return; }
        const sc = scoreMap[r.regNumber]?.[sub];
        const t1 = sc?.test1||0, t2=sc?.test2||0, ex=sc?.exam||0, tot=t1+t2+ex;
        const g  = tot>0?grade(tot):"—";
        cols += `<td>${t1||"—"}</td><td>${t2||"—"}</td><td>${ex||"—"}</td>
                 <td class="${tot>0?gradeClass(g):""}" style="font-weight:800">${tot||"—"}</td>
                 <td class="pos-cell">${posMap[r.regNumber]||"—"}</td>`;
      });
      const avg = r.offered.length > 0 ? (r.grand/r.offered.length).toFixed(1) : "0";
      bsTbody += `<tr><td>${idx+1}</td><td class="student-info">${r.fullName||"—"}</td><td>${r.regNumber}</td>${cols}
        <td style="font-weight:800">${r.grand}</td><td style="font-weight:800">${avg}</td>
        <td class="pos-cell">${posMap[r.regNumber]||"—"}</td></tr>`;
    });
    $("rbBsThead").innerHTML = bsThead;
    $("rbBsTbody").innerHTML = bsTbody || `<tr><td colspan="${3+subjects.length*5+3}" style="text-align:center;padding:20px;color:var(--text-muted)">No score data found.</td></tr>`;
    } // end else (individual class broadsheet)

    $("recordBankResult").style.display = "block";
    toast("Records loaded — " + rbLabel + ".", "success");
  } catch(e) { toast(e.message, "error"); console.error(e); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-archive"></i> Load Records'; }
});

// ── Export Record Bank student summary to Excel ───────────────
$("exportRbStudentBtn")?.addEventListener("click", function() {
  if (!_rbData.students.length) { toast("Load records first.", "error"); return; }
  if (typeof XLSX === "undefined") { toast("Excel library not loaded.", "error"); return; }

  var d        = _rbData;
  var wsData   = [];
  var possible = d.possible;

  wsData.push([(_schoolName||"BrightSchool").toUpperCase()]);
  wsData.push(["ATTENDANCE RECORD — " + d.classBase + " — " + TERM_LABELS[d.term] + " — " + d.session]);
  wsData.push([""]);

  var hRow = ["Reg No.", "Student Name", "Gender"];
  d.weekKeys.forEach(function(wk) { hRow.push(wk + " (/10)"); });
  hRow.push("Total (/" + possible + ")", "Att %");
  wsData.push(hRow);

  d.students.sort(function(a,b){ return (a.regNumber||"").localeCompare(b.regNumber||"",undefined,{numeric:true}); }).forEach(function(s) {
    var info = d.summaryMap[s.regNumber] || { present:0, weeks:{} };
    var pct  = possible > 0 ? parseFloat(((info.present/possible)*100).toFixed(1)) : 0;
    var row  = [s.regNumber, s.fullName||"—", s.gender||"—"];
    d.weekKeys.forEach(function(wk) { row.push(info.weeks?.[wk]||0); });
    row.push(info.present, pct+"%");
    wsData.push(row);
  });

  wsData.push([""]);
  wsData.push(["Generated: " + new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"})]);
  wsData.push(["Developed by Brightest Digital Services"]);

  var wb = XLSX.utils.book_new();
  var ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = [{wch:12},{wch:28},{wch:10}];
  d.weekKeys.forEach(function() { ws["!cols"].push({wch:8}); });
  ws["!cols"].push({wch:10},{wch:8});

  var sheetName = d.classBase.replace(/[\/\\*?\[\]]/g,"").substring(0,31);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  var wbout  = XLSX.write(wb, { bookType:"xlsx", type:"array" });
  var blob   = new Blob([wbout], { type:"application/octet-stream" });
  var url    = URL.createObjectURL(blob);
  var a      = document.createElement("a");
  a.href     = url;
  a.download = "AttRecord_" + d.classBase + "_" + TERM_LABELS[d.term] + "_" + d.session + ".xlsx";
  document.body.appendChild(a); a.click();
  setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
  toast("Excel downloaded.", "success");
});

// Also call on section switch to attendance
document.querySelector('[data-section="section-attendance"]')?.addEventListener("click", () => {
  applyAttendanceTabs();
});

// ══════════════════════════════════════════════════════════════
//  TEACHER NAMES — Admin only
// ══════════════════════════════════════════════════════════════
async function loadTeacherNamesUI() {
  if (!_isMaster) return;
  const listEl = $("teacherNamesList");
  if (!listEl) return;

  try {
    const namesMap = await getTeacherNames();
    // Gather all teacher emails from FT + ST
    const allEmails = new Set([
      ...Object.keys(FORM_TEACHERS),
      ...Object.keys(SUBJECT_TEACHERS)
    ]);

    if (!allEmails.size) {
      listEl.innerHTML = `<p style="color:var(--text-muted);font-size:.85rem">No teachers assigned yet. Add teachers in the Form/Subject Teacher sections below first.</p>`;
      return;
    }

    listEl.innerHTML = [...allEmails].sort().map(email => {
      const role = FORM_TEACHERS[email]
        ? `Form Teacher · ${FORM_TEACHERS[email]}`
        : `Subject Teacher`;
      const savedName = namesMap[email] || "";
      return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
        <div style="min-width:200px;flex:1">
          <div style="font-weight:700;font-size:.83rem">${email}</div>
          <div style="font-size:.72rem;color:var(--text-muted)">${role}</div>
        </div>
        <input type="text" class="form-control teacher-name-input" data-email="${email}"
          value="${savedName}" placeholder="Enter display name…"
          style="max-width:240px;flex:1"/>
      </div>`;
    }).join("");
  } catch(e) { console.error(e); }
}

$("saveTeacherNamesBtn")?.addEventListener("click", async () => {
  const inputs  = document.querySelectorAll(".teacher-name-input");
  const namesMap = {};
  inputs.forEach(inp => {
    const email = inp.dataset.email;
    const name  = inp.value.trim();
    if (email && name) namesMap[email] = name;
  });
  const btn = $("saveTeacherNamesBtn"); btn.disabled = true; btn.textContent = "Saving...";
  try {
    await saveTeacherNames(namesMap);
    toast("Teacher names saved successfully.", "success");
  } catch(e) { toast(e.message, "error"); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save"></i> Save Names'; }
});

// Load teacher names UI when settings section is opened
async function loadPendingUsers() {
  if (!_isMaster) return;
  const listEl = $("pendingUsersList");
  if (!listEl) return;
  try {
    const pending = await getPendingUsers();
    if (!pending.length) {
      listEl.innerHTML = `<div style="padding:12px;color:var(--text-muted)"><i class="bi bi-check-circle-fill" style="color:var(--success)"></i> No pending users. All teachers have been assigned roles.</div>`;
      return;
    }
    listEl.innerHTML = pending.map(u => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-weight:700;font-size:.88rem">${u.name||"—"}</div>
          <div style="font-size:.78rem;color:var(--text-muted)">${u.email}</div>
          <div style="font-size:.72rem;color:var(--text-muted)">Signed up: ${u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-GB") : "—"}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn btn-success btn-sm" onclick="assignPendingUser('${u.email}','${u.uid}','FT')">
            <i class="bi bi-person-check-fill"></i> Assign as Form Teacher
          </button>
          <button class="btn btn-primary btn-sm" onclick="assignPendingUser('${u.email}','${u.uid}','ST')">
            <i class="bi bi-book-fill"></i> Assign as Subject Teacher
          </button>
        </div>
      </div>`).join("");
  } catch(e) { if (listEl) listEl.innerHTML = `<div style="padding:12px;color:var(--danger)">Error loading pending users.</div>`; }
}

window.assignPendingUser = function(email, uid, roleType) {
  // Pre-fill the email in the appropriate teacher assignment form
  if (roleType === "FT") {
    const ftEl = $("newFTEmail");
    if (ftEl) { ftEl.value = email; ftEl.focus(); }
    toast(`${email} pre-filled in Form Teacher assignment. Select their class and save.`, "info");
  } else {
    const stEl = $("newSTEmail");
    if (stEl) { stEl.value = email; stEl.focus(); }
    toast(`${email} pre-filled in Subject Teacher assignment. Select section, load subjects and save.`, "info");
  }
  // Mark as approved in Firestore
  approvePendingUser(uid).then(() => loadPendingUsers()).catch(console.error);
  // Scroll to teacher management within Teachers Role section
  showSection("section-teachers-role");
};

$("refreshPendingBtn")?.addEventListener("click", loadPendingUsers);

// ── Trigger on section-settings nav click (legacy) ────────────
document.querySelector('[data-section="section-settings"]')?.addEventListener("click", () => {
  // Settings section now only has Theme + Change Password — nothing to load
});

// ── Trigger on section-teachers-role nav click ────────────────
// Both teacher names and pending users live here now
document.querySelector('[data-section="section-teachers-role"]')?.addEventListener("click", () => {
  if (_isMaster) {
    loadPendingUsers();
    loadTeacherNamesUI();
  }
});

// Also trigger when the menu tile for teachers-role is clicked
// (menu tiles call showSection directly, not nav click events)
const _origShowSection = window.showSection;
window.showSection = function(id) {
  _origShowSection(id);
  if (id === "section-teachers-role" && _isMaster) {
    // Small delay to let the section become visible first
    setTimeout(() => {
      loadPendingUsers();
      loadTeacherNamesUI();
    }, 80);
  }
};

// ══════════════════════════════════════════════════════════════
//  RECORD BANK — Auto-populate session dropdown
// ══════════════════════════════════════════════════════════════
async function loadRbSessions() {
  const sel = $("rbSession");
  if (!sel) return;
  sel.innerHTML = `<option value="">Loading sessions...</option>`;
  try {
    // Fetch distinct sessions from attendance collection
    const snap = await firestoreGetDocs(firestoreCollection(db, "attendance"));
    const sessions = new Set();
    snap.docs.forEach(d => { if (d.data().session) sessions.add(d.data().session); });

    // Also check scores collection
    const snapSc = await firestoreGetDocs(firestoreCollection(db, "scores"));
    snapSc.docs.forEach(d => { if (d.data().session) sessions.add(d.data().session); });

    const sorted = [...sessions].sort().reverse(); // most recent first
    if (!sorted.length) {
      sel.innerHTML = `<option value="">No sessions found</option>`;
      return;
    }
    sel.innerHTML = `<option value="">Select session...</option>` +
      sorted.map(s => `<option value="${s}">${s}</option>`).join("");

    // Pre-select current session if available
    const sessionData = _sessionCache || await getSession();
    if (sessionData.session && sessions.has(sessionData.session)) {
      sel.value = sessionData.session;
    }
  } catch(e) {
    sel.innerHTML = `<option value="">Error loading sessions</option>`;
    console.error("loadRbSessions:", e);
  }
}

document.querySelector('[data-section="section-recordbank"]')?.addEventListener("click", () => {
  if (_isMaster) loadRbSessions();
});

// ══════════════════════════════════════════════════════════════
//  STUDENT PROMOTION — Admin only
// ══════════════════════════════════════════════════════════════
let _promStudents = [];

// Full promotion chain — maps each class to its next class
const PROMOTION_CHAIN = {
  "Creche":    "Nursery 1",
  "Nursery 1": "Nursery 2",
  "Nursery 2": "Nursery 3",
  "Nursery 3": "Basic 1",
  "Basic 1":   "Basic 2",
  "Basic 2":   "Basic 3",
  "Basic 3":   "Basic 4",
  "Basic 4":   "Basic 5",
  "Basic 5":   "JS 1",
  "JS 1":      "JS 2",
  "JS 2":      "JS 3",
  "JS 3":      "SS 1",
  "SS 1":      "SS 2",
  "SS 2":      "SS 3",
  "SS 3":      "GRADUATED"
};

// Auto-suggest next class when From class is selected
$("promFromClass")?.addEventListener("change", function() {
  var fromClass = this.value;
  if (!fromClass) return;
  var nextClass = PROMOTION_CHAIN[fromClass];
  if (!nextClass) return;
  if (nextClass === "GRADUATED") {
    // SS 3 selected — show graduation notice
    $("promToClass").value = "";
    $("promToClass").disabled = true;
    $("promToArm").disabled   = true;
    var noticeBox = $("promGradNotice");
    if (noticeBox) noticeBox.style.display = "block";
  } else {
    var noticeBox = $("promGradNotice");
    if (noticeBox) noticeBox.style.display = "none";
    $("promToClass").disabled = false;
    $("promToArm").disabled   = false;
    $("promToClass").value = nextClass;
  }
  updatePromSummary();
});

// Load students from selected class/arm
$("loadPromStudentsBtn")?.addEventListener("click", async () => {
  var cls  = $("promFromClass").value;
  var arm  = $("promFromArm").value;
  if (!cls) { toast("Select a class.", "error"); return; }
  var classArm = cls + arm;
  var isGraduation = PROMOTION_CHAIN[cls] === "GRADUATED";
  var btn = $("loadPromStudentsBtn"); btn.disabled = true; btn.textContent = "Loading…";
  try {
    _promStudents = (await getStudentsByClassArm(classArm))
      .sort(function(a,b){ return (a.regNumber||"").localeCompare(b.regNumber||"", undefined, {numeric:true}); });
    if (!_promStudents.length) { toast("No students found in " + classArm + ".", "warning"); return; }

    // Build table
    $("promStudentTbody").innerHTML = _promStudents.map(function(s) {
      return "<tr>" +
        "<td><input type='checkbox' class='prom-check' data-reg='" + s.regNumber + "' checked style='width:16px;height:16px'/></td>" +
        "<td><strong>" + (s.regNumber||"—") + "</strong></td>" +
        "<td>" + (s.fullName||"—") + "</td>" +
        "<td>" + (s.gender||"—") + "</td>" +
        "<td><span class='badge badge-primary'>" + classArm + "</span></td>" +
        "<td><span class='badge " + (isGraduation ? "badge-success" : "badge-info") + "'>" +
          (isGraduation ? "→ Graduated" : ("→ " + (PROMOTION_CHAIN[cls]||"?") + arm)) +
        "</span></td>" +
        "</tr>";
    }).join("");

    $("promStudentCount").textContent = _promStudents.length + " student(s)";
    updatePromSummary();
    $("promStudentsCard").style.display = "block";
    $("promResultBox").style.display = "none";
    toast(_promStudents.length + " student(s) loaded from " + classArm + ".", "success");
  } catch(e) { toast(e.message, "error"); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-people-fill"></i> Load Students'; }
});

// Update summary text
function updatePromSummary() {
  var checked = document.querySelectorAll(".prom-check:checked").length;
  var fromClass = $("promFromClass").value || "";
  var isGraduation = PROMOTION_CHAIN[fromClass] === "GRADUATED";
  var toLabel = isGraduation ? "Graduated (leave school)" :
    (($("promToClass").value||"") + ($("promToArm").value||"") || "selected class");
  $("promSummaryText").textContent = checked + " student(s) will be " +
    (isGraduation ? "graduated from " + fromClass : "promoted to " + toLabel);
}

// Check all / Deselect all
$("promCheckAll")?.addEventListener("change", function() {
  document.querySelectorAll(".prom-check").forEach(function(cb) { cb.checked = this.checked; }.bind(this));
  updatePromSummary();
});
$("promSelectAllBtn")?.addEventListener("click", function() {
  document.querySelectorAll(".prom-check").forEach(function(cb) { cb.checked = true; });
  $("promCheckAll").checked = true;
  updatePromSummary();
});
$("promDeselectAllBtn")?.addEventListener("click", function() {
  document.querySelectorAll(".prom-check").forEach(function(cb) { cb.checked = false; });
  $("promCheckAll").checked = false;
  updatePromSummary();
});

// Update summary when destination changes
$("promToClass")?.addEventListener("change", updatePromSummary);
$("promToArm")?.addEventListener("change", updatePromSummary);

// Listen to individual checkboxes
$("promStudentTbody")?.addEventListener("change", function(e) {
  if (e.target.classList.contains("prom-check")) updatePromSummary();
});

// PROMOTE BUTTON
$("promoteBtn")?.addEventListener("click", async () => {
  if (!_isMaster) { toast("Only Admin can promote students.", "error"); return; }

  var fromClass   = $("promFromClass").value;
  var toClass     = $("promToClass").value;
  var toArm       = $("promToArm").value;
  var isGraduation = PROMOTION_CHAIN[fromClass] === "GRADUATED";

  if (!isGraduation && !toClass) { toast("Select a destination class.", "error"); return; }

  var toClassArm  = isGraduation ? "GRADUATED" : toClass + toArm;
  var toClassBase = isGraduation ? "GRADUATED" : toClass;
  var fromClassArm = fromClass + ($("promFromArm").value||"");

  // Get selected students
  var selectedRegs = [];
  document.querySelectorAll(".prom-check:checked").forEach(function(cb) {
    selectedRegs.push(cb.dataset.reg);
  });
  if (!selectedRegs.length) { toast("No students selected.", "error"); return; }

  // Confirm
  var confirmMsg = isGraduation
    ? selectedRegs.length + " student(s) from " + fromClassArm + " will be marked as GRADUATED.\n\nThey will no longer appear in active class lists.\nAll their records (scores, attendance, results) are preserved forever.\n\nContinue?"
    : selectedRegs.length + " student(s) will be moved from " + fromClassArm + " to " + toClassArm + ".\n\nAll past records are preserved.\n\nContinue?";
  if (!confirm(confirmMsg)) return;

  var btn = $("promoteBtn"); btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;margin-right:8px"></span> ' +
    (isGraduation ? "Graduating…" : "Promoting…");

  try {
    var promoted = 0, graduated = 0, failed = 0, errors = [];

    await Promise.all(selectedRegs.map(async function(reg) {
      try {
        if (isGraduation) {
          // Graduate the student — preserves all data, marks as graduated
          await graduateStudent(reg, _currentSession);
          graduated++;
        } else {
          // Promote to next class
          await updateStudent(reg, {
            classBase: toClassBase,
            arm:       toArm,
            classArm:  toClassArm
          });
          promoted++;
        }
      } catch(e) {
        failed++;
        errors.push(reg + ": " + e.message);
      }
    }));

    // Show result
    var resultHtml = "<div class='card mb-3'><div class='card-body'>" +
      "<div style='font-weight:900;font-size:1rem;margin-bottom:10px'>" +
      "<i class='bi bi-check-circle-fill' style='color:var(--success)'></i> " +
      (isGraduation ? "Graduation Complete" : "Promotion Complete") +
      "</div>" +
      "<div style='display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:12px'>" +
      (promoted > 0 ? "<div style='text-align:center;padding:14px;background:#d1fae5;border-radius:8px'>" +
        "<div style='font-size:1.6rem;font-weight:900;color:#065f46'>" + promoted + "</div>" +
        "<div style='font-size:.75rem;font-weight:700;color:#065f46'>Promoted ✅</div></div>" : "") +
      (graduated > 0 ? "<div style='text-align:center;padding:14px;background:#ede9fe;border-radius:8px'>" +
        "<div style='font-size:1.6rem;font-weight:900;color:#5b21b6'>" + graduated + "</div>" +
        "<div style='font-size:.75rem;font-weight:700;color:#5b21b6'>Graduated 🎓</div></div>" : "") +
      (failed > 0 ? "<div style='text-align:center;padding:14px;background:#fee2e2;border-radius:8px'>" +
        "<div style='font-size:1.6rem;font-weight:900;color:#991b1b'>" + failed + "</div>" +
        "<div style='font-size:.75rem;font-weight:700;color:#991b1b'>Failed ❌</div></div>" : "") +
      "</div>" +
      "<div style='font-size:.85rem;color:var(--text-muted)'>" +
      (promoted > 0 ? "<strong>" + promoted + "</strong> student(s) moved from <strong>" + fromClassArm + "</strong> to <strong>" + toClassArm + "</strong>.<br>" : "") +
      (graduated > 0 ? "<strong>" + graduated + "</strong> student(s) graduated. All their records are preserved in the system.<br>" : "") +
      (failed > 0 ? "<span style='color:#dc2626'>Failed: " + errors.join(", ") + "</span>" : "") +
      "</div></div></div>";

    $("promResultBox").innerHTML = resultHtml;
    $("promResultBox").style.display = "block";
    await loadStudents();
    toast(
      isGraduation
        ? graduated + " student(s) graduated successfully. Records preserved."
        : promoted + " student(s) promoted to " + toClassArm + ".",
      "success"
    );

  } catch(e) { toast(e.message, "error"); console.error(e); }
  finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-arrow-up-circle-fill"></i> ' + (isGraduation ? "Graduate Students" : "Promote Students");
  }
});

// ══════════════════════════════════════════════════════════════
//  ALUMNI & INACTIVE STUDENTS — Admin only
// ══════════════════════════════════════════════════════════════
var _currentAlumniTab = "graduated";

window.loadAlumniTab = async function(tab) {
  _currentAlumniTab = tab;

  // Update tab button styles
  ["alumniTabGrad","alumniTabTransfer","alumniTabInactive"].forEach(function(id) { 
    var el = $(id); if(el) { el.className = "btn btn-outline btn-sm"; }
  });
  var activeId = tab === "graduated" ? "alumniTabGrad" : tab === "transferred" ? "alumniTabTransfer" : "alumniTabInactive";
  var activeEl = $(activeId); if(activeEl) activeEl.className = "btn btn-primary btn-sm";

  var tbody = $("alumniTable");
  tbody.innerHTML = "<tr><td colspan='7' style='text-align:center;padding:24px;color:var(--text-muted)'>Loading…</td></tr>";

  try {
    var students;
    if (tab === "graduated")   students = await getAlumniStudents();
    else if (tab === "transferred") {
      var all = await getAllStudents();
      students = all.filter(function(s){ return s.status === "transferred"; });
    } else {
      students = await getInactiveStudents();
    }

    $("alumniCount").textContent = students.length + " student(s)";

    if (!students.length) {
      tbody.innerHTML = "<tr><td colspan='7' style='text-align:center;padding:30px;color:var(--text-muted)'>No " + tab + " students found.</td></tr>";
      return;
    }

    tbody.innerHTML = students
      .sort(function(a,b){ return (a.fullName||"").localeCompare(b.fullName||""); })
      .map(function(s) {
        var sessionLabel = s.graduationSession || s.transferSession || "—";
        var statusTag = tab === "graduated"
          ? "<span class='badge' style='background:#7c3aed;color:#fff'>Graduated 🎓</span>"
          : tab === "transferred"
          ? "<span class='badge badge-warning'>Transferred</span>"
          : "<span class='badge badge-muted'>Removed</span>";
        var actions =
          // Restore button for inactive
          (tab === "inactive"
            ? "<button class='btn btn-outline btn-sm' onclick='restoreStudentAction(\"" + s.regNumber + "\")' style='font-size:.75rem'>" +
              "<i class='bi bi-arrow-counterclockwise'></i> Restore</button>"
            : "") +
          // View Results button for all
          " <button class='btn btn-outline btn-sm' onclick='viewAlumniResults(\"" + s.regNumber + "\")' style='font-size:.75rem'>" +
          "<i class='bi bi-card-list'></i> View Results</button>";

        return "<tr>" +
          "<td><strong>" + (s.regNumber||"—") + "</strong></td>" +
          "<td>" + (s.fullName||"—") + "</td>" +
          "<td>" + (s.classArm||s.classBase||"—") + "</td>" +
          "<td>" + (s.gender||"—") + "</td>" +
          "<td>" + statusTag + "</td>" +
          "<td>" + sessionLabel + "</td>" +
          "<td>" + actions + "</td>" +
          "</tr>";
      }).join("");

  } catch(e) { toast(e.message, "error"); console.error(e); }
};

// Restore a removed student back to active
window.restoreStudentAction = async function(reg) {
  if (!confirm("Restore " + reg + " as an active student?")) return;
  try {
    await restoreStudent(reg);
    toast(reg + " restored to active students.", "success");
    loadAlumniTab(_currentAlumniTab);
    await loadStudents();
  } catch(e) { toast(e.message, "error"); }
};

// View alumni results — navigate to Results tab with reg number pre-filled
window.viewAlumniResults = function(reg) {
  showSection("section-results");
  var regInput = $("resRegNo");
  if (regInput) { regInput.value = reg; }
  toast("Enter the session and term then click Load Result.", "info");
};

// Load graduated tab by default when Alumni section opens
document.querySelector('[data-section="section-alumni"]')?.addEventListener("click", function() {
  loadAlumniTab("graduated");
});

// ══════════════════════════════════════════════════════════════
//  RESULTS — Admin and Form Teachers only
// ══════════════════════════════════════════════════════════════

// Load sessions into resSession dropdown when Results section is opened
document.querySelector('[data-section="section-results"]')?.addEventListener("click", async () => {
  const sel = $("resSession");
  if (!sel || sel.options.length > 1) return; // already loaded
  sel.innerHTML = "<option value=''>Loading sessions...</option>";
  try {
    const snapAtt = await firestoreGetDocs(firestoreCollection(db, "attendance"));
    const snapSc  = await firestoreGetDocs(firestoreCollection(db, "scores"));
    const sessions = new Set();
    snapAtt.docs.forEach(function(d){ if(d.data().session) sessions.add(d.data().session); });
    snapSc.docs.forEach(function(d){ if(d.data().session) sessions.add(d.data().session); });
    const sorted = [...sessions].sort().reverse();
    if (!sorted.length) { sel.innerHTML = "<option value=''>No sessions found</option>"; return; }
    sel.innerHTML = "<option value=''>Select session...</option>" +
      sorted.map(function(s){ return "<option value='" + s + "'>" + s + "</option>"; }).join("");
    // Pre-select current session
    const sd = _sessionCache || await getSession();
    if (sd.session && sessions.has(sd.session)) sel.value = sd.session;
  } catch(e) { sel.innerHTML = "<option value=''>Error loading sessions</option>"; }
});

// Grade helper
function resGrade(total) {
  if (total >= 80) return { g:"A", color:"#16a34a" };
  if (total >= 60) return { g:"B", color:"#2563eb" };
  if (total >= 50) return { g:"C", color:"#d97706" };
  if (total >= 40) return { g:"D", color:"#ea580c" };
  return { g:"F", color:"#dc2626" };
}

$("loadResultBtn")?.addEventListener("click", async () => {
  const reg     = ($("resRegNo").value||"").trim().toUpperCase();
  const session = $("resSession").value;
  const term    = $("resTerm").value;

  if (!reg)     { toast("Enter a registration number.", "error"); return; }
  if (!session) { toast("Select an academic session.", "error"); return; }

  const btn = $("loadResultBtn"); btn.disabled = true;
  btn.innerHTML = "<span class='spinner' style='width:16px;height:16px;border-width:2px;display:inline-block;margin-right:6px'></span> Loading...";

  try {
    // Fetch student, scores and remark
    const student = await getStudentByReg(reg);
    if (!student) { toast("Student not found. Check the registration number.", "error"); return; }

    const [scores, remark] = await Promise.all([
      getScoresByStudentTerm(reg, term, session),
      getRemarkByStudentTerm(reg, term, session)
    ]);

    // Filter scores by session — include old untagged + matching session
    const sessionScores = scores.filter(function(s){ return !s.session || s.session === session; });

    // Get classArm from scores (correct class when scores were entered)
    // Falls back to current student classArm if no scores found yet
    const scoreClassArm = sessionScores.length > 0 ? (sessionScores[0].classArm || student.classArm) : student.classArm;
    const scoreClassBase = sessionScores.length > 0 ? (sessionScores[0].classBase || armToBase(student.classArm||"")) : armToBase(student.classArm||"");

    // Student Info — class shown is from SCORES (correct historical class)
    $("resStudentInfo").innerHTML = [
      { lbl:"Full Name",   val: student.fullName||"—" },
      { lbl:"Reg Number",  val: student.regNumber||"—" },
      { lbl:"Class",       val: scoreClassArm + (scoreClassArm !== student.classArm ? " (now " + student.classArm + ")" : "") },
      { lbl:"Gender",      val: student.gender||"—" },
      { lbl:"Session",     val: session },
      { lbl:"Term",        val: TERM_LABELS[term]||"—" }
    ].map(function(c){
      return "<div style='background:#f8fafc;border-radius:8px;padding:12px 14px;border:1px solid var(--border)'>" +
        "<div style='font-size:.65rem;text-transform:uppercase;letter-spacing:.6px;color:var(--text-muted);font-weight:800'>" + c.lbl + "</div>" +
        "<div style='font-weight:800;font-size:.95rem;margin-top:4px;color:var(--text)'>" + c.val + "</div>" +
        "</div>";
    }).join("");

    // Load subjects using class from SCORES — correct historical class
    const classSubjectsList = await getClassSubjects(scoreClassBase, term, session);

    // Map uploaded scores by subject FIRST — needed for merge below
    const subjectMap = {};
    sessionScores.forEach(function(sc){ subjectMap[sc.subject] = sc; });

    // Determine which subjects this student offers from classSubjects list
    var offeredSubjects;
    if (!student.subjectsOffered || student.subjectsOffered === "all") {
      offeredSubjects = classSubjectsList.slice();
    } else if (Array.isArray(student.subjectsOffered)) {
      offeredSubjects = classSubjectsList.filter(function(s){
        return student.subjectsOffered.includes(s);
      });
    } else {
      offeredSubjects = classSubjectsList.slice();
    }

    // CRITICAL FIX: Always merge with subjects found in uploaded scores
    // This handles cases where a subject has a score but is missing from classSubjects doc
    // (e.g. subject added to score entry directly, or classSubjects doc is incomplete)
    Object.keys(subjectMap).forEach(function(sub) {
      if (!offeredSubjects.includes(sub)) {
        offeredSubjects.push(sub);
      }
    });

    // Sort alphabetically
    offeredSubjects.sort();

    if (!offeredSubjects.length) {
      $("resScoreTbody").innerHTML = "<tr><td colspan='6' style='text-align:center;padding:24px;color:var(--text-muted)'>No subjects found for this student.</td></tr>";
      $("resSummaryCards").innerHTML = "";
      $("resRemarkBox").innerHTML = "";
      $("resultDisplay").style.display = "block";
      return;
    }

    // Build scores table — show _ for subjects without scores yet
    var grandTotal = 0;
    var scoredCount = 0;
    var totalObtainable = offeredSubjects.length * 100;
    $("resScoreTbody").innerHTML = offeredSubjects.map(function(sub){
      const sc = subjectMap[sub];
      if (!sc) {
        // No scores uploaded yet — show dashes
        return "<tr>" +
          "<td style='font-weight:700'>" + sub + "</td>" +
          "<td style='text-align:center;color:var(--text-muted)'>_</td>" +
          "<td style='text-align:center;color:var(--text-muted)'>_</td>" +
          "<td style='text-align:center;color:var(--text-muted)'>_</td>" +
          "<td style='text-align:center;color:var(--text-muted)'>_</td>" +
          "<td style='text-align:center;color:var(--text-muted)'>_</td>" +
          "</tr>";
      }
      const t1    = sc.test1||0, t2 = sc.test2||0, ex = sc.exam||0;
      const total = t1 + t2 + ex;
      const gr    = resGrade(total);
      grandTotal += total;
      scoredCount++;
      return "<tr>" +
        "<td style='font-weight:700'>" + sub + "</td>" +
        "<td style='text-align:center'>" + t1 + "</td>" +
        "<td style='text-align:center'>" + t2 + "</td>" +
        "<td style='text-align:center'>" + ex + "</td>" +
        "<td style='text-align:center;font-weight:900'>" + total + "</td>" +
        "<td style='text-align:center;font-weight:900;color:" + gr.color + "'>" + gr.g + "</td>" +
        "</tr>";
    }).join("");

    // Calculate position in class arm
    const armStudents = await getStudentsByClassArm(student.classArm);
    const allTotals   = await Promise.all(armStudents.map(async function(s){
      const sc  = await getScoresByStudentTerm(s.regNumber, term, session);
      const tot = sc.reduce(function(sum,r){ return sum+(r.test1||0)+(r.test2||0)+(r.exam||0); }, 0);
      return { reg: s.regNumber, total: tot };
    }));
    const sorted  = allTotals.sort(function(a,b){ return b.total - a.total; });
    const posIdx  = sorted.findIndex(function(s){ return s.reg === reg; });
    const posStr  = posIdx >= 0 ? ordinal(posIdx + 1) : "—";
    // Average = total scores ÷ number of subjects offered (not percentage)
    const avg = offeredSubjects.length > 0 ? (grandTotal / offeredSubjects.length).toFixed(1) : "0";

    // Summary cards
    $("resSummaryCards").innerHTML = [
      { lbl:"Overall Total",      val: grandTotal + " / " + totalObtainable, color:"#4f46e5" },
      { lbl:"Average Score",      val: avg,                                  color:"#059669" },
      { lbl:"Position in Class",  val: posStr,                               color:"#d97706" },
      { lbl:"Subjects Offered",   val: offeredSubjects.length + " (" + scoredCount + " scored)", color:"#0891b2" }
    ].map(function(c){
      return "<div style='text-align:center;padding:16px;background:" + c.color + "18;border-radius:10px;border:1.5px solid " + c.color + "44'>" +
        "<div style='font-size:.62rem;text-transform:uppercase;font-weight:800;color:" + c.color + ";letter-spacing:.5px'>" + c.lbl + "</div>" +
        "<div style='font-size:1.4rem;font-weight:900;color:" + c.color + ";margin-top:6px'>" + c.val + "</div>" +
        "</div>";
    }).join("");

    // Remark
    const remarkText = remark && remark.remark ? remark.remark : "No remark entered yet.";
    $("resRemarkBox").innerHTML =
      "<span style='font-size:.72rem;text-transform:uppercase;font-weight:800;color:var(--text-muted);letter-spacing:.5px'>Form Teacher's Remark</span>" +
      "<div style='font-style:italic;color:var(--text);margin-top:6px;font-size:.9rem'>" + remarkText + "</div>";

    $("resultDisplay").style.display = "block";
    toast("Result loaded for " + student.fullName + ".", "success");

  } catch(e) { toast(e.message, "error"); console.error(e); }
  finally {
    btn.disabled = false;
    btn.innerHTML = "<i class='bi bi-search'></i> Load Result";
  }
});

// ══════════════════════════════════════════════════════════════
//  MENU — Add Student shortcut
// ══════════════════════════════════════════════════════════════
window.openAddStudentFromMenu = function() {
  showSection("section-students");
  // Small delay so section is visible before modal opens
  setTimeout(() => { $("addStudentBtn")?.click(); }, 120);
};

// ══════════════════════════════════════════════════════════════
//  PRINT RESULTS SECTION
// ══════════════════════════════════════════════════════════════
async function initPrintResultsSection() {
  // Always fetch fresh session from Firestore (or cache) so term reflects
  // whatever Admin has currently set — not stale values
  const s = _sessionCache || await getSession().catch(() => null);
  const currentTerm    = s?.currentTerm    || "1";
  const currentSession = s?.session        || _currentSession || "";

  // ── Session badge ──────────────────────────────────────────
  const sessionDisplay = $("prSessionText");
  if (sessionDisplay) {
    sessionDisplay.textContent = currentSession || "Not set";
  }

  // ── Individual result checker term ─────────────────────────
  // Automatically selects the current Admin term from Firestore
  const prTermEl = $("prTermInput");
  if (prTermEl) prTermEl.value = currentTerm;

  // ── Class print term ────────────────────────────────────────
  // Also auto-selects the Admin current term from Firestore
  const prClassTermEl = $("prClassTerm");
  if (prClassTermEl) prClassTermEl.value = currentTerm;

  // ── Populate class arm selector ────────────────────────────
  const armEl = $("prClassArm");
  if (armEl && armEl.options.length <= 1) {
    const arms = _isMaster ? ALL_ARMS
               : _isFT    ? ALL_ARMS.filter(a => armToBase(a) === _ftClass)
               : [];
    armEl.innerHTML = arms.map(a => `<option value="${a}">${a}</option>`).join("");
  }
}

// Individual result check & open in new tab
$("prCheckBtn")?.addEventListener("click", async () => {
  const reg     = ($("prRegInput")?.value || "").trim().toUpperCase();
  const term    = $("prTermInput")?.value;
  const session = _sessionCache?.session || _currentSession || "";
  const errBox  = $("prError");
  const errMsg  = $("prErrorMsg");

  const showErr = msg => {
    errMsg.textContent = msg;
    errBox.classList.remove("hidden");
    setTimeout(() => errBox.classList.add("hidden"), 5000);
  };

  errBox?.classList.add("hidden");

  if (!reg)  { showErr("Please enter a registration number."); return; }
  if (!term) { showErr("Please select a term."); return; }
  if (!session) { showErr("Session not loaded yet. Please wait."); return; }

  const btn = $("prCheckBtn"); btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block"></span> Checking…';

  try {
    const student = await getStudentByReg(reg);
    if (!student) { showErr("Registration number not found. Please check and try again."); return; }

    // FT can only print their own class
    if (_isFT && !_isMaster) {
      const studentBase = armToBase(student.classArm || "");
      if (studentBase !== _ftClass) {
        showErr("You can only view results for students in your class (" + _ftClass + ").");
        return;
      }
    }

    // Open result card in new tab
    const url = "./student.html?reg=" + encodeURIComponent(reg)
      + "&term=" + term
      + "&session=" + encodeURIComponent(session);
    window.open(url, "_blank");
    toast("Result card opened in new tab for " + (student.fullName || reg) + ".", "success");

  } catch(e) { showErr("Could not connect. Please try again."); console.error(e); }
  finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-search"></i> Check &amp; Open Result';
  }
});

// Load all students in class for class-wide print
$("prLoadClassBtn")?.addEventListener("click", async () => {
  const classArm = $("prClassArm")?.value;
  const term     = $("prClassTerm")?.value;
  const session  = _sessionCache?.session || _currentSession || "";
  if (!classArm || !term) { toast("Select class arm and term.", "error"); return; }

  const btn = $("prLoadClassBtn"); btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block"></span> Loading…';

  try {
    const students = await getStudentsByClassArm(classArm);
    const sorted   = students.sort((a,b) => (a.regNumber||"").localeCompare(b.regNumber||"", undefined, {numeric:true}));

    const container = $("prClassStudentList");
    if (!sorted.length) {
      container.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem">No students found in this class arm.</p>';
      return;
    }

    container.innerHTML = sorted.map(s =>
      `<button class="btn btn-outline btn-sm" style="font-size:.78rem" onclick="window.open('./student.html?reg=${encodeURIComponent(s.regNumber)}&term=${term}&session=${encodeURIComponent(session)}','_blank')">
        <i class="bi bi-printer"></i> ${s.fullName || s.regNumber}
      </button>`
    ).join("");

    toast(sorted.length + " students loaded. Click any name to open their result card.", "success");
  } catch(e) { toast(e.message, "error"); console.error(e); }
  finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Load Students';
  }
});

// ══════════════════════════════════════════════════════════════
//  SIDEBAR THEME — localStorage persisted per user
// ══════════════════════════════════════════════════════════════
const THEME_CONFIGS = {
  white:  { bg:"#ffffff", text:"#1e293b", active:"#4f46e5", activeTxt:"#4f46e5", activeBg:"#ede9fe", border:"#e2e8f0", hover:"#ede9fe", brand:"#1e293b", sub:"#64748b" },
  blue:   { bg:"#1E40AF", text:"#bfdbfe", active:"#ffffff", activeTxt:"#1E40AF", activeBg:"rgba(255,255,255,0.18)", border:"rgba(255,255,255,0.15)", hover:"rgba(255,255,255,0.12)", brand:"#ffffff", sub:"#bfdbfe" },
  navy:   { bg:"#0f172a", text:"#94a3b8", active:"#ffffff", activeTxt:"#0f172a", activeBg:"rgba(255,255,255,0.12)", border:"rgba(255,255,255,0.08)", hover:"rgba(255,255,255,0.08)", brand:"#ffffff", sub:"#64748b" },
  dark:   { bg:"#1e293b", text:"#94a3b8", active:"#ffffff", activeTxt:"#1e293b", activeBg:"rgba(255,255,255,0.12)", border:"rgba(255,255,255,0.08)", hover:"rgba(255,255,255,0.08)", brand:"#ffffff", sub:"#64748b" },
  purple: { bg:"#7c3aed", text:"#e9d5ff", active:"#ffffff", activeTxt:"#7c3aed", activeBg:"rgba(255,255,255,0.18)", border:"rgba(255,255,255,0.15)", hover:"rgba(255,255,255,0.12)", brand:"#ffffff", sub:"#e9d5ff" },
  orange: { bg:"#ea580c", text:"#fed7aa", active:"#ffffff", activeTxt:"#ea580c", activeBg:"rgba(255,255,255,0.18)", border:"rgba(255,255,255,0.15)", hover:"rgba(255,255,255,0.12)", brand:"#ffffff", sub:"#fed7aa" },
};

window.applySidebarTheme = function(theme) {
  const cfg = THEME_CONFIGS[theme];
  if (!cfg) return;
  const sidebar  = $("sidebar");
  const style    = sidebar?.style;
  if (!style) return;

  // Apply CSS variables scoped to sidebar via inline style
  sidebar.setAttribute("data-theme", theme);

  // Inject dynamic style block
  let styleEl = document.getElementById("sidebarThemeStyle");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "sidebarThemeStyle";
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = `
    .sidebar {
      background: ${cfg.bg} !important;
      border-right-color: ${cfg.border} !important;
    }
    .sidebar .sidebar-brand {
      border-bottom-color: ${cfg.border} !important;
    }
    .sidebar .brand-text, .sidebar .brand-text div {
      color: ${cfg.brand} !important;
    }
    .sidebar .brand-sub {
      color: ${cfg.sub} !important;
    }
    .sidebar .nav-item {
      color: ${cfg.text} !important;
    }
    .sidebar .nav-item:hover {
      background: ${cfg.hover} !important;
      color: ${cfg.active} !important;
    }
    .sidebar .nav-item.active {
      background: ${cfg.activeBg} !important;
      color: ${cfg.active} !important;
    }
    .sidebar .sidebar-footer {
      border-top-color: ${cfg.border} !important;
    }
    .sidebar .btn-logout {
      background: rgba(255,255,255,0.1) !important;
      color: ${cfg.text} !important;
    }
    .sidebar .btn-logout:hover {
      background: rgba(239,68,68,0.85) !important;
      color: #fff !important;
    }
    .theme-btn[data-theme="${theme}"] {
      outline: 3px solid #4f46e5;
      outline-offset: 2px;
    }
  `;

  // Remove active outline from all other theme buttons
  document.querySelectorAll(".theme-btn").forEach(b => {
    b.style.outline = b.dataset.theme === theme ? "3px solid #4f46e5" : "";
  });

  // Save per-user to localStorage
  const userKey = "sidebarTheme_" + (_user?.uid || "guest");
  localStorage.setItem(userKey, theme);
  toast("Theme changed to " + theme.charAt(0).toUpperCase() + theme.slice(1) + ".", "success");
};

// Restore sidebar theme from localStorage on login
function restoreSidebarTheme() {
  const userKey = "sidebarTheme_" + (_user?.uid || "guest");
  const saved   = localStorage.getItem(userKey);
  if (saved && THEME_CONFIGS[saved]) applySidebarTheme(saved);
}

// ══════════════════════════════════════════════════════════════
//  CHANGE PASSWORD
// ══════════════════════════════════════════════════════════════
$("changePasswordBtn")?.addEventListener("click", async () => {
  const current  = $("currentPasswordInput")?.value || "";
  const newPw    = $("newPasswordInput")?.value || "";
  const confirm  = $("confirmPasswordInput")?.value || "";

  if (!current)         { toast("Please enter your current password.", "error"); return; }
  if (!newPw)           { toast("Please enter a new password.", "error"); return; }
  if (newPw.length < 6) { toast("New password must be at least 6 characters.", "error"); return; }
  if (newPw !== confirm) { toast("New passwords do not match.", "error"); return; }
  if (current === newPw) { toast("New password must be different from current password.", "error"); return; }

  const btn = $("changePasswordBtn"); btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block"></span> Updating…';

  try {
    await changeUserPassword(current, newPw);
    // Clear fields on success
    $("currentPasswordInput").value = "";
    $("newPasswordInput").value     = "";
    $("confirmPasswordInput").value = "";
    toast("Password updated successfully. You are still logged in.", "success");
  } catch(e) {
    if (e.code === "auth/wrong-password" || e.code === "auth/invalid-credential") {
      toast("Current password is incorrect. Please try again.", "error");
    } else if (e.code === "auth/too-many-requests") {
      toast("Too many failed attempts. Please wait a few minutes and try again.", "error");
    } else {
      toast("Could not update password: " + e.message, "error");
    }
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-lock-fill"></i> Update Password';
  }
});

// Toggle password visibility helper (used in settings)
window.togglePwVis = function(inputId, btn) {
  const input = $(inputId);
  if (!input) return;
  const isText = input.type === "text";
  input.type = isText ? "password" : "text";
  btn.innerHTML = isText ? '<i class="bi bi-eye"></i>' : '<i class="bi bi-eye-slash"></i>';
};
