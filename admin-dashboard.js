// ============================================================
//  admin-dashboard.js — BrightSchool Result Broadsheet v3
//  All 10 issues resolved
// ============================================================
import {
  onAuthChange, authLogout,
  addStudent, updateStudent, deleteStudent, changeStudentReg,
  getAllStudents, getStudentsByClassArm,
  saveScore, getScoresByClassArmSubjectTerm, getScoresByClassArmTerm,
  saveClassSubjects, getClassSubjects, getSubjectsBySection,
  saveRemark, getRemarksByClassArmTerm,
  saveSession, getSession, saveTeachers, getTeachers,
  approveResults, revokeApproval, getAllApprovals,
  resetTermData, fixAllStudentClassArms
} from "./firebase.js";

// ══════════════════════════════════════════════════════════════
//  RBAC CONFIGURATION
//  Update all emails to match real teacher Firebase accounts.
//
//  FIX #5: Dual-role teacher (Form Teacher + Subject Teacher)
//  → Add their email in BOTH FORM_TEACHERS and SUBJECT_TEACHERS
//  → Dashboard will show them BOTH sections simultaneously
// ══════════════════════════════════════════════════════════════

// Add as many master admin emails as needed
const MASTER_ADMINS = [
  "infinitetechnology04@gmail.com".toLowerCase(),
  "macpeppleibim@gmail.com".toLowerCase(),
  // "secondadmin@gmail.com".toLowerCase(),
];

// Teacher roles — loaded from Firestore at runtime by master admin
// These start empty and get populated by loadTeachers() on init
let FORM_TEACHERS    = {};
let SUBJECT_TEACHERS = {};

// ── Constants ─────────────────────────────────────────────────
const ALL_ARMS    = ["JS 1A","JS 1B","JS 2A","JS 2B","JS 3A","JS 3B",
                     "SS 1A","SS 1B","SS 2A","SS 2B","SS 3A","SS 3B"];
const ALL_CLASSES = ["JS 1","JS 2","JS 3","SS 1","SS 2","SS 3"];
const TERM_LABELS = { "1":"1st Term","2":"2nd Term","3":"3rd Term" };
// FIX: "JS 1A" → "JS 1",  "SS 3B" → "SS 3"
const armToBase = arm => arm ? arm.trim().slice(0, -1).trim() : "";

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
  console.log("ST email match:", stKeys.map(k => `'${k}'==='${e}'? ${k===e}`));

  if (MASTER_ADMINS.includes(e)) { _isMaster = true; console.log("Role: MASTER"); return; }
  if (FORM_TEACHERS[e])   { _isFT = true; _ftClass = FORM_TEACHERS[e]; console.log("Role: FT →", _ftClass); }
  if (SUBJECT_TEACHERS[e]) {
    _isST       = true;
    const cfg   = SUBJECT_TEACHERS[e];
    _stSubjects = cfg.subjects  || [];
    _stArms     = cfg.classArms || [];
    console.log("Role: ST — subjects:", _stSubjects, "arms:", _stArms);
  }
  if (!_isMaster && !_isFT && !_isST) {
    console.error("NOT AUTHORIZED — no role found for:", e);
    toast("Your account is not authorized.", "error");
    setTimeout(() => authLogout(), 2500);
  }
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

function grade(n)      { return n>=80?"A":n>=60?"B":n>=50?"C":n>=40?"D":"F"; }
function gradeClass(g) { return {A:"grade-A",B:"grade-B",C:"grade-C",D:"grade-D",F:"grade-F"}[g]||""; }
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
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  $(id)?.classList.add("active");
  document.querySelector(`[data-section="${id}"]`)?.classList.add("active");
  if (window.innerWidth < 992) { sidebarOpen = false; applyLayout(); }
};
document.querySelectorAll(".nav-item").forEach(item => item.addEventListener("click", () => showSection(item.dataset.section)));
["scores","broadsheet","remarks","approval"].forEach(k => {
  $(`qa-${k}`)?.addEventListener("click", () => showSection(`section-${k}`));
});

// ── Auth ──────────────────────────────────────────────────────
let _students = [];
let _authResolved = false;

