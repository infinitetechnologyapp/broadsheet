// ============================================================
//  student.js — SchoolNova Result Card
//  Generates A4 printable report card from Firestore data
//  WITH OFFLINE CACHE SUPPORT
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

var S = function(id) { return document.getElementById(id); };

var TERM_LABELS = { "1":"1ST TERM", "2":"2ND TERM", "3":"3RD TERM" };

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
  if (c.startsWith("pre nursery"))  return "pre_nursery";
  if (c.startsWith("nursery")) return "nursery";
  if (c.startsWith("basic"))   return "basic";
  return "secondary";
}

// ── Random tick generator ──────────────────────────────────────
function seededRandom(seed) {
  var x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function randomTick(seed, idx) {
  var r = seededRandom(seed + idx * 37.7);
  if (r < 0.60) return "A";
  if (r < 0.90) return "B";
  if (r < 1.00) return "C";
  return "B";
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
function selectHodRemark(position, session, section) {
  var remarks = [];
  if (section === "secondary") {
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
  if (sec === "pre_nursery") return session.feesPreNursery || "—";
  if (sec === "nursery") return session.feesNursery || "—";
  if (sec === "basic")   return session.feesBasic   || "—";
  var c = (classArm || "").toLowerCase();
  if (c.startsWith("js")) return session.feesJSS || session.feesSecondary || "—";
  return session.feesSSS || session.feesSecondary || "—";
}

// ── Format date ───────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day:"2-digit", month:"long", year:"numeric"
    });
  } catch(e) { return dateStr; }
}

// ── Toast notification ────────────────────────────────────────
function toast(msg, type) {
  var container = document.getElementById("toastContainer");
  if (!container) return;
  var el = document.createElement("div");
  el.className = "toast toast-" + (type || "info");
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(function() { if (el.parentNode) el.remove(); }, 4000);
}

// ── Show error ──────────────────────────────────────────────────
function showError(msg) {
  var loadingState = S("loadingState");
  var errorState = S("errorState");
  var errorMsg = S("errorMsg");
  if (loadingState) loadingState.classList.add("hidden");
  if (errorMsg) errorMsg.textContent = msg;
  if (errorState) errorState.classList.remove("hidden");
}

// ── URL params ───────────────────────────────────────────────
var params = new URLSearchParams(window.location.search);
var reg = (params.get("reg") || "").toUpperCase().trim();
var term = params.get("term") || "";
var urlSession = params.get("session") || "";

// ── Global variable for class arm ────────────────────────────
var _scoreClassArm = "";

