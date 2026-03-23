// ============================================================
//  firebase.js — BrightSchool Result Broadsheet
// ============================================================
import { initializeApp }                          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, doc,
         getDoc, getDocs, setDoc, updateDoc,
         deleteDoc, query, where,
         writeBatch, serverTimestamp,
         enableIndexedDbPersistence }             from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword,
         createUserWithEmailAndPassword,
         signOut, onAuthStateChanged,
         browserLocalPersistence, setPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyDhZXnadVZku6W0QI9Le4lyOUiijrbILM4",
  authDomain:        "broadsheet-a7c4e.firebaseapp.com",
  projectId:         "broadsheet-a7c4e",
  storageBucket:     "broadsheet-a7c4e.firebasestorage.app",
  messagingSenderId: "1035358150017",
  appId:             "1:1035358150017:web:045b86eb8cfa7afaec1c80"
};

const app  = initializeApp(firebaseConfig);
export const db              = getFirestore(app);
export const firestoreDoc    = doc;
export const firestoreGetDoc = getDoc;
export const firestoreCollection = collection;
export const firestoreGetDocs    = getDocs;
const auth = getAuth(app);

// Set Auth persistence to LOCAL — user stays logged in
// even after closing the browser or losing internet briefly
// This is the key fix for the repeated logout problem
setPersistence(auth, browserLocalPersistence).catch(function(err) {
  console.warn("Auth persistence not set:", err);
});

// Enable offline persistence — auth + data loads from cache on poor network
enableIndexedDbPersistence(db).catch(function(err) {
  if (err.code === "failed-precondition") {
    // Multiple tabs open — persistence only works in one tab at a time
    console.warn("Offline persistence unavailable: multiple tabs open.");
  } else if (err.code === "unimplemented") {
    // Browser doesn't support persistence
    console.warn("Offline persistence not supported in this browser.");
  }
});

export const onAuthChange = cb    => onAuthStateChanged(auth, cb);
export const authLogin    = (e,p) => signInWithEmailAndPassword(auth, e, p);
export const authLogout   = ()    => signOut(auth);
export const createAccount = (e,p) => createUserWithEmailAndPassword(auth, e, p).then(r => r.user);