onAuthChange(async user => {
  _authResolved = true;
  const overlay = $("authLoadingOverlay");

  if (!user) {
    if (overlay) overlay.style.display = "none";
    window.location.href = "admin-login.html";
    return;
  }

  // Load teachers FIRST — retry once if it fails
  try { await loadTeachers(); } catch(e) {
    console.warn("loadTeachers failed, retrying…", e);
    await new Promise(r => setTimeout(r, 1500));
    try { await loadTeachers(); } catch(e2) { console.error("loadTeachers retry failed:", e2); }
  }

  _user = user;
  resolveRole(user.email);
  applyRoleUI();
  if (overlay) overlay.style.display = "none";
  await Promise.allSettled([loadSession(), loadStudents()]);
});

// Safety: if Firebase auth takes too long, don't leave user on blank screen
setTimeout(() => {
  if (!_authResolved) window.location.href = "admin-login.html";
}, 8000);

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
  const el = $("adminEmailDisplay");
  if (el) el.innerHTML = (_user?.email||"") + badge;

  // Reset btn
  $("openResetBtn").style.display = _isMaster ? "flex" : "none";

  // Sidebar nav items
  setDisplayFlex("nav-students",   _isMaster || _isFT);
  setDisplayFlex("nav-subjects",   _isMaster || _isFT);
  // FIX #5/#7: Scores tab shows for subject teachers (includes dual-role)
  setDisplayFlex("nav-scores",     _isMaster || _isST || _isFT);
  setDisplayFlex("nav-remarks",    _isMaster || _isFT);
  setDisplayFlex("nav-approval",   _isMaster);
  setDisplayFlex("nav-settings",   _isMaster);
  setDisplayFlex("nav-broadsheet", true);

  // Quick access
  setDisplay("qa-remarks",  _isMaster || _isFT);
  setDisplay("qa-approval", _isMaster);
  setDisplay("qa-scores",   _isMaster || _isST || _isFT);

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

  buildDropdowns();
  renderTeacherRows(); // Populate teacher tables now that _isMaster is resolved
}