// ── Render result ──────────────────────────────────────────────
function renderResult(student, session, currentSession, term, data) {
  try {
    var scores = data.scores || [];
    var classScores = data.classScores || [];
    var positionMap = data.positionMap || {};
    var armPos = data.armPos || 0;
    var myScores = data.myScores || {};
    var classSubjects = data.classSubjects || [];
    var armStudents = data.armStudents || [];
    var remark = data.remark || null;
    var section = data.section || "secondary";
    var scoreClassBase = data.scoreClassBase || "";
    var scoreClassArm = data._scoreClassArm || "";
    var totalPopulation = data.totalPopulation || 0;
    
    // ── HEADER ─────────────────────────────────────────────
    S("rcSchoolName").textContent = session.schoolName || "SCHOOL NAME";
    S("rcSchoolType").textContent = session.schoolType || "";
    S("rcSchoolAddress").textContent = session.schoolAddress || "";
    S("rcSchoolMotto").textContent = session.schoolMotto || "";
    S("rcSchoolPhone").textContent = session.schoolPhone || "";

    // Logo
    if (session.schoolLogo) {
      var logoImg = S("rcLogoImg");
      if (logoImg) {
        logoImg.src = session.schoolLogo;
        logoImg.style.display = "block";
      }
      var placeholder = S("rcLogoPlaceholder");
      if (placeholder) placeholder.style.display = "none";
    }

    // ── REPORT TITLE ─────────────────────────────────────────
    var classBase = scoreClassBase || "";
    var reportTitle = "PROGRESS REPORT";
    
    if (classBase === "Pre Nursery") {
      reportTitle = "PRE NURSERY PROGRESS REPORT";
    } else if (section === "secondary") {
      if (classBase.startsWith("SS")) {
        reportTitle = "SENIOR SECONDARY PROGRESS REPORT";
      } else if (classBase.startsWith("JS")) {
        reportTitle = "JUNIOR SECONDARY PROGRESS REPORT";
      } else {
        reportTitle = "SECONDARY PROGRESS REPORT";
      }
    } else if (section === "basic") {
      reportTitle = "BASIC PROGRESS REPORT";
    } else if (section === "nursery") {
      reportTitle = "NURSERY PROGRESS REPORT";
    } else if (section === "pre_nursery") {
      reportTitle = "PRE NURSERY PROGRESS REPORT";
    }
    
    S("rcReportTitle").textContent = reportTitle;
    S("rcSession").textContent = session.session || "—";
    S("rcTerm").textContent = TERM_LABELS[term] || ("TERM " + term);

    // ── STUDENT INFO ───────────────────────────────────────
    S("rcName").textContent = (student.fullName || "—").toUpperCase();
    S("rcReg").textContent = student.regNumber || reg;
    S("rcGender").textContent = student.gender || "—";
    S("rcClass").textContent = scoreClassBase || "—";
    var armLetter = student.arm || scoreClassArm.slice(-1) || "—";
    S("rcStream").textContent = armLetter;

    // ── CLASS POPULATION (TOTAL BOTH ARMS) ────────────────────
    S("rcPopulation").textContent = totalPopulation || armStudents.length || "—";

    // ── SCORES TABLE ────────────────────────────────────────
    if (!scores.length) {
      S("resultTbody").innerHTML = "<tr><td colspan='7' style='text-align:center;padding:12px;color:#94a3b8'>No scores recorded for this term.</td></tr>";
      return;
    }

    // Merge class subjects + student's subjects
    var allSubjectSet = new Set(classSubjects);
    Object.keys(myScores).forEach(function(s){ allSubjectSet.add(s); });
    var subjects = Array.from(allSubjectSet);
    
    // Priority order for subjects
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
    var prioritized = PRIORITY_SUBJECTS.filter(function(s){ return subjects.includes(s); });
    var remaining = subjects.filter(function(s){ return !prioritized.includes(s); }).sort();
    subjects = prioritized.concat(remaining);

    // ── BUILD SCORE TABLE ──────────────────────────────────
    var grandTotal = 0;
    var takenSubjects = [];
    
    S("resultTbody").innerHTML = subjects.map(function(subject) {
      var sc = myScores[subject];
      if (!sc) {
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
      takenSubjects.push(subject);
      
      var d1 = t1 > 0 ? t1 : "—";
      var d2 = t2 > 0 ? t2 : "—";
      var dex = ex > 0 ? ex : "—";
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

    // ── SUMMARY ────────────────────────────────────────────
    var avg = takenSubjects.length > 0
      ? (grandTotal / takenSubjects.length).toFixed(1) : "0";
    var obtainable = takenSubjects.length * 100;
    var posStr = armPos > 0 ? ordinal(armPos) : "—";
    
    S("rcObtainable").textContent = obtainable;
    S("rcPassFail").textContent = "PASS";
    S("rcTotal").textContent = grandTotal;
    S("rcAverage").textContent = avg;
    S("rcPosition").textContent = posStr;
    S("rcInfoPosition").textContent = posStr;
    S("rcOutOf").textContent = totalPopulation || armStudents.length || "—";
    S("rcFees").textContent = getSectionFees(session, scoreClassArm);
    S("rcNextTerm").textContent = formatDate(session.nextTermBegins);

    // ── TRAITS ─────────────────────────────────────────────
    var seed = seedFromReg(reg + term);
    buildTraitsTable("affectiveTbody", AFFECTIVE_TRAITS, seed, 0);
    buildTraitsTable("psychomotorTbody", PSYCHOMOTOR_SKILLS, seed, 100);

    // ── REMARKS ────────────────────────────────────────────
    var remarkText = remark && remark.remark ? remark.remark : "No remark entered yet.";
    S("rcRemark").textContent = remarkText;
    S("rcClosingDate").textContent = formatDate(session.termEndDate);
    S("rcHodDate").textContent = formatDate(session.termEndDate);

    var isSecondary = section === "secondary";
    S("rcHodTitle").textContent = isSecondary ? "Principal's Remarks" : "Head Teacher's Remarks";
    S("rcHodRemark").textContent = selectHodRemark(armPos, session, section);

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

    // ── SHOW RESULT ────────────────────────────────────────
    var loadingState = S("loadingState");
    var resultContent = S("resultContent");
    if (loadingState) loadingState.classList.add("hidden");
    if (resultContent) resultContent.classList.remove("hidden");
    
    console.log("✅ Result rendered successfully");
    
  } catch(e) {
    console.error("❌ renderResult error:", e);
    showError("Failed to render result: " + e.message);
  }
}

// ── Background refresh ────────────────────────────────────────
function refreshInBackground(student, term, currentSession, cacheKey) {
  console.log("🔄 Background refresh started...");
  
  getScoresByStudentTerm(reg, term).then(function(allScoresRaw) {
    var scores = allScoresRaw.filter(function(sc) {
      return !sc.session || sc.session === currentSession;
    });
    
    return Promise.all([
      Promise.resolve(scores),
      getStudentsByClassArm(_scoreClassArm),
      getScoresByClassArmTerm(_scoreClassArm, term)
    ]);
  }).then(function(results) {
    var scores = results[0];
    var armStudents = results[1];
    var allClassScores = results[2];
    
    var classScores = allClassScores.filter(function(s){
      return (!s.session || s.session === currentSession);
    });

    var myScores = {};
    scores.forEach(function(sc) { myScores[sc.subject] = sc; });

    var positionMap = {};
    Object.keys(myScores).forEach(function(subject) {
      var subjectScores = classScores.filter(function(s){ return s.subject === subject; })
        .map(function(s){ return { reg: s.regNumber, total: (s.test1||0)+(s.test2||0)+(s.exam||0) }; })
        .sort(function(a,b){ return b.total - a.total; });
      var idx = subjectScores.findIndex(function(s){ return s.reg === reg; });
      positionMap[subject] = idx >= 0 ? ordinal(idx + 1) : "—";
    });

    var armTotalsMap = {};
    classScores.forEach(function(sc) {
      if (!armTotalsMap[sc.regNumber]) armTotalsMap[sc.regNumber] = 0;
      armTotalsMap[sc.regNumber] += (sc.test1||0) + (sc.test2||0) + (sc.exam||0);
    });
    var armTotalsSorted = Object.keys(armTotalsMap)
      .map(function(r){ return { reg: r, total: armTotalsMap[r] }; })
      .sort(function(a,b){ return b.total - a.total; });
    var armPos = armTotalsSorted.findIndex(function(s){ return s.reg === reg; }) + 1;

    // Get class subjects
    var scoreClassBase = _scoreClassArm.replace(/[AB]$/, "").trim();
    return getClassSubjects(scoreClassBase, term, currentSession).then(function(classSubjects) {
      return {
        scores: scores,
        armStudents: armStudents,
        classScores: classScores,
        positionMap: positionMap,
        armPos: armPos,
        myScores: myScores,
        classSubjects: classSubjects
      };
    });
  }).then(function(data) {
    // Update cache with fresh data
    var cacheData = {
      student: student,
      scores: data.scores,
      classScores: data.classScores,
      positionMap: data.positionMap,
      armPos: data.armPos,
      myScores: data.myScores,
      classSubjects: data.classSubjects,
      armStudents: data.armStudents,
      remark: null,
      section: getSection(_scoreClassArm),
      scoreClassBase: _scoreClassArm.replace(/[AB]$/, "").trim(),
      _scoreClassArm: _scoreClassArm,
      totalPopulation: data.armStudents.length || 0
    };
    
    try {
      localStorage.setItem(cacheKey, JSON.stringify({
        timestamp: Date.now(),
        value: cacheData
      }));
      console.log("🔄 Background refresh complete - cache updated");
    } catch(e) {
      console.warn("Failed to update cache:", e);
    }
  }).catch(function(e) {
    console.warn("Background refresh failed:", e);
  });
}

// ── MAIN LOAD FUNCTION ─────────────────────────────────────────
function loadResult() {
  console.log("🔄 Loading result for:", reg, "Term:", term);
  
  if (!reg || !term) {
    showError("Invalid link. Please go back and try again.");
    return;
  }

  // ── GET SESSION ──────────────────────────────────────────
  getSession().then(function(session) {
    var currentSession = urlSession || session.session || "";
    console.log("📋 Session:", currentSession);

    // ── GET STUDENT ──────────────────────────────────────────
    return getStudentByReg(reg).then(function(student) {
      if (!student) {
        showError("Registration number not found. Please check and try again.");
        return;
      }
      console.log("👤 Student:", student.fullName);

      // ── CHECK APPROVAL ──────────────────────────────────────
      return isResultApproved(student.classArm, term, currentSession).then(function(approved) {
        if (!approved) {
          var loadingState = S("loadingState");
          var notApprovedState = S("notApprovedState");
          var notApprovedClass = S("notApprovedClass");
          if (loadingState) loadingState.classList.add("hidden");
          if (notApprovedState) notApprovedState.classList.remove("hidden");
          if (notApprovedClass) {
            notApprovedClass.textContent = (student.classArm||"") + " — " + (TERM_LABELS[term]||("Term "+term));
          }
          return;
        }

        // ── CHECK CACHE FIRST ──────────────────────────────────
        var scoreCacheKey = "st_cache_scores_" + reg + "_" + term + "_" + currentSession;
        var cachedData = null;
        
        try {
          var cachedItem = localStorage.getItem(scoreCacheKey);
          if (cachedItem) {
            var parsed = JSON.parse(cachedItem);
            if (Date.now() - parsed.timestamp < 300000) {
              cachedData = parsed.value;
              console.log("📦 Loaded result from cache");
            } else {
              localStorage.removeItem(scoreCacheKey);
              console.log("⏰ Cache expired");
            }
          }
        } catch (e) {
          console.warn("Cache read error:", e);
        }
        
        // ── IF CACHE EXISTS, RENDER FROM CACHE ──────────────────
        if (cachedData) {
          console.log("✅ Rendering from cache");
          renderResult(student, session, currentSession, term, cachedData);
          var loadingState = S("loadingState");
          var resultContent = S("resultContent");
          if (loadingState) loadingState.classList.add("hidden");
          if (resultContent) resultContent.classList.remove("hidden");
          
          if (navigator.onLine) {
            refreshInBackground(student, term, currentSession, scoreCacheKey);
          }
          return;
        }

        // ── NO CACHE - LOAD FROM FIRESTORE ──────────────────────
        console.log("🔄 No cache, loading from Firestore...");
        
        if (!navigator.onLine) {
          showError("📴 You are offline. Please connect to the internet to load results for the first time.");
          return;
        }

        // ── LOAD SCORES AND REMARKS ─────────────────────────────
        return Promise.all([
          getScoresByStudentTerm(reg, term),
          getRemarkByStudentTerm(reg, term, currentSession)
        ]).then(function(results) {
          var allScoresRaw = results[0];
          var remark = results[1];
          
          var scores = allScoresRaw.filter(function(sc) {
            return !sc.session || sc.session === currentSession;
          });

          if (!scores.length) {
            console.log("⚠️ No scores found for this student/term");
          }

          _scoreClassArm = scores.length > 0 ? (scores[0].classArm || student.classArm) : student.classArm;
          var section = getSection(_scoreClassArm);
          var scoreClassBase = _scoreClassArm.replace(/[AB]$/, "").trim();

          // ── APPLY GRADING ─────────────────────────────────────────
          if (session.gradeA) _grading.A = session.gradeA;
          if (session.gradeB1) _grading.B1 = session.gradeB1;
          if (session.gradeB2) _grading.B2 = session.gradeB2;
          if (session.gradeC) _grading.C = session.gradeC;
          if (session.gradeD) _grading.D = session.gradeD;
          if (session.gradeF) _grading.F = session.gradeF;

          // ── GET BOTH ARMS FOR POPULATION ──────────────────────
          var baseClass = _scoreClassArm.slice(0, -1);
          var armA = baseClass + "A";
          var armB = baseClass + "B";

          return Promise.all([
            getStudentsByClassArm(armA),
            getStudentsByClassArm(armB),
            getScoresByClassArmTerm(_scoreClassArm, term)
          ]).then(function(results2) {
            var armStudentsA = results2[0];
            var armStudentsB = results2[1];
            var allClassScores = results2[2];
            
            var armStudents = armStudentsA;
            var otherArmStudents = armStudentsB;
            var totalPopulation = armStudentsA.length + armStudentsB.length;
            
            var classScores = allClassScores.filter(function(s){
              return (!s.session || s.session === currentSession);
            });

            var myScores = {};
            scores.forEach(function(sc) { myScores[sc.subject] = sc; });

            // ── PER-SUBJECT POSITION ─────────────────────────────────
            var positionMap = {};
            Object.keys(myScores).forEach(function(subject) {
              var subjectScores = classScores.filter(function(s){ return s.subject === subject; })
                .map(function(s){ return { reg: s.regNumber, total: (s.test1||0)+(s.test2||0)+(s.exam||0) }; })
                .sort(function(a,b){ return b.total - a.total; });
              var idx = subjectScores.findIndex(function(s){ return s.reg === reg; });
              positionMap[subject] = idx >= 0 ? ordinal(idx + 1) : "—";
            });

            // ── OVERALL POSITION ─────────────────────────────────────
            var armTotalsMap = {};
            classScores.forEach(function(sc) {
              if (!armTotalsMap[sc.regNumber]) armTotalsMap[sc.regNumber] = 0;
              armTotalsMap[sc.regNumber] += (sc.test1||0) + (sc.test2||0) + (sc.exam||0);
            });
            var armTotalsSorted = Object.keys(armTotalsMap)
              .map(function(r){ return { reg: r, total: armTotalsMap[r] }; })
              .sort(function(a,b){ return b.total - a.total; });
            var armPos = armTotalsSorted.findIndex(function(s){ return s.reg === reg; }) + 1;

            // ── GET CLASS SUBJECTS ──────────────────────────────────
            return getClassSubjects(scoreClassBase, term, currentSession).then(function(classSubjects) {
              // ── CACHE DATA ──────────────────────────────────────────
              var cacheData = {
                student: student,
                scores: scores,
                classScores: classScores,
                positionMap: positionMap,
                armPos: armPos,
                myScores: myScores,
                classSubjects: classSubjects,
                armStudents: armStudents,
                otherArmStudents: otherArmStudents,
                totalPopulation: totalPopulation,
                remark: remark,
                section: section,
                scoreClassBase: scoreClassBase,
                _scoreClassArm: _scoreClassArm
              };
              
              try {
                localStorage.setItem(scoreCacheKey, JSON.stringify({
                  timestamp: Date.now(),
                  value: cacheData
                }));
                console.log("💾 Cached result for offline use");
              } catch (e) {
                console.warn("Failed to cache result:", e);
              }

              // ── RENDER RESULT ────────────────────────────────────────
              renderResult(student, session, currentSession, term, cacheData);
            });
          });
        });
      });
    });
  }).catch(function(e) {
    console.error("❌ loadResult error:", e);
    showError("Failed to load result. Please check your connection and try again.");
  });
}

// ── START ───────────────────────────────────────────────────────
console.log("🚀 Starting student result load...");
loadResult();

// ── ONLINE/OFFLINE EVENTS ──────────────────────────────────────
window.addEventListener('online', function() {
  console.log("🌐 Internet connection restored");
  toast("🌐 Online. Refresh result for latest data.", "info");
});

window.addEventListener('offline', function() {
  console.log("📴 You are offline");
  toast("📴 Offline. Showing cached data if available.", "warning");
});