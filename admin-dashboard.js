// ============================================================
//  admin-dashboard.js — BrightSchool Result Broadsheet v3
//  All 10 issues resolved
// ============================================================
import {
  onAuthChange, authLogout,
  addStudent, updateStudent, deleteStudent,
  getAllStudents, getStudentsByClassArm,
  saveScore, getScoresByClassArmSubjectTerm, getScoresByClassArmTerm,
  saveClassSubjects, getClassSubjects,
  saveRemark, getRemarksByClassArmTerm,
  saveSession, getSession,
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

const MASTER_ADMIN = "infinitetechnology04@gmail.com";

// ONE email per class — covers both Arm A and Arm B
const FORM_TEACHERS = {
  "js1teacher@brightschool.com": "JS 1",
  "js2teacher@brightschool.com": "JS 2",
  "churoseanna58@gmail.com": "JS 3",
  "brightstephen04@gmail.com": "SS 1",
  "apostlesundaybaridole1986@gmail.com": "SS 2",
  "ss3teacher@brightschool.com": "SS 3",
};

// Subject teachers: subjects[] they teach + classArms[] they teach in
// FIX #5 EXAMPLE: js1teacher also teaches Basic Science
// → Add: "js1teacher@brightschool.com": { subjects:["Basic Science"], classArms:["JS 1A","JS 1B"] }
const SUBJECT_TEACHERS = {
  "brightunik12@gmail.com": {
    subjects:  ["Civic Education", "PHE"],
    classArms: ["JS 1A","JS 1B","JS 2A","JS 2B","JS 3A","JS 3B"]
  },
  "brightstephen02@gmail.com": {
    subjects:  ["Chemistry", "Computer Science", "Data Processing"],
    classArms: ["SS 1A","SS 1B","SS 2A","SS 2B","SS 3A","SS 3B"]
  },
  "apostlesundaybaridole1986@gmail.com": {
  subjects: ["Biology", "Civic Education", "Government"],
  classArms: ["SS 1A", "SS 1B", "SS 2A", "SS 2B", "SS 3A", "SS 3B"]
},
"churoseanna58@gmail.com": {
  subjects: ["Social Studies", "Computer Studies"],
  classArms: ["JS 1A", "JS 1B", "JS 2A", "JS 2B", "JS 3A", "JS 3B"]
},
  // DUAL-ROLE EXAMPLE — form teacher who also teaches a subject:
  // "js1teacher@brightschool.com": {
  //   subjects:  ["Basic Science"],
  //   classArms: ["JS 1A","JS 1B"]
  // },
};

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
  _isMaster = _isFT = _isST = false;
  _ftClass = null; _stSubjects = []; _stArms = [];
  if (email === MASTER_ADMIN) { _isMaster = true; return; }
  if (FORM_TEACHERS[email])    { _isFT = true; _ftClass = FORM_TEACHERS[email]; }
  if (SUBJECT_TEACHERS[email]) {
    _isST       = true;
    _stSubjects = SUBJECT_TEACHERS[email].subjects  || [];
    _stArms     = SUBJECT_TEACHERS[email].classArms || [];
  }
  if (!_isMaster && !_isFT && !_isST) {
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

onAuthChange(user => {
  _authResolved = true;
  // Hide loading overlay
  const overlay = $("authLoadingOverlay");
  if (overlay) overlay.style.display = "none";

  if (!user) { window.location.href = "admin-login.html"; return; }
  _user = user;
  resolveRole(user.email);
  applyRoleUI();
  init();
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
  setDisplayFlex("nav-scores",     _isMaster || _isST);
  setDisplayFlex("nav-remarks",    _isMaster || _isFT);
  setDisplayFlex("nav-approval",   _isMaster);
  setDisplayFlex("nav-settings",   _isMaster);
  setDisplayFlex("nav-broadsheet", true);

  // Quick access
  setDisplay("qa-remarks",  _isMaster || _isFT);
  setDisplay("qa-approval", _isMaster);
  setDisplay("qa-scores",   _isMaster || _isST);

  // Role info card
  const ri = $("roleInfoCard");
  if (ri) {
    if (_isMaster) {
      ri.innerHTML = `<strong style="color:var(--primary)">Master Admin</strong><br>
        Full access — all classes, students, subjects, scores, approvals.`;
    } else {
      let t = "";
      if (_isFT) t += `<strong style="color:var(--info)">Form Teacher</strong> — Class ${_ftClass} (Arms A &amp; B)<br>
        Add/edit students, manage subjects, enter remarks, view broadsheet.<br><br>`;
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
}

// ══════════════════════════════════════════════════════════════
//  BUILD DROPDOWNS
// ══════════════════════════════════════════════════════════════
function buildDropdowns() {
  function opts(arr) { return arr.map(v => `<option value="${v}">${v}</option>`).join(""); }

  // ── Score entry arms: subject teacher's assigned arms ──────
  // FIX #1 ROOT: for master show all; for ST show only their arms; FT-only gets none
  const scoreArms = _isMaster ? ALL_ARMS : (_isST ? _stArms : []);
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

async function loadSession() {
  try {
    const s = await getSession();
    $("statSession").textContent = s.session || "—";
    $("statTerm").textContent    = TERM_LABELS[s.currentTerm] || "—";
    if (_isMaster) { $("sessionInput").value = s.session||""; $("termInput").value = s.currentTerm||"1"; }
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
    : _isFT ? list.filter(s => s.classBase === _ftClass)
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
    if (editId) { await updateStudent(editId, data); toast("Student updated.", "success"); }
    else        { await addStudent(data);             toast("Student added.",   "success"); }
    closeModal("studentModal");
    await loadStudents();
  } catch(e) { toast(e.message, "error"); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save"></i> Save Student'; }
});

// FIX #6: Admin can change class/arm; form teacher cannot
window.editStudent = async function(reg) {
  const s = _students.find(x => x.regNumber === reg); if (!s) return;
  $("studentModalTitle").textContent = "Edit Student";
  $("studentEditId").value = reg;
  $("sRegNumber").value    = s.regNumber;
  $("sFullName").value     = s.fullName  || "";
  $("sClass").value        = s.classBase || "";
  $("sArm").value          = s.arm       || "A";
  $("sGender").value       = s.gender    || "";
  $("sRegNumber").disabled = true;
  // FIX #6: Admin — all fields open. Form teacher — cannot change class/arm
  $("sClass").disabled = !_isMaster;
  $("sArm").disabled   = !_isMaster;

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
    // FIX #1: Subject teacher only sees their own subjects
    if (_isST && !_isMaster) subs = subs.filter(s => _stSubjects.includes(s));
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

  // FIX #7: Only subject teachers can upload scores
  if (_isFT && !_isST && !_isMaster) {
    toast("Only subject teachers can upload scores. You are a form teacher only.", "error"); return;
  }
  if (_isST && !_isMaster) {
    if (!_stSubjects.includes(subject)) {
      toast(`You are not authorized to enter scores for "${subject}".`, "error"); return;
    }
    if (!_stArms.includes(classArm)) {
      toast(`You are not authorized to enter scores for ${classArm}.`, "error"); return;
    }
  }

  const btn = $("loadScoresBtn"); btn.disabled = true; btn.textContent = "Loading…";
  try {
    // FIX #8: Always fresh fetch — this gives us fullName + all fields
    const all = await getStudentsByClassArm(classArm);

    // FIX #3: Only students offering this subject appear
    _scoreStudents = all.filter(s => {
      if (!s.subjectsOffered || s.subjectsOffered === "all") return true;
      return Array.isArray(s.subjectsOffered) && s.subjectsOffered.includes(subject);
    }).sort((a, b) => (a.fullName||"").localeCompare(b.fullName||""));

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
        ? `${_scoreStudents.length} student(s) loaded for ${subject}.`
        : `No students in ${classArm} are offering "${subject}".`,
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
      No students in <strong>${classArm}</strong> offering <strong>${subject}</strong>.
      <br><small>Check student subject registration in the Students section.</small>
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
    $("broadsheetCard").style.display = "block";
    $("printBroadsheetBtn").style.display = "inline-flex";
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

$("printBroadsheetBtn").addEventListener("click", () => window.print());

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
//  SETTINGS  — Master Admin only
// ══════════════════════════════════════════════════════════════
$("saveSessionBtn")?.addEventListener("click", async () => {
  const session = $("sessionInput").value.trim();
  const term    = $("termInput").value;
  if (!session) { toast("Enter a session.", "error"); return; }
  const btn = $("saveSessionBtn"); btn.disabled = true; btn.textContent = "Saving…";
  try {
    await saveSession(session, term);
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
