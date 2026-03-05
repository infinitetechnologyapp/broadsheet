// ============================================================
//  firebase.js — BrightSchool Result Broadsheet
// ============================================================
import { initializeApp }                          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, doc,
         getDoc, getDocs, setDoc, updateDoc,
         deleteDoc, query, where,
         writeBatch, serverTimestamp }             from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword,
         signOut, onAuthStateChanged }             from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyDhZXnadVZku6W0QI9Le4lyOUiijrbILM4",
  authDomain:        "broadsheet-a7c4e.firebaseapp.com",
  projectId:         "broadsheet-a7c4e",
  storageBucket:     "broadsheet-a7c4e.firebasestorage.app",
  messagingSenderId: "1035358150017",
  appId:             "1:1035358150017:web:045b86eb8cfa7afaec1c80"
};

const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
const auth = getAuth(app);

export const onAuthChange = cb    => onAuthStateChanged(auth, cb);
export const authLogin    = (e,p) => signInWithEmailAndPassword(auth, e, p);
export const authLogout   = ()    => signOut(auth);

// STUDENTS — subjectsOffered: "all" OR array of subject names
export async function addStudent(data) {
  const reg = data.regNumber.toUpperCase().trim();
  await setDoc(doc(db, "students", reg), {
    ...data, regNumber: reg,
    subjectsOffered: data.subjectsOffered || "all",
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  return reg;
}
export async function updateStudent(reg, data) {
  await updateDoc(doc(db, "students", reg.toUpperCase()), { ...data, updatedAt: serverTimestamp() });
}
// Change regNumber — delete old doc, create new one with new ID
export async function changeStudentReg(oldReg, newReg, data) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "students", oldReg.toUpperCase()));
  batch.set(doc(db, "students", newReg.toUpperCase()), {
    ...data, regNumber: newReg.toUpperCase(),
    updatedAt: serverTimestamp()
  });
  await batch.commit();
}
export async function deleteStudent(reg) { await deleteDoc(doc(db, "students", reg.toUpperCase())); }
export async function getAllStudents() {
  const snap = await getDocs(collection(db, "students"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getStudentByReg(reg) {
  const snap = await getDoc(doc(db, "students", reg.toUpperCase().trim()));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
export async function getStudentsByClass(classBase) {
  const q = query(collection(db, "students"), where("classBase", "==", classBase));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getStudentsByClassArm(classArm) {
  const q = query(collection(db, "students"), where("classArm", "==", classArm));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// SCORES
export async function saveScore(data) {
  const id = `${data.regNumber}_${data.subject}_${data.term}`.replace(/\s+/g, "_");
  await setDoc(doc(db, "scores", id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}
export async function getScoresByClassArmSubjectTerm(classArm, subject, term) {
  const q = query(collection(db, "scores"),
    where("classArm", "==", classArm), where("subject", "==", subject), where("term", "==", String(term)));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getScoresByClassArmTerm(classArm, term) {
  const q = query(collection(db, "scores"),
    where("classArm", "==", classArm), where("term", "==", String(term)));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getScoresByClassTerm(classBase, term) {
  const q = query(collection(db, "scores"),
    where("classBase", "==", classBase), where("term", "==", String(term)));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getScoresByStudentTerm(regNumber, term) {
  const q = query(collection(db, "scores"),
    where("regNumber", "==", regNumber.toUpperCase()), where("term", "==", String(term)));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getSubjectsBySection(section, term) {
  // section: "JS", "SS", or "ALL"
  const allClasses = ["JS 1","JS 2","JS 3","SS 1","SS 2","SS 3"];
  const classes = section === "JS"  ? ["JS 1","JS 2","JS 3"]
                : section === "SS"  ? ["SS 1","SS 2","SS 3"]
                : allClasses;
  const subjectSet = new Set();
  await Promise.all(classes.map(async cls => {
    const id   = `${cls}_${term}`.replace(/\s+/g, "_");
    const snap = await getDoc(doc(db, "classSubjects", id));
    if (snap.exists()) snap.data().subjects.forEach(s => subjectSet.add(s));
  }));
  return [...subjectSet].sort();
}

// CLASS SUBJECTS — stored per classBase shared by both arms
export async function saveClassSubjects(classBase, term, subjects) {
  const id = `${classBase}_${term}`.replace(/\s+/g, "_");
  await setDoc(doc(db, "classSubjects", id), { classBase, term: String(term), subjects, updatedAt: serverTimestamp() });
}
export async function getClassSubjects(classBase, term) {
  const id = `${classBase}_${term}`.replace(/\s+/g, "_");
  const snap = await getDoc(doc(db, "classSubjects", id));
  return snap.exists() ? snap.data().subjects : [];
}

// REMARKS
export async function saveRemark(regNumber, classArm, classBase, term, remark) {
  const id = `${regNumber.toUpperCase()}_${term}`;
  await setDoc(doc(db, "remarks", id),
    { regNumber: regNumber.toUpperCase(), classArm, classBase, term: String(term), remark, updatedAt: serverTimestamp() },
    { merge: true });
}
export async function getRemarksByClassArmTerm(classArm, term) {
  const q = query(collection(db, "remarks"),
    where("classArm", "==", classArm), where("term", "==", String(term)));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getRemarkByStudentTerm(regNumber, term) {
  const snap = await getDoc(doc(db, "remarks", `${regNumber.toUpperCase()}_${term}`));
  return snap.exists() ? snap.data() : null;
}

// RESULT APPROVAL — admin approves per classArm per term
export async function approveResults(classArm, term) {
  const id = `${classArm}_${term}`.replace(/\s+/g, "_");
  await setDoc(doc(db, "approvals", id), { classArm, term: String(term), approved: true, approvedAt: serverTimestamp() });
}
export async function revokeApproval(classArm, term) {
  const id = `${classArm}_${term}`.replace(/\s+/g, "_");
  await setDoc(doc(db, "approvals", id), { classArm, term: String(term), approved: false, revokedAt: serverTimestamp() });
}
export async function isResultApproved(classArm, term) {
  const id = `${classArm}_${term}`.replace(/\s+/g, "_");
  const snap = await getDoc(doc(db, "approvals", id));
  return snap.exists() ? snap.data().approved === true : false;
}
export async function getAllApprovals() {
  const snap = await getDocs(collection(db, "approvals"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// TEACHER ROLES — stored as arrays to avoid dot-in-email Firestore key issue
export async function saveTeachers(formTeachers, subjectTeachers) {
  const ftArray = Object.entries(formTeachers).map(([email, cls]) => ({ email, cls }));
  // Store classArms as comma-separated string — Firestore doesn't support nested arrays
  const stArray = Object.entries(subjectTeachers).map(([email, cfg]) => ({
    email,
    subjects:  (cfg.subjects  || []).join(","),
    classArms: (cfg.classArms || []).join(","),
    section:   cfg.section || ""
  }));
  await setDoc(doc(db, "settings", "teachers"), {
    formTeachers: ftArray, subjectTeachers: stArray, updatedAt: serverTimestamp()
  });
}
export async function getTeachers() {
  const snap = await getDoc(doc(db, "settings", "teachers"));
  if (!snap.exists()) {
    console.log("getTeachers: document does not exist");
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

// SESSION
export async function saveSession(session, term) {
  await setDoc(doc(db, "settings", "session"), { session, currentTerm: String(term), updatedAt: serverTimestamp() });
}
export async function getSession() {
  const snap = await getDoc(doc(db, "settings", "session"));
  return snap.exists() ? snap.data() : { session: "2024/2025", currentTerm: "1" };
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
