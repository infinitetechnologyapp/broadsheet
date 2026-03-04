// ============================================================
//  student.js — BrightSchool Result Broadsheet
//  Loads student result ONLY if admin has approved it
// ============================================================
import {
  getStudentByReg,
  getScoresByStudentTerm,
  getRemarkByStudentTerm,
  getSession,
  isResultApproved,
  getScoresByClassArmSubjectTerm,
  getStudentsByClassArm
} from "./firebase.js";

const S          = id => document.getElementById(id);
const termLabels = { "1":"1st Term", "2":"2nd Term", "3":"3rd Term" };

function getGrade(total) {
  if (total >= 80) return "A";
  if (total >= 60) return "B";
  if (total >= 50) return "C";
  if (total >= 40) return "D";
  return "F";
}
function gradeColor(g) {
  return { A:"#16a34a", B:"#2563eb", C:"#d97706", D:"#ea580c", F:"#dc2626" }[g] || "inherit";
}
function ordinal(n) {
  const s=["th","st","nd","rd"], v=n%100;
  return n+(s[(v-20)%10]||s[v]||s[0]);
}

const params = new URLSearchParams(window.location.search);
const reg    = params.get("reg")?.toUpperCase().trim();
const term   = params.get("term");

async function loadResult() {
  if (!reg || !term) { showError("Invalid link. Please go back and try again."); return; }

  try {
    const [student, session] = await Promise.all([
      getStudentByReg(reg),
      getSession()
    ]);

    if (!student) { showError("Registration number not found. Please check and try again."); return; }

    // ── CLASS APPROVAL CHECK ──────────────────────────────────
    const approved = await isResultApproved(student.classArm, term);
    if (!approved) {
      S("loadingState").classList.add("hidden");
      S("notApprovedState").classList.remove("hidden");
      S("notApprovedClass").textContent = `${student.classArm} — ${termLabels[term]||"Term "+term}`;
      return;
    }

    // Load scores and remark
    const [scores, remark] = await Promise.all([
      getScoresByStudentTerm(reg, term),
      getRemarkByStudentTerm(reg, term)
    ]);

    // Fill student info
    S("rcName").textContent   = student.fullName  || "—";
    S("rcReg").textContent    = student.regNumber || reg;
    S("rcClass").textContent  = student.classArm  || "—";
    S("rcGender").textContent = student.gender    || "—";
    S("rcTerm").textContent   = termLabels[term]  || `Term ${term}`;
    S("rcDate").textContent   = `Printed: ${new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"})}`;
    S("sessionBadge").textContent = `${session.session||"2024/2025"} — ${termLabels[term]||"Term"}`;
    S("rcRemark").textContent = remark?.remark || "No remark entered yet.";

    if (!scores.length) {
      S("resultTbody").innerHTML = `<tr><td colspan="7" class="text-center" style="padding:30px;color:var(--text-muted)">No scores recorded for this term yet.</td></tr>`;
      S("loadingState").classList.add("hidden");
      S("resultContent").classList.remove("hidden");
      return;
    }

    // Group scores by subject
    const myScores = {};
    scores.forEach(sc => { myScores[sc.subject] = sc; });
    const subjects = Object.keys(myScores).sort();

    // Calculate per-subject position within same arm
    const armStudents = await getStudentsByClassArm(student.classArm);
    const armRegs     = armStudents.map(s => s.regNumber);
    const positionMap = {};
    await Promise.all(subjects.map(async subject => {
      const allSc  = await getScoresByClassArmSubjectTerm(student.classArm, subject, term);
      const armSc  = allSc.filter(s => armRegs.includes(s.regNumber));
      const sorted = armSc
        .map(s => ({ reg: s.regNumber, total: (s.test1||0)+(s.test2||0)+(s.exam||0) }))
        .sort((a,b) => b.total - a.total);
      const idx = sorted.findIndex(s => s.reg === reg);
      positionMap[subject] = idx >= 0 ? ordinal(idx + 1) : "—";
    }));

    // Build score rows + grand total
    let grandTotal = 0;
    S("resultTbody").innerHTML = subjects.map(subject => {
      const sc    = myScores[subject];
      const t1    = sc.test1||0, t2 = sc.test2||0, ex = sc.exam||0;
      const total = t1 + t2 + ex;
      const grade = getGrade(total);
      grandTotal += total;
      return `<tr>
        <td style="text-align:left;font-weight:700">${subject}</td>
        <td style="text-align:center">${t1}</td>
        <td style="text-align:center">${t2}</td>
        <td style="text-align:center">${ex}</td>
        <td style="text-align:center;font-weight:800">${total}</td>
        <td style="text-align:center;font-weight:800;color:${gradeColor(grade)}">${grade}</td>
        <td style="text-align:center;font-weight:800;color:var(--primary)">${positionMap[subject]||"—"}</td>
      </tr>`;
    }).join("");

    // Overall position in arm
    const allArmTotals = await Promise.all(
      armStudents.map(async s => {
        const sc  = await getScoresByStudentTerm(s.regNumber, term);
        const tot = sc.reduce((sum,r)=>sum+(r.test1||0)+(r.test2||0)+(r.exam||0),0);
        return { reg: s.regNumber, total: tot };
      })
    );
    const sortedArm = allArmTotals.sort((a,b) => b.total - a.total);
    const armPos    = sortedArm.findIndex(s => s.reg === reg) + 1;
    const posStr    = armPos > 0 ? ordinal(armPos) : "—";
    const avg       = subjects.length > 0 ? (grandTotal / subjects.length).toFixed(1) : "0";

    S("rcTotal").textContent          = grandTotal;
    S("rcAverage").textContent        = avg;
    S("rcSubjectCount").textContent   = subjects.length;
    S("rcPosition").textContent       = posStr;
    S("rcPositionSummary").textContent = posStr;

    S("loadingState").classList.add("hidden");
    S("resultContent").classList.remove("hidden");

    S("downloadPdfBtn").addEventListener("click", () =>
      downloadPDF(student, subjects, myScores, positionMap, grandTotal, avg, posStr, remark, session, term)
    );

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

// ── PDF Download ──────────────────────────────────────────────
function downloadPDF(student, subjects, myScores, positionMap, grandTotal, avg, position, remark, session, term) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
  const indigo=[79,70,229], white=[255,255,255], light=[237,233,254];
  const termLbl = termLabels[term]||`Term ${term}`;

  doc.setFillColor(...indigo);
  doc.rect(0,0,210,42,"F");
  doc.setTextColor(...white);
  doc.setFont("helvetica","bold"); doc.setFontSize(18);
  doc.text("BrightSchool",105,16,{align:"center"});
  doc.setFontSize(9); doc.setFont("helvetica","normal");
  doc.text("Student Report Card",105,23,{align:"center"});
  doc.text(`${session.session||"2024/2025"} — ${termLbl}`,105,30,{align:"center"});

  doc.setFillColor(...light);
  doc.roundedRect(14,48,182,36,3,3,"F");
  doc.setTextColor(30,41,59);
  doc.setFont("helvetica","bold"); doc.setFontSize(10);
  doc.text(student.fullName||"—",20,57);
  doc.setFont("helvetica","normal"); doc.setFontSize(8);
  doc.text(`Reg: ${student.regNumber}`,20,64);
  doc.text(`Class: ${student.classArm}`,20,70);
  doc.text(`Gender: ${student.gender||"—"}`,20,76);
  doc.text(`Term: ${termLbl}`,100,64);
  doc.text(`Position: ${position}`,100,70);
  doc.text(`Average: ${avg}%`,100,76);

  const rows = subjects.map(subject => {
    const sc    = myScores[subject];
    const t1    = sc.test1||0, t2=sc.test2||0, ex=sc.exam||0;
    const total = t1+t2+ex;
    return [subject,t1,t2,ex,total,getGrade(total),positionMap[subject]||"—"];
  });

  doc.autoTable({
    startY:90,
    head:[["Subject","1st Test\n/20","2nd Test\n/20","Exam\n/60","Total\n/100","Grade","Position"]],
    body:rows,
    foot:[[`Grand Total: ${grandTotal}`,"","","","",`Avg: ${avg}`,`Pos: ${position}`]],
    theme:"grid",
    headStyles:{fillColor:indigo,textColor:white,fontStyle:"bold",fontSize:8,halign:"center"},
    bodyStyles:{fontSize:8,halign:"center"},
    footStyles:{fillColor:light,textColor:indigo,fontStyle:"bold",fontSize:8},
    columnStyles:{0:{halign:"left",fontStyle:"bold"}},
    styles:{font:"helvetica",cellPadding:3}
  });

  const finalY = doc.lastAutoTable.finalY+8;
  doc.setFillColor(248,250,252);
  doc.roundedRect(14,finalY,182,18,2,2,"F");
  doc.setDrawColor(...indigo); doc.setLineWidth(0.8);
  doc.line(14,finalY,14,finalY+18);
  doc.setFont("helvetica","italic"); doc.setFontSize(8); doc.setTextColor(100,116,139);
  doc.text("Form Teacher's Remark:",18,finalY+7);
  doc.setFont("helvetica","normal"); doc.setTextColor(30,41,59);
  doc.text(remark?.remark||"No remark entered.",18,finalY+13);

  doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(150,150,150);
  doc.text("Generated by BrightSchool Result System",14,290);
  doc.text(new Date().toLocaleDateString("en-GB"),196,290,{align:"right"});
  doc.save(`${student.regNumber}_${termLbl.replace(/ /g,"_")}_Result.pdf`);
}

loadResult();
