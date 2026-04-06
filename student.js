// ============================================================
//  student.js — SchoolNova Result Card
//  Generates A4 printable report card from Firestore data
// ============================================================
import {
  getStudentByReg,
  getScoresByStudentTerm,
  getRemarkByStudentTerm,
  getSession,
  isResultApproved,
  getScoresByClassArmTerm,
  getClassSubjects,
  getStudentsByClassArm
} from "./firebase.js";

const S = id => document.getElementById(id);

const TERM_LABELS = { "1":"1ST TERM", "2":"2ND TERM", "3":"3RD TERM" };

// ── Grade calculation using school's custom grading ──────────
var _grading = {
  A: "86-100", B1: "71-85", B2: "61-70", C: "50-60", D: "39-49", F: "0-38"
};
function parseRange(range) {
  var parts = (range || "").split("-").map(function(p){ return parseInt(p.trim(), 10); });
  return { min: parts[0]||0, max: parts[1]||100 };
}
function getGrade(total) {
  if (total >= parseRange(_grading.A).min)  return "A";
  if (total >= parseRange(_grading.B1).min) return "B1";
  if (total >= parseRange(_grading.B2).min) return "B2";
  if (total >= parseRange(_grading.C).min)  return "C";
  if (total >= parseRange(_grading.D).min)  return "D";
  return "F";
}
function ordinal(n) {
  var s=["th","st","nd","rd"], v=n%100;
  return n + (s[(v-20)%10] || s[v] || s[0]);
}

// ── Determine school section from classArm ───────────────────
function getSection(classArm) {
  if (!classArm) return "secondary";
  var c = classArm.toLowerCase();
  if (c.startsWith("creche"))  return "creche";
  if (c.startsWith("nursery")) return "nursery";
  if (c.startsWith("basic"))   return "basic";
  return "secondary"; // JS and SS
}

// ── Random tick generator (seeded by reg number) ─────────────
// A=60%, B=30%, C=10%, D=Never
function seededRandom(seed) {
  var x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}
function randomTick(seed, idx) {
  var r = seededRandom(seed + idx * 37.7);
  if (r < 0.60) return "A";
  if (r < 0.90) return "B";
  if (r < 1.00) return "C";
  return "B"; // safety — never D
}
function seedFromReg(reg) {
  var n = 0;
  for (var i = 0; i < reg.length; i++) n += reg.charCodeAt(i) * (i + 1);
  return n;
}

// ── Affective Traits ─────────────────────────────────────────
var AFFECTIVE_TRAITS = [
  "Diligence", "Leadership", "Self-Control", "Neatness",
  "Honesty", "Obedience", "Humility", "Friendliness",
  "Consistency", "Reliability", "Punctuality"
];

// ── Psychomotor Skills ───────────────────────────────────────
var PSYCHOMOTOR_SKILLS = [
  "Hand Writing", "Verbal Fluency", "Games",
  "Social", "Handling Tools", "Drawing & Painting"
];

// ── Build traits table ───────────────────────────────────────
function buildTraitsTable(tbodyId, traits, seed, startIdx) {
  var tbody = S(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = traits.map(function(trait, i) {
    var tick = randomTick(seed, startIdx + i);
    var cells = ["A","B","C","D"].map(function(g) {
      return "<td class='" + (tick===g?"tick-cell":"") + "'>" + (tick===g?"✓":"") + "</td>";
    }).join("");
    return "<tr><td class='trait-name'>" + trait + "</td>" + cells + "</tr>";
  }).join("");
}

// ── Select HOD remark based on position ──────────────────────
function selectHodRemark(position, session) {
  var remarks = [];
  if (getSection(_scoreClassArm) === "secondary") {
    remarks = [
      session.principalRemark1 || "",
      session.principalRemark2 || "",
      session.principalRemark3 || "",
      session.principalRemark4 || ""
    ];
  } else {
    remarks = [
      session.htRemark1 || "",
      session.htRemark2 || "",
      session.htRemark3 || "",
      session.htRemark4 || ""
    ];
  }
  if (position <= 5)  return remarks[0] || remarks[3] || "Keep up the good work.";
  if (position <= 10) return remarks[1] || remarks[3] || "Good effort. Aim higher.";
  if (position <= 20) return remarks[2] || remarks[3] || "More effort needed.";
  return remarks[3] || "Study harder next term.";
}

// ── Get next term fees based on section ──────────────────────
function getSectionFees(session, classArm) {
  var sec = getSection(classArm);
  if (sec === "creche")  return session.feesCreche  || "—";
  if (sec === "nursery") return session.feesNursery || "—";
  if (sec === "basic")   return session.feesBasic   || "—";
  // Secondary — check if JS or SS
  var c = (classArm || "").toLowerCase();
  if (c.startsWith("js")) return session.feesJSS || session.feesSecondary || "—";
  return session.feesSSS || session.feesSecondary || "—";
}

// ── Format closing date ───────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day:"2-digit", month:"long", year:"numeric"
    });
  } catch(e) { return dateStr; }
}