// PENDING USERS — teachers who signed up and await role assignment
export async function savePendingUser(data) {
  await setDoc(doc(db, "pendingUsers", data.uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}
export async function getPendingUsers() {
  const q    = query(collection(db, "pendingUsers"), where("status", "==", "pending"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function approvePendingUser(uid) {
  await setDoc(doc(db, "pendingUsers", uid), { status: "approved", approvedAt: serverTimestamp() }, { merge: true });
}

// STUDENTS — subjectsOffered: "all" OR array of subject names
// STUDENT STATUS:
// "active"      — currently enrolled (default for all existing students)
// "graduated"   — completed SS 3, left school
// "transferred" — left school before graduating
// "inactive"    — removed/soft-deleted (data preserved forever)

export async function addStudent(data) {
  const reg = data.regNumber.toUpperCase().trim();
  await setDoc(doc(db, "students", reg), {
    ...data, regNumber: reg,
    subjectsOffered: data.subjectsOffered || "all",
    status: data.status || "active",
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  return reg;
}
export async function updateStudent(reg, data) {
  await updateDoc(doc(db, "students", reg.toUpperCase()), { ...data, updatedAt: serverTimestamp() });
}
// Soft delete — NEVER hard deletes, preserves all related data
// Sets status to "inactive" so student disappears from active lists
// but ALL scores, attendance, remarks remain intact in Firestore
export async function deleteStudent(reg) {
  await updateDoc(doc(db, "students", reg.toUpperCase()), {
    status: "inactive",
    inactiveAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}
// Restore a soft-deleted student back to active
export async function restoreStudent(reg) {
  await updateDoc(doc(db, "students", reg.toUpperCase()), {
    status: "active",
    updatedAt: serverTimestamp()
  });
}
// Graduate student — marks as graduated with graduation session
export async function graduateStudent(reg, session) {
  await updateDoc(doc(db, "students", reg.toUpperCase()), {
    status: "graduated",
    graduationSession: session || "",
    updatedAt: serverTimestamp()
  });
}
// Transfer student out of school
export async function transferStudent(reg, session) {
  await updateDoc(doc(db, "students", reg.toUpperCase()), {
    status: "transferred",
    transferSession: session || "",
    updatedAt: serverTimestamp()
  });
}
export async function getAllStudents() {
  const snap = await getDocs(collection(db, "students"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
// Get only active students (default for all normal views)
export async function getActiveStudents() {
  // Include students with status=active OR no status field (old records)
  const snap = await getDocs(collection(db, "students"));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(function(s){ return !s.status || s.status === "active"; });
}
// Get alumni — graduated students
export async function getAlumniStudents() {
  const q = query(collection(db, "students"), where("status", "==", "graduated"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
// Get inactive/removed students
export async function getInactiveStudents() {
  const q = query(collection(db, "students"), where("status", "==", "inactive"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getStudentByReg(reg) {
  const snap = await getDoc(doc(db, "students", reg.toUpperCase().trim()));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
export async function getStudentsByClass(classBase) {
  const q = query(collection(db, "students"), where("classBase", "==", classBase));
  const snap = await getDocs(q);
  // Return only active students
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(function(s){ return !s.status || s.status === "active"; });
}
export async function getStudentsByClassArm(classArm) {
  const q = query(collection(db, "students"), where("classArm", "==", classArm));
  const snap = await getDocs(q);
  // Return only active students
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(function(s){ return !s.status || s.status === "active"; });
}
// Updates: students, scores, remarks, attendance
export async function changeStudentReg(oldReg, newReg, data) {
  var oldR = oldReg.toUpperCase();
  var newR = newReg.toUpperCase();

  // 1. Update student document
  var batch = writeBatch(db);
  batch.delete(doc(db, "students", oldR));
  batch.set(doc(db, "students", newR), {
    ...data, regNumber: newR, updatedAt: serverTimestamp()
  });
  await batch.commit();

  // 2. Migrate SCORES
  var scoresSnap = await getDocs(query(collection(db, "scores"), where("regNumber", "==", oldR)));
  if (!scoresSnap.empty) {
    await Promise.all(scoresSnap.docs.map(async function(d) {
      var oldData = d.data();
      var sessionPart = (oldData.session || "").replace(/\//g, "-").replace(/\s+/g, "_");
      var newId = (newR + "_" + (oldData.subject||"") + "_" + (oldData.term||"") + (sessionPart ? "_" + sessionPart : "")).replace(/\s+/g, "_");
      await setDoc(doc(db, "scores", newId), Object.assign({}, oldData, { regNumber: newR, updatedAt: serverTimestamp() }), { merge: true });
      await deleteDoc(doc(db, "scores", d.id));
    }));
  }

  // 3. Migrate REMARKS
  var remarksSnap = await getDocs(query(collection(db, "remarks"), where("regNumber", "==", oldR)));
  if (!remarksSnap.empty) {
    await Promise.all(remarksSnap.docs.map(async function(d) {
      var oldData = d.data();
      var sessionPart = (oldData.session || "").replace(/\//g, "-").replace(/\s+/g, "_");
      var newId = newR + "_" + (oldData.term||"") + (sessionPart ? "_" + sessionPart : "");
      await setDoc(doc(db, "remarks", newId), Object.assign({}, oldData, { regNumber: newR, updatedAt: serverTimestamp() }), { merge: true });
      await deleteDoc(doc(db, "remarks", d.id));
    }));
  }

  // 4. Migrate ATTENDANCE
  var attSnap = await getDocs(query(collection(db, "attendance"), where("regNumber", "==", oldR)));
  if (!attSnap.empty) {
    await Promise.all(attSnap.docs.map(async function(d) {
      var oldData = d.data();
      var newId = newR + "_" + (oldData.date||"");
      await setDoc(doc(db, "attendance", newId), Object.assign({}, oldData, { regNumber: newR, updatedAt: serverTimestamp() }), { merge: true });
      await deleteDoc(doc(db, "attendance", d.id));
    }));
  }

  return {
    scores:     scoresSnap.size,
    remarks:    remarksSnap.size,
    attendance: attSnap.size
  };
}
// Change regNumber — migrates ALL related data to new reg number

// SCORES
export async function saveScore(data) {
  // Include session in ID so different sessions don't overwrite each other
  var sessionPart = (data.session || "").replace(/\//g, "-").replace(/\s+/g, "_");
  var id = (data.regNumber + "_" + data.subject + "_" + data.term + (sessionPart ? "_" + sessionPart : "")).replace(/\s+/g, "_");
  await setDoc(doc(db, "scores", id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}
export async function deleteScoreById(id) {
  await deleteDoc(doc(db, "scores", id));
}
export async function getScoresByClassArmSubjectTerm(classArm, subject, term, session) {
  var q;
  if (session) {
    q = query(collection(db, "scores"),
      where("classArm", "==", classArm), where("subject", "==", subject),
      where("term", "==", String(term)), where("session", "==", session));
  } else {
    q = query(collection(db, "scores"),
      where("classArm", "==", classArm), where("subject", "==", subject),
      where("term", "==", String(term)));
  }
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getScoresByClassArmTerm(classArm, term, session) {
  var q;
  if (session) {
    q = query(collection(db, "scores"),
      where("classArm", "==", classArm), where("term", "==", String(term)),
      where("session", "==", session));
  } else {
    q = query(collection(db, "scores"),
      where("classArm", "==", classArm), where("term", "==", String(term)));
  }
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getScoresByClassTerm(classBase, term, session) {
  var q;
  if (session) {
    q = query(collection(db, "scores"),
      where("classBase", "==", classBase), where("term", "==", String(term)),
      where("session", "==", session));
  } else {
    q = query(collection(db, "scores"),
      where("classBase", "==", classBase), where("term", "==", String(term)));
  }
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getScoresByStudentTerm(regNumber, term, session) {
  var q;
  if (session) {
    q = query(collection(db, "scores"),
      where("regNumber", "==", regNumber.toUpperCase()),
      where("term", "==", String(term)), where("session", "==", session));
  } else {
    q = query(collection(db, "scores"),
      where("regNumber", "==", regNumber.toUpperCase()),
      where("term", "==", String(term)));
  }
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function tagAllUntaggedScores(session) {
  // Fetch ALL score docs that have NO session field
  // This runs when Admin saves session settings — guarantees no old score bleeds into new session
  var snap = await getDocs(collection(db, "scores"));
  var untagged = snap.docs.filter(function(d) {
    var data = d.data();
    return !data.session || data.session === "";
  });
  if (!untagged.length) return { tagged: 0 };
  // Tag each one: save new doc with session, delete old doc
  await Promise.all(untagged.map(async function(d) {
    var data = d.data();
    var sessionPart = session.replace(/\//g, "-").replace(/\s+/g, "_");
    var newId = (d.id + "_" + sessionPart).replace(/\s+/g, "_");
    // Save new doc with session field
    await setDoc(doc(db, "scores", newId), Object.assign({}, data, { session: session, updatedAt: serverTimestamp() }), { merge: true });
    // Delete old untagged doc
    await deleteDoc(doc(db, "scores", d.id));
  }));
  return { tagged: untagged.length };
}

export async function getSubjectsBySection(section, term) {
  // section: "JS", "SS", or "ALL"
  const allClasses = ["JS 1","JS 2","JS 3","SS 1","SS 2","SS 3"];
  const classes = section === "JS"  ? ["JS 1","JS 2","JS 3"]
                : section === "SS"  ? ["SS 1","SS 2","SS 3"]
                : allClasses;
  const subjectSet = new Set();
  await Promise.all(classes.map(async cls => {
    var id   = (cls + "_" + term).replace(/\s+/g, "_");
    const snap = await getDoc(doc(db, "classSubjects", id));
    if (snap.exists()) snap.data().subjects.forEach(s => subjectSet.add(s));
  }));
  return [...subjectSet].sort();
}

// CLASS SUBJECTS — stored per classBase shared by both arms
// SUBJECTS — include session in ID so each session/term has its own subject list
export async function saveClassSubjects(classBase, term, subjects, session) {
  var sessionPart = (session || "").replace(/\//g, "-").replace(/\s+/g, "_");
  var id = (classBase + "_" + term + (sessionPart ? "_" + sessionPart : "")).replace(/\s+/g, "_");
  await setDoc(doc(db, "classSubjects", id), { classBase: classBase, term: String(term), session: session||"", subjects: subjects, updatedAt: serverTimestamp() }, { merge: true });
}
export async function getClassSubjects(classBase, term, session) {
  // Try session-specific first, fall back to untagged (old data)
  if (session) {
    var sessionPart = session.replace(/\//g, "-").replace(/\s+/g, "_");
    var id = (classBase + "_" + term + "_" + sessionPart).replace(/\s+/g, "_");
    const snap = await getDoc(doc(db, "classSubjects", id));
    if (snap.exists()) return snap.data().subjects || [];
  }
  // Fallback — old doc without session in ID
  var oldId = (classBase + "_" + term).replace(/\s+/g, "_");
  const oldSnap = await getDoc(doc(db, "classSubjects", oldId));
  return oldSnap.exists() ? oldSnap.data().subjects || [] : [];
}

// REMARKS — include session in ID so each session/term has its own remarks
export async function saveRemark(regNumber, classArm, classBase, term, remark, session) {
  var sessionPart = (session || "").replace(/\//g, "-").replace(/\s+/g, "_");
  var id = regNumber.toUpperCase() + "_" + term + (sessionPart ? "_" + sessionPart : "");
  await setDoc(doc(db, "remarks", id),
    { regNumber: regNumber.toUpperCase(), classArm: classArm, classBase: classBase, term: String(term), session: session||"", remark: remark, updatedAt: serverTimestamp() },
    { merge: true });
}
export async function getRemarksByClassArmTerm(classArm, term, session) {
  var q;
  if (session) {
    q = query(collection(db, "remarks"),
      where("classArm", "==", classArm), where("term", "==", String(term)), where("session", "==", session));
  } else {
    q = query(collection(db, "remarks"),
      where("classArm", "==", classArm), where("term", "==", String(term)));
  }
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getRemarkByStudentTerm(regNumber, term, session) {
  // Try session-specific first, fall back to old untagged doc
  if (session) {
    var sessionPart = session.replace(/\//g, "-").replace(/\s+/g, "_");
    var id = regNumber.toUpperCase() + "_" + term + "_" + sessionPart;
    const snap = await getDoc(doc(db, "remarks", id));
    if (snap.exists()) return snap.data();
  }
  // Fallback — old doc without session
  var oldId = regNumber.toUpperCase() + "_" + term;
  const oldSnap = await getDoc(doc(db, "remarks", oldId));
  return oldSnap.exists() ? oldSnap.data() : null;
}

// RESULT APPROVAL — include session in ID so each session/term has its own approval
export async function approveResults(classArm, term, session) {
  var sessionPart = (session || "").replace(/\//g, "-").replace(/\s+/g, "_");
  var id = (classArm + "_" + term + (sessionPart ? "_" + sessionPart : "")).replace(/\s+/g, "_");
  await setDoc(doc(db, "approvals", id), { classArm: classArm, term: String(term), session: session||"", approved: true, approvedAt: serverTimestamp() }, { merge: true });
}
export async function revokeApproval(classArm, term, session) {
  var sessionPart = (session || "").replace(/\//g, "-").replace(/\s+/g, "_");
  var id = (classArm + "_" + term + (sessionPart ? "_" + sessionPart : "")).replace(/\s+/g, "_");
  await setDoc(doc(db, "approvals", id), { classArm: classArm, term: String(term), session: session||"", approved: false, revokedAt: serverTimestamp() }, { merge: true });
}
export async function isResultApproved(classArm, term, session) {
  if (session) {
    var sessionPart = session.replace(/\//g, "-").replace(/\s+/g, "_");
    var id = (classArm + "_" + term + "_" + sessionPart).replace(/\s+/g, "_");
    const snap = await getDoc(doc(db, "approvals", id));
    if (snap.exists()) return snap.data().approved === true;
  }
  // Fallback — old doc without session
  var oldId = (classArm + "_" + term).replace(/\s+/g, "_");
  const oldSnap = await getDoc(doc(db, "approvals", oldId));
  return oldSnap.exists() ? oldSnap.data().approved === true : false;
}
export async function getAllApprovals(session) {
  var q;
  if (session) {
    q = query(collection(db, "approvals"), where("session", "==", session));
  } else {
    q = query(collection(db, "approvals"));
  }
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// TEACHER ROLES — stored as arrays to avoid dot-in-email Firestore key issue
export async function saveTeachers(formTeachers, subjectTeachers) {
  const ftArray = Object.entries(formTeachers).map(([email, cls]) => ({ email, cls }));
  const stArray = Object.entries(subjectTeachers).map(([email, cfg]) => ({
    email,
    subjects:  (cfg.subjects  || []).join(","),
    classArms: (cfg.classArms || []).join(","),
    section:   cfg.section || ""
  }));
  await setDoc(doc(db, "settings", "teachers"), {
    formTeachers: ftArray, subjectTeachers: stArray, updatedAt: serverTimestamp()
  }, { merge: true });
  console.log("saveTeachers ✓ — FT:", ftArray.length, "ST:", stArray.length);
}
export async function getTeachers() {
  const snap = await getDoc(doc(db, "settings", "teachers"));
  if (!snap.exists()) {
    console.log("getTeachers: no document found");
    return { formTeachers: {}, subjectTeachers: {} };
  }
  const raw = snap.data();
  console.log("getTeachers raw:", JSON.stringify(raw));
  const ft = {}, st = {};
  (raw.formTeachers || []).forEach(t => {
    if (t.email) ft[t.email.toLowerCase().trim()] = t.cls;
  });
  (raw.subjectTeachers || []).forEach(t => {
    if (t.email) {
      st[t.email.toLowerCase().trim()] = {
        subjects:  t.subjects  ? t.subjects.split(",").map(s => s.trim()).filter(Boolean)  : [],
        classArms: t.classArms ? t.classArms.split(",").map(s => s.trim()).filter(Boolean) : [],
        section:   t.section || ""
      };
    }
  });
  console.log("getTeachers parsed — FT:", JSON.stringify(ft), "ST:", JSON.stringify(st));
  return { formTeachers: ft, subjectTeachers: st };
}

// TEACHER NAMES — display names for existing teachers (admin sets these)
export async function saveTeacherNames(namesMap) {
  // namesMap: { "email@x.com": "Full Name", ... }
  await setDoc(doc(db, "settings", "teacherNames"), { names: namesMap, updatedAt: serverTimestamp() }, { merge: true });
}
export async function getTeacherNames() {
  const snap = await getDoc(doc(db, "settings", "teacherNames"));
  return snap.exists() ? (snap.data().names || {}) : {};
}

// SESSION
export async function saveSession(session, term, schoolName, schoolLogo, termStartDate, termEndDate) {
  const data = { session, currentTerm: String(term), updatedAt: serverTimestamp() };
  if (schoolName     !== undefined) data.schoolName     = schoolName;
  if (schoolLogo     !== undefined) data.schoolLogo     = schoolLogo;
  if (termStartDate  !== undefined) data.termStartDate  = termStartDate;
  if (termEndDate    !== undefined) data.termEndDate    = termEndDate;
  await setDoc(doc(db, "settings", "session"), data, { merge: true });
}
export async function getSession() {
  const snap = await getDoc(doc(db, "settings", "session"));
  return snap.exists() ? snap.data() : { session: "2024/2025", currentTerm: "1", schoolName: "", schoolLogo: "", termStartDate: "", termEndDate: "" };
}

// TERM RESET
export async function resetTermData(term) {
  const termStr = String(term);
  for (const col of ["scores", "remarks", "approvals"]) {
    const q = query(collection(db, col), where("term", "==", termStr));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  }
}

// ATTENDANCE
export async function saveAttendance(data) {
  // id: regNumber_date e.g. "RAS101_2026-03-18"
  const id = data.regNumber.toUpperCase() + "_" + data.date;
  await setDoc(doc(db, "attendance", id), {
    ...data, regNumber: data.regNumber.toUpperCase(), updatedAt: serverTimestamp()
  }, { merge: true });
}
export async function getAttendanceByClassBaseTerm(classBase, term, session) {
  const q = query(collection(db, "attendance"),
    where("classBase", "==", classBase), where("term", "==", String(term)), where("session", "==", session));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getAttendanceByClassDate(classArm, date) {
  const q = query(collection(db, "attendance"),
    where("classArm", "==", classArm), where("date", "==", date));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getAttendanceByClassTerm(classArm, term, session) {
  const q = query(collection(db, "attendance"),
    where("classArm", "==", classArm), where("term", "==", String(term)), where("session", "==", session));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getAllAttendanceByTerm(term, session) {
  const q = query(collection(db, "attendance"),
    where("term", "==", String(term)), where("session", "==", session));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getAttendanceByStudent(regNumber, term, session) {
  const q = query(collection(db, "attendance"),
    where("regNumber", "==", regNumber.toUpperCase()),
    where("term", "==", String(term)), where("session", "==", session));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// HOLIDAYS — admin marks holidays per term/session
export async function saveHoliday(date, session, term, label) {
  var id = session.replace(/\//g,"-") + "_" + term + "_" + date;
  await setDoc(doc(db, "holidays", id), { date: date, session: session, term: String(term), label: label||"Holiday", createdAt: serverTimestamp() }, { merge: true });
}
export async function deleteHoliday(date, session, term) {
  var id = session.replace(/\//g,"-") + "_" + term + "_" + date;
  await deleteDoc(doc(db, "holidays", id));
}
export async function getHolidays(session, term) {
  const q = query(collection(db, "holidays"),
    where("session", "==", session), where("term", "==", String(term)));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// RECORD BANK — archive a term snapshot (admin only)
export async function archiveTermRecord(session, term, data) {
  var id = session.replace(/\//g,"-") + "_" + term;
  await setDoc(doc(db, "recordBank", id), Object.assign({}, data, { session: session, term: String(term), archivedAt: serverTimestamp() }), { merge: true });
}
export async function getRecordBankList() {
  const snap = await getDocs(collection(db, "recordBank"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getRecordBankEntry(session, term) {
  var id = session.replace(/\//g,"-") + "_" + term;
  const snap = await getDoc(doc(db, "recordBank", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// BULK FIX: Normalize classArm on all students from "JS 1 A" → "JS 1A"
export async function fixAllStudentClassArms() {
  const snap = await getDocs(collection(db, "students"));
  let fixed = 0, already = 0;
  const batch = writeBatch(db);
  snap.docs.forEach(d => {
    const data = d.data();
    // Normalise: classBase (e.g. "JS 1") + arm letter (e.g. "A") = "JS 1A"
    const cls  = (data.classBase || "").trim();
    const arm  = (data.arm || "").trim();
    const correct = cls + arm;   // "JS 1A" — no extra space
    if (data.classArm !== correct && cls && arm) {
      batch.update(d.ref, { classArm: correct });
      fixed++;
    } else {
      already++;
    }
  });
  if (fixed > 0) await batch.commit();
  return { fixed, already };
}