// ══════════════════════════════════════════════════════════════
//  BUILD DROPDOWNS
// ══════════════════════════════════════════════════════════════
function buildDropdowns() {
  function opts(arr) { return arr.map(v => `<option value="${v}">${v}</option>`).join(""); }

  // Score arms: master/ST sees all arms (ST can enter scores in any class for their subject)
  // FT sees only their class arms
  const ftArms    = _isFT ? ALL_ARMS.filter(a => armToBase(a) === _ftClass) : [];
  const scoreArms = _isMaster ? ALL_ARMS
    : _isST ? ALL_ARMS           // subject teachers can select any class
    : ftArms;                    // form teachers limited to their class
  const scoreArmEl = $("scoreClassArm");
  if (scoreArmEl) {
    scoreArmEl.innerHTML = scoreArms.length
      ? opts(scoreArms)
      : '<option value="">No classes assigned</option>';
    scoreArmEl.disabled = !_isMaster && scoreArms.length <= 1;
  }

  // ── Broadsheet arms: FT sees their 2 arms; ST sees their arms; master sees all ──
  // FIX #9 ROOT: form teacher correctly gets JS 1A AND JS 1B
  let bsSet = new Set();
  if (_isMaster) { ALL_ARMS.forEach(a => bsSet.add(a)); }
  else {
    if (_isFT) { ALL_ARMS.filter(a => armToBase(a) === _ftClass).forEach(a => bsSet.add(a)); }
    if (_isST) { _stArms.forEach(a => bsSet.add(a)); }
  }
  const bsArms = ALL_ARMS.filter(a => bsSet.has(a));
  const bsArmEl = $("bsClassArm");
  if (bsArmEl) {
    bsArmEl.innerHTML = bsArms.length ? opts(bsArms) : '<option value="">No classes available</option>';
    bsArmEl.disabled  = !_isMaster && bsArms.length <= 1;
  }

  // ── Remark arms: form teacher's class only ─────────────────
  const remArms = _isMaster ? ALL_ARMS
    : _isFT ? ALL_ARMS.filter(a => armToBase(a) === _ftClass)
    : [];
  const remArmEl = $("remarkClassArm");
  if (remArmEl) {
    remArmEl.innerHTML = remArms.length ? opts(remArms) : '<option value="">Not assigned</option>';
    remArmEl.disabled  = !_isMaster && remArms.length <= 1;
  }

  // ── Subject management classes ─────────────────────────────
  const subClasses = _isMaster ? ALL_CLASSES : _isFT ? [_ftClass] : [];
  const subClsEl = $("subjectClass");
  if (subClsEl) {
    subClsEl.innerHTML = subClasses.length ? opts(subClasses) : '<option value="">Not assigned</option>';
    subClsEl.disabled  = !_isMaster && subClasses.length <= 1;
  }

  $("stuFilterClass").innerHTML = '<option value="">All Classes</option>' + opts(ALL_CLASSES);

  // FIX #1: After arms are populated, immediately refresh the subject dropdown
  // Use setTimeout so DOM updates settle before the async Firestore call
  if (scoreArms.length) {
    setTimeout(() => refreshSubjectDropdown(), 200);
  } else {
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
let _schoolName = "Recomella Academy";
let _schoolLogo = "./logo.png";

async function loadSession() {
  try {
    const s = await getSession();
    const t = s.currentTerm || "1";
    $("statSession").textContent = s.session || "—";
    $("statTerm").textContent    = TERM_LABELS[t] || "—";
    ["scoreTerm","subjectTerm","bsTerm","remarkTerm","approvalTerm","resetTerm"].forEach(id => {
      const el = $(id); if (el) el.value = t;
    });
    if (_isMaster) {
      $("sessionInput").value    = s.session || "";
      $("termInput").value       = t;
      $("schoolNameInput").value = s.schoolName || "";
    }
    if (s.schoolName) {
      _schoolName = s.schoolName;
      const bn = $("brandName"); if (bn) bn.textContent = s.schoolName;
    }
  } catch(e) { console.error(e); }
}

async function loadStudents() {
  try {
    _students = await getAllStudents();
    $("statStudents").textContent = _students.length;
    renderStudentTable(_students);
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
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding:30px;color:var(--text-muted)">No students found.</td></tr>`;
    return;
  }
  tbody.innerHTML = pool.map(s => {
    const soArr  = Array.isArray(s.subjectsOffered) ? s.subjectsOffered : [];
    const soTag  = (!s.subjectsOffered || s.subjectsOffered === "all")
      ? `<span class="badge badge-success">All Subjects</span>`
      : `<span class="badge badge-info" title="${soArr.join(", ")}">${soArr.length} subject${soArr.length!==1?"s":""}</span>`;
    return `<tr>
      <td><strong>${s.regNumber}</strong></td>
      <td>${s.fullName||"—"}</td>
      <td>${s.classBase||"—"}</td>
      <td><span class="badge badge-primary">Arm ${s.arm||"—"}</span></td>
      <td>${s.gender||"—"}</td>
      <td>${soTag}</td>
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
    subjects = await getClassSubjects(classBase, t);
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
  $("sAllSubjects").checked = true;
  $("specificSubjectsWrap").style.display = "none";
  $("subjectCheckboxes").innerHTML = "";
  $("sRegNumber").disabled = false;
  $("sArm").disabled = false;
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
  const classArm = `${cls}${arm}`;  // e.g. "JS 1" + "A" = "JS 1A"
  const data = { regNumber: reg, fullName: name, classBase: cls, arm, classArm, gender, subjectsOffered };
  const btn = $("saveStudentBtn"); btn.disabled = true; btn.textContent = "Saving…";
  try {
    if (editId) {
      if (_isMaster && reg !== editId) {
        // RegNumber changed — delete old doc, create new one
        await changeStudentReg(editId, reg, data);
        toast("Student updated with new reg number.", "success");
      } else {
        await updateStudent(editId, data);
        toast("Student updated.", "success");
      }
    } else {
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
  // Admin — all fields open including regNumber. Form teacher — locked
  $("sRegNumber").disabled = !_isMaster;
  $("sClass").disabled     = !_isMaster;
  $("sArm").disabled       = !_isMaster;

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
  $("confirmMsg").textContent = `Delete "${name}"? This cannot be undone.`;
  _delReg = reg;
  openModal("confirmModal");
};
$("confirmDeleteBtn").addEventListener("click", async () => {
  if (!_delReg) return;
  const btn = $("confirmDeleteBtn"); btn.disabled = true; btn.textContent = "Deleting…";
  try {
    await deleteStudent(_delReg);
    toast("Student deleted.", "info");
    closeModal("confirmModal");
    await loadStudents();
  } catch(e) { toast(e.message, "error"); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-trash"></i> Delete'; _delReg = null; }
});

// ══════════════════════════════════════════════════════════════
//  SUBJECTS
// ══════════════════════════════════════════════════════════════
let _classSubjects = [];

$("loadSubjectsBtn").addEventListener("click", async () => {
  const cls  = $("subjectClass").value;
  const term = $("subjectTerm").value;
  if (!cls) { toast("Select a class.", "error"); return; }
  try {
    _classSubjects = await getClassSubjects(cls, term);
    renderChips();
    toast(`${_classSubjects.length} subject(s) loaded for ${cls} — ${TERM_LABELS[term]}.`, "success");
  } catch(e) { toast(e.message, "error"); }
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
    await saveClassSubjects(cls, term, _classSubjects);
    toast(`Subjects saved for ${cls} — ${TERM_LABELS[term]}.`, "success");
  } catch(e) { toast(e.message, "error"); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save"></i> Save Subjects'; }
});

// ══════════════════════════════════════════════════════════════
//  SCORES  — FIX #1 #3 #7 #8
// ══════════════════════════════════════════════════════════════
let _scoreStudents = [], _scoreData = {};

// FIX #1: Load subjects dynamically from Firestore when class/term changes
async function refreshSubjectDropdown() {
  const classArm  = $("scoreClassArm").value;
  const term      = $("scoreTerm").value;
  if (!classArm || !term) return;
  const classBase = armToBase(classArm);
  const sel = $("scoreSubject");
  sel.innerHTML = '<option value="">Loading…</option>';
  try {
    let subs = await getClassSubjects(classBase, term);
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

    // Load ALL students in the class arm — subject teacher enters scores for all students
    // subjectsOffered is only used on the broadsheet output, not for score entry
    _scoreStudents = all.sort((a, b) => (a.fullName||"").localeCompare(b.fullName||""));

    // Load existing saved scores
    const saved = await getScoresByClassArmSubjectTerm(classArm, subject, term);
    _scoreData = {};
    saved.forEach(sc => { _scoreData[sc.regNumber] = sc; });

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
  const btn = $("saveScoresBtn"); btn.disabled = true; btn.textContent = "Uploading…";
  try {
    await Promise.all(_scoreStudents.map(s => {
      const t1 = Math.min(Math.max(parseInt($(`t1_${s.regNumber}`)?.value)||0, 0), 20);
      const t2 = Math.min(Math.max(parseInt($(`t2_${s.regNumber}`)?.value)||0, 0), 20);
      const ex = Math.min(Math.max(parseInt($(`ex_${s.regNumber}`)?.value)||0, 0), 60);
      return saveScore({ regNumber:s.regNumber, fullName:s.fullName, classArm, classBase, subject, term:String(term), test1:t1, test2:t2, exam:ex });
    }));
    toast(`Scores uploaded — ${subject} / ${classArm} / ${TERM_LABELS[term]}.`, "success");
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

  // FIX #9: Form teachers (and subject teachers) are allowed
  // No role restriction here — all logged-in users can view broadsheet

  const btn = $("loadBroadsheetBtn"); btn.disabled = true; btn.textContent = "Building…";
  try {
    const [students, allScores, subjects] = await Promise.all([
      getStudentsByClassArm(classArm),
      getScoresByClassArmTerm(classArm, term),
      getClassSubjects(classBase, term)
    ]);
    if (!students.length) { toast("No students found in this class arm.", "warning"); return; }
    if (!subjects.length) { toast("No subjects set up for this class/term yet.", "warning"); return; }
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
  [...rows].sort((a,b) => (a.fullName||"").localeCompare(b.fullName||"")).forEach((r, idx) => {
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

$("downloadExcelBtn").addEventListener("click", async () => {
  const classArm  = $("bsClassArm").value;
  const term      = $("bsTerm").value;
  const classBase = armToBase(classArm);
  if (!classArm || !term) { toast("Load broadsheet first.", "error"); return; }

  // Safety check — make sure SheetJS loaded
  if (typeof XLSX === "undefined") {
    toast("Excel library not loaded. Check your internet connection and refresh.", "error");
    return;
  }

  const btn = $("downloadExcelBtn");
  btn.disabled = true; btn.textContent = "Generating…";

  try {
    // ── Fetch live data ──────────────────────────────────────
    const [students, allScores, subjects, sessionData] = await Promise.all([
      getStudentsByClassArm(classArm),
      getScoresByClassArmTerm(classArm, term),
      getClassSubjects(classBase, term),
      getSession()
    ]);

    const ftEmail = Object.entries(FORM_TEACHERS).find(([, cls]) => cls === classBase)?.[0] || "—";

    // Build score lookup
    const scoreMap = {};
    allScores.forEach(sc => {
      if (!scoreMap[sc.regNumber]) scoreMap[sc.regNumber] = {};
      scoreMap[sc.regNumber][sc.subject] = sc;
    });

    // Enrich rows
    const rows = students.map(s => {
      const offAll  = !s.subjectsOffered || s.subjectsOffered === "all";
      const offered = subjects.filter(sub => offAll || (Array.isArray(s.subjectsOffered) && s.subjectsOffered.includes(sub)));
      let grand = 0;
      offered.forEach(sub => {
        const sc = scoreMap[s.regNumber]?.[sub];
        if (sc) grand += (sc.test1||0) + (sc.test2||0) + (sc.exam||0);
      });
      return { ...s, offered, grand };
    }).sort((a, b) => (a.fullName||"").localeCompare(b.fullName||""));

    const posMap = {};
    [...rows].sort((a,b) => b.grand - a.grand).forEach((r, i) => { posMap[r.regNumber] = ordinal(i+1); });

    // Total columns count for merges
    const totalCols = 3 + (subjects.length * 5) + 3; // S/N + Name + Reg + subjects*5 + Grand+Avg+Pos

    // ── BUILD WORKSHEET DATA ─────────────────────────────────
    const wsData = [];

    // ── HEADER ROWS ──────────────────────────────────────────
    wsData.push([(_schoolName || "BrightSchool").toUpperCase()]);
    wsData.push(["RESULT BROADSHEET"]);
    wsData.push([`Session: ${sessionData.session || "—"}   |   Term: ${TERM_LABELS[term]}   |   Class: ${classArm}`]);
    wsData.push([`Form Teacher: ${ftEmail}`]);
    wsData.push([]); // blank spacer

    // ── TABLE HEADER ROW 1 — subject group labels ────────────
    const hRow1 = ["S/N", "Student Name", "Reg No."];
    subjects.forEach(s => { hRow1.push(s); for(let i=0;i<4;i++) hRow1.push(""); });
    hRow1.push("Grand Total", "Average", "Position");
    wsData.push(hRow1);

    // ── TABLE HEADER ROW 2 — sub-columns ────────────────────
    const hRow2 = ["", "", ""];
    subjects.forEach(() => hRow2.push("T1", "T2", "Exam", "Total", "Pos"));
    hRow2.push("", "", "");
    wsData.push(hRow2);

    // ── BODY ROWS ────────────────────────────────────────────
    rows.forEach((r, idx) => {
      const row = [idx + 1, r.fullName || "—", r.regNumber];
      subjects.forEach(sub => {
        if (!r.offered.includes(sub)) {
          row.push("N/A", "", "", "", "");
        } else {
          const sc  = scoreMap[r.regNumber]?.[sub];
          const t1  = sc?.test1 || 0, t2 = sc?.test2 || 0, ex = sc?.exam || 0;
          row.push(t1||0, t2||0, ex||0, t1+t2+ex, "");
        }
      });
      const avg = r.offered.length > 0 ? parseFloat((r.grand / r.offered.length).toFixed(1)) : 0;
      row.push(r.grand, avg, posMap[r.regNumber] || "—");
      wsData.push(row);
    });

    // ── FOOTER ROWS ──────────────────────────────────────────
    wsData.push([]); // blank spacer
    wsData.push([`Signature: ___________________________`]);
    wsData.push([`Developed by Brightest Digital Services`]);
    wsData.push([`Date Generated: ${new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"long", year:"numeric" })}`]);

    // ── CREATE WORKBOOK ──────────────────────────────────────
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // ── COLUMN WIDTHS ────────────────────────────────────────
    const colWidths = [{ wch: 5 }, { wch: 28 }, { wch: 14 }];
    subjects.forEach(() => { colWidths.push({wch:5},{wch:5},{wch:6},{wch:7},{wch:5}); });
    colWidths.push({ wch: 11 }, { wch: 9 }, { wch: 9 });
    ws["!cols"] = colWidths;

    // ── MERGES — header title rows span all columns ──────────
    const merges = [
      { s:{r:0,c:0}, e:{r:0,c:totalCols-1} }, // school name
      { s:{r:1,c:0}, e:{r:1,c:totalCols-1} }, // RESULT BROADSHEET
      { s:{r:2,c:0}, e:{r:2,c:totalCols-1} }, // session/term/class
      { s:{r:3,c:0}, e:{r:3,c:totalCols-1} }, // form teacher
    ];
    // Merge subject name across 5 sub-columns in header row 1 (row index 5)
    subjects.forEach((_, i) => {
      const c = 3 + i * 5;
      merges.push({ s:{r:5,c}, e:{r:5,c:c+4} });
    });
    // Merge Grand Total, Average, Position header across both header rows
    [totalCols-3, totalCols-2, totalCols-1].forEach(c => {
      merges.push({ s:{r:5,c}, e:{r:6,c} });
    });
    // Merge S/N, Name, Reg across both header rows
    [0,1,2].forEach(c => { merges.push({ s:{r:5,c}, e:{r:6,c} }); });
    // Footer merges
    const footerStart = 5 + 2 + rows.length + 1;
    [0,1,2].forEach(offset => {
      merges.push({ s:{r:footerStart+offset,c:0}, e:{r:footerStart+offset,c:totalCols-1} });
    });
    ws["!merges"] = merges;

    XLSX.utils.book_append_sheet(wb, ws, classArm);
    XLSX.writeFile(wb, `Broadsheet_${classArm}_${TERM_LABELS[term]}_${sessionData.session || "2024"}.xlsx`);
    toast("Excel file downloaded successfully.", "success");

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
      .sort((a,b) => (a.fullName||"").localeCompare(b.fullName||""));
    const existing = await getRemarksByClassArmTerm(classArm, term);
    const remMap   = {};
    existing.forEach(r => { remMap[r.regNumber] = r.remark; });

    $("remarksCardTitle").innerHTML = `<i class="bi bi-chat-left-quote-fill"></i> ${classArm} — ${TERM_LABELS[term]}`;
    $("remarksCard").style.display = "block";
    $("remarksTable").innerHTML = _remStudents.map(s => `<tr>
      <td><strong>${s.regNumber}</strong></td>
      <td style="font-weight:700">${s.fullName||"—"}</td>
      <td><span class="badge badge-primary">Arm ${s.arm||"—"}</span></td>
      <td><input type="text" class="form-control" id="rem_${s.regNumber}"
        value="${(remMap[s.regNumber]||"").replace(/"/g,"&quot;")}"
        placeholder="Enter remark for this student…" style="font-size:.85rem"/></td>
    </tr>`).join("");
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
      return saveRemark(s.regNumber, classArm, classBase, term, remark);
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
    const list = await getAllApprovals();
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
    if (approve) { await approveResults(classArm, term); toast(`${classArm} approved — students can now view results.`, "success"); }
    else         { await revokeApproval(classArm, term);  toast(`${classArm} approval revoked.`, "info"); }
    $("loadApprovalsBtn").click();
  } catch(e) { toast(e.message, "error"); }
};

// ══════════════════════════════════════════════════════════════
//  TEACHER MANAGEMENT — Master Admin only
// ══════════════════════════════════════════════════════════════
const JS_ARMS  = ["JS 1A","JS 1B","JS 2A","JS 2B","JS 3A","JS 3B"];
const SS_ARMS  = ["SS 1A","SS 1B","SS 2A","SS 2B","SS 3A","SS 3B"];

function sectionToArms(section, customArms) {
  if (section === "JS")     return JS_ARMS;
  if (section === "SS")     return SS_ARMS;
  if (section === "ALL")    return ALL_ARMS;
  if (section === "CUSTOM") return customArms.split(",").map(s => s.trim()).filter(Boolean);
  return [];
}

function sectionLabel(section, classArms) {
  if (section === "JS")  return "JS Section (all arms)";
  if (section === "SS")  return "SS Section (all arms)";
  if (section === "ALL") return "All Sections";
  return classArms.join(", ");
}

function renderTeacherRows() {
  if (!_isMaster) return; // Only master admin sees settings — bail silently for teachers

  // Form teachers
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

  // Subject teachers
  const stBody = $("stTeacherBody");
  if (stBody) {
    const entries = Object.entries(SUBJECT_TEACHERS);
    stBody.innerHTML = entries.length ? entries.map(([email, cfg], i) => `
      <tr>
        <td style="font-size:.82rem;font-weight:700">${email}</td>
        <td style="font-size:.82rem">${cfg.section === "JS" ? "Junior (JS)" : cfg.section === "SS" ? "Senior (SS)" : "Both (JS & SS)"}</td>
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
    const subjects = await getSubjectsBySection(section, term);
    const wrap = $("stSubjectsCheckboxWrap");
    if (!subjects.length) {
      wrap.innerHTML = `<span style="font-size:.82rem;color:var(--text-muted)">No subjects found for ${section} section. Make sure subjects are saved in the Subjects section first.</span>`;
    } else {
      wrap.innerHTML = subjects.map(s =>
        `<label style="display:flex;align-items:center;gap:6px;font-size:.83rem;font-weight:700;cursor:pointer;background:var(--white);padding:6px 10px;border-radius:6px;border:1.5px solid var(--border)">
          <input type="checkbox" class="st-sub-check" value="${s}" style="accent-color:var(--primary);width:15px;height:15px"/> ${s}
        </label>`
      ).join("");
    }
    wrap.style.display = "flex";
    $("loadSTSubjectsHint").textContent = `${subjects.length} subject(s) loaded for ${section} section`;
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

  // Expand arms immediately at save time — no runtime expansion needed
  const arms = section === "JS"  ? [...JS_ARMS]
             : section === "SS"  ? [...SS_ARMS]
             : [...ALL_ARMS]; // ALL

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
$("saveSchoolBtn")?.addEventListener("click", async () => {
  const name = $("schoolNameInput").value.trim();
  if (!name) { toast("Enter school name.", "error"); return; }
  const btn = $("saveSchoolBtn"); btn.disabled = true; btn.textContent = "Saving…";
  try {
    const s = await getSession();
    await saveSession(s.session || "", s.currentTerm || "1", name, "");
    _schoolName = name;
    const bn = $("brandName"); if (bn) bn.textContent = name;
    toast("School name saved.", "success");
  } catch(e) { toast(e.message, "error"); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save"></i> Save School Name'; }
});

$("saveSessionBtn")?.addEventListener("click", async () => {
  const session = $("sessionInput").value.trim();
  const term    = $("termInput").value;
  if (!session) { toast("Enter a session.", "error"); return; }
  const btn = $("saveSessionBtn"); btn.disabled = true; btn.textContent = "Saving…";
  try {
    await saveSession(session, term, _schoolName, _schoolLogo);
    toast("Session saved.", "success");
    $("statSession").textContent = session;
    $("statTerm").textContent    = TERM_LABELS[term];
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
//  TERM RESET — Master Admin only
// ══════════════════════════════════════════════════════════════
$("openResetBtn").addEventListener("click", () => openModal("resetModal"));

$("confirmResetBtn").addEventListener("click", async () => {
  if (!_isMaster) { toast("Only the Master Admin can reset term data.", "error"); return; }
  if ($("resetConfirmInput").value.trim() !== "RESET") { toast('Type "RESET" to confirm.', "error"); return; }
  const term = $("resetTerm").value;
  const btn  = $("confirmResetBtn"); btn.disabled = true; btn.textContent = "Resetting…";
  try {
    await resetTermData(term);
    toast(`${TERM_LABELS[term]} cleared — all scores, remarks & approvals removed.`, "info");
    closeModal("resetModal");
    $("resetConfirmInput").value = "";
  } catch(e) { toast(e.message, "error"); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-trash3-fill"></i> Reset Term Data'; }
});