// Global — used in selectHodRemark
var _scoreClassArm = "";

// ── URL params ───────────────────────────────────────────────
var params  = new URLSearchParams(window.location.search);
var reg     = (params.get("reg")     || "").toUpperCase().trim();
var term    = params.get("term")     || "";
var urlSession = params.get("session") || ""; // passed from index.html

// ── Main load function ───────────────────────────────────────
async function loadResult() {
  if (!reg || !term) { showError("Invalid link. Please go back and try again."); return; }

  try {
    // Fetch student + school settings in parallel
    var results = await Promise.all([getStudentByReg(reg), getSession()]);
    var student = results[0];
    var session = results[1];

    // currentSession — URL param takes priority (set by index.html at moment student clicks)
    // Falls back to Firebase session for direct/bookmarked links
    var currentSession = urlSession || session.session || "";

    if (!student) { showError("Registration number not found. Please check and try again."); return; }

    // Approval check — uses currentSession so it matches the correct session's approval doc
    var approved = await isResultApproved(student.classArm, term, currentSession);
    if (!approved) {
      S("loadingState").classList.add("hidden");
      S("notApprovedState").classList.remove("hidden");
      S("notApprovedClass").textContent = (student.classArm||"") + " — " + (TERM_LABELS[term]||("Term "+term));
      return;
    }

    // Load scores + remark — filtered to currentSession
    var allScoresRaw = await getScoresByStudentTerm(reg, term);
    var remark       = await getRemarkByStudentTerm(reg, term, currentSession);
    var scores = allScoresRaw.filter(function(sc) {
      return !sc.session || sc.session === currentSession;
    });

    // Historical class from scores
    _scoreClassArm = scores.length > 0 ? (scores[0].classArm || student.classArm) : student.classArm;
    var section    = getSection(_scoreClassArm);
    var scoreClassBase = _scoreClassArm.replace(/[AB]$/, "").trim();

    // Apply school grading system
    if (session.gradeA)  _grading.A  = session.gradeA;
    if (session.gradeB1) _grading.B1 = session.gradeB1;
    if (session.gradeB2) _grading.B2 = session.gradeB2;
    if (session.gradeC)  _grading.C  = session.gradeC;
    if (session.gradeD)  _grading.D  = session.gradeD;
    if (session.gradeF)  _grading.F  = session.gradeF;

    // ── HEADER ─────────────────────────────────────────────
    S("rcSchoolName").textContent    = session.schoolName    || "SCHOOL NAME";
    S("rcSchoolType").textContent    = session.schoolType    || "";
    S("rcSchoolAddress").textContent = session.schoolAddress || "";
    S("rcSchoolMotto").textContent   = session.schoolMotto   || "";
    S("rcSchoolPhone").textContent   = session.schoolPhone   || "";

    // Logo
    if (session.schoolLogo) {
      var logoImg = S("rcLogoImg");
      logoImg.src = session.schoolLogo;
      logoImg.style.display = "block";
      S("rcLogoPlaceholder").style.display = "none";
    }

    // Report title
    var sectionLabel = section === "secondary" ? "SECONDARY" :
                       section === "basic"     ? "BASIC" :
                       section === "nursery"   ? "NURSERY" : "CRECHE";
    S("rcReportTitle").textContent = sectionLabel + " PROGRESS REPORT";

    S("rcSession").textContent = session.session || "—";
    S("rcTerm").textContent    = TERM_LABELS[term] || ("TERM " + term);

    // ── STUDENT INFO ───────────────────────────────────────
   S("rcName").textContent = (student.fullName || "—").toUpperCase();
    S("rcReg").textContent    = student.regNumber || reg;
    S("rcGender").textContent = student.gender    || "—";
    // Class = base only (e.g. "JS 1" not "JS 1A")
    S("rcClass").textContent  = scoreClassBase    || "—";
    // Stream = arm letter only (e.g. "A" or "B")
    var armLetter = student.arm || _scoreClassArm.slice(-1) || "—";
    S("rcStream").textContent = armLetter;

    // Class population = total in both Arms A and B
    var armStudents  = await getStudentsByClassArm(_scoreClassArm);
    var otherArm     = _scoreClassArm.endsWith("A")
      ? _scoreClassArm.slice(0,-1) + "B"
      : _scoreClassArm.slice(0,-1) + "A";
    var otherStudents = await getStudentsByClassArm(otherArm);
    var classPopulation = armStudents.length + otherStudents.length;
    S("rcPopulation").textContent = classPopulation || "—";

    // ── SCORES ─────────────────────────────────────────────
    if (!scores.length) {
      S("resultTbody").innerHTML = "<tr><td colspan='7' style='text-align:center;padding:12px;color:#94a3b8'>No scores recorded for this term.</td></tr>";
      S("loadingState").classList.add("hidden");
      S("resultContent").classList.remove("hidden");
      return;
    }

    var myScores = {};
    scores.forEach(function(sc) { myScores[sc.subject] = sc; });

    // ── FETCH ALL CLASS SUBJECTS (not just this student's scores) ──
    // All class subjects shown — blank rows for subjects student didn't take
    var classAllSubjects = await getClassSubjects(scoreClassBase, term, currentSession);

    // Priority order — Maths and English first, matching broadsheet order
    var PRIORITY_SUBJECTS = [
      "Mathematics","Maths","English Language","English","English Literature",
      "Physics","Chemistry","Biology","Agricultural Science",
      "Government","Economics","Commerce","Christian Religious Studies",
      "Islamic Religious Studies","Civic Education","Geography",
      "Marketing","Accounting","Computer","Computer Science",
      "Data Processing","Technical Drawing","Further Mathematics",
      "Basic Science","Basic Technology","Social Studies","Security Education",
      "French","Yoruba","Igbo","Hausa","Music","Fine Art","Physical Education"
    ];
    // Merge class subjects + student's own scored subjects (in case of mismatch)
    var allSubjectSet = new Set(classAllSubjects);
    Object.keys(myScores).forEach(function(s){ allSubjectSet.add(s); });
    var allSubjects  = Array.from(allSubjectSet);
    var prioritized  = PRIORITY_SUBJECTS.filter(function(s){ return allSubjects.includes(s); });
    var remaining    = allSubjects.filter(function(s){ return !prioritized.includes(s); }).sort();
    var subjects     = prioritized.concat(remaining);

    // ── OPTIMIZED POSITION CALCULATION ─────────────────────
    // ONE query gets ALL scores for entire class arm + term
    var armRegs = armStudents.map(function(s){ return s.regNumber; });
    var allClassScores = await getScoresByClassArmTerm(_scoreClassArm, term);
    var classScores = allClassScores.filter(function(s){
      return armRegs.includes(s.regNumber) && (!s.session || s.session === currentSession);
    });

    // Build per-subject position map — only for subjects this student actually scored
    var positionMap = {};
    Object.keys(myScores).forEach(function(subject) {
      var subjectScores = classScores.filter(function(s){ return s.subject === subject; })
        .map(function(s){ return { reg: s.regNumber, total: (s.test1||0)+(s.test2||0)+(s.exam||0) }; })
        .sort(function(a,b){ return b.total - a.total; });
      var idx = subjectScores.findIndex(function(s){ return s.reg === reg; });
      positionMap[subject] = idx >= 0 ? ordinal(idx + 1) : "—";
    });

    // Overall position — from single query result
    var armTotalsMap = {};
    classScores.forEach(function(sc) {
      if (!armTotalsMap[sc.regNumber]) armTotalsMap[sc.regNumber] = 0;
      armTotalsMap[sc.regNumber] += (sc.test1||0) + (sc.test2||0) + (sc.exam||0);
    });
    var armTotalsSorted = Object.keys(armTotalsMap)
      .map(function(r){ return { reg: r, total: armTotalsMap[r] }; })
      .sort(function(a,b){ return b.total - a.total; });
    var armPos = armTotalsSorted.findIndex(function(s){ return s.reg === reg; }) + 1;
    var posStr = armPos > 0 ? ordinal(armPos) : "—";

    // ── BUILD SCORE TABLE ──────────────────────────────────
    // Show ALL class subjects — blank if student didn't take it
    // Replace 0 with dash — students who didn't sit exam show -
    var grandTotal = 0;
    S("resultTbody").innerHTML = subjects.map(function(subject) {
      var sc = myScores[subject];
      if (!sc) {
        // Subject not taken by this student — show blank row
        return "<tr>" +
          "<td class='subj-name'>" + subject + "</td>" +
          "<td>—</td><td>—</td><td>—</td>" +
          "<td>—</td><td>—</td><td>—</td>" +
          "</tr>";
      }
      var t1 = sc.test1 || 0, t2 = sc.test2 || 0, ex = sc.exam || 0;
      var total = t1 + t2 + ex;
      var g = getGrade(total);
      grandTotal += total;
      // Replace 0 with dash — student didn't sit that component
      var d1  = t1 > 0 ? t1  : "—";
      var d2  = t2 > 0 ? t2  : "—";
      var dex = ex > 0 ? ex  : "—";
      var dtot = total > 0 ? total : "—";
      return "<tr>" +
        "<td class='subj-name'>" + subject + "</td>" +
        "<td>" + d1 + "</td>" +
        "<td>" + d2 + "</td>" +
        "<td>" + dex + "</td>" +
        "<td style='font-weight:800'>" + dtot + "</td>" +
        "<td style='font-weight:800;color:#1E40AF'>" + (positionMap[subject]||"—") + "</td>" +
        "<td class='grade-cell'>" + (total > 0 ? g : "—") + "</td>" +
        "</tr>";
    }).join("");

    // Only count subjects the student actually took for obtainable/average
    var takenSubjects = subjects.filter(function(s){ return myScores[s]; });
    var avg        = takenSubjects.length > 0
      ? (grandTotal / takenSubjects.length).toFixed(1) : "0";
    var obtainable = takenSubjects.length * 100;
    var passFail   = "PASS"; // All students show PASS

    // ── TRAITS + PSYCHOMOTOR ───────────────────────────────
    var seed = seedFromReg(reg + term);
    buildTraitsTable("affectiveTbody",  AFFECTIVE_TRAITS,   seed, 0);
    buildTraitsTable("psychomotorTbody", PSYCHOMOTOR_SKILLS, seed, 100);

    // ── SUMMARY ────────────────────────────────────────────
    S("rcObtainable").textContent = obtainable;
    S("rcPassFail").textContent   = passFail;
    S("rcTotal").textContent      = grandTotal;
    S("rcAverage").textContent    = avg;
    S("rcPosition").textContent   = posStr;
    S("rcInfoPosition").textContent = posStr;   // also in student info box
    S("rcOutOf").textContent      = classPopulation || armStudents.length;
    S("rcFees").textContent       = getSectionFees(session, _scoreClassArm);
    S("rcNextTerm").textContent   = formatDate(session.nextTermBegins);

    // ── REMARKS ────────────────────────────────────────────
    S("rcRemark").textContent = remark && remark.remark ? remark.remark : "No remark entered yet.";
    S("rcClosingDate").textContent = formatDate(session.termEndDate);
    S("rcHodDate").textContent     = formatDate(session.termEndDate);

    // HOD title and remark — Principal for Secondary, Head Teacher for Basic/Nursery/Creche
    var isSecondary = section === "secondary";
    S("rcHodTitle").textContent  = isSecondary ? "Principal's Remarks" : "Head Teacher's Remarks";
    S("rcHodRemark").textContent = selectHodRemark(armPos, session);

    // ── GRADING KEY ────────────────────────────────────────
    var gradingData = [
      { letter:"A",  label:"Excellent",  range: session.gradeA  || "86-100" },
      { letter:"B1", label:"Very Good",  range: session.gradeB1 || "71-85"  },
      { letter:"B2", label:"Good",       range: session.gradeB2 || "61-70"  },
      { letter:"C",  label:"Credit",     range: session.gradeC  || "50-60"  },
      { letter:"D",  label:"Pass",       range: session.gradeD  || "39-49"  },
      { letter:"F",  label:"Fail",       range: session.gradeF  || "0-38"   }
    ];
    S("rcGradingKey").innerHTML = gradingData.map(function(g) {
      return "<div class='rc-grade-row'>" +
        "<span class='rc-grade-letter'>" + g.letter + "</span>" +
        "<span class='rc-grade-label'>= " + g.label + "</span>" +
        "<span class='rc-grade-range'>" + g.range + "</span>" +
        "</div>";
    }).join("");

    // ── FOOTER ─────────────────────────────────────────────
    S("rcDateGenerated").textContent = new Date().toLocaleDateString("en-GB", {
      day:"2-digit", month:"long", year:"numeric"
    });

    S("loadingState").classList.add("hidden");
    S("resultContent").classList.remove("hidden");

  } catch(e) {
    console.error(e);
    showError("Failed to load result. Please check your connection and try again.");
  }
}

function showError(msg) {
  S("loadingState").classList.add("hidden");
  S("errorMsg").textContent = msg;
  S("errorState").classList.remove("hidden");
}

loadResult();
