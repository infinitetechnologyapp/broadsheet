// ============================================================
//  admin-login.js — BrightSchool Result Broadsheet
// ============================================================
import { authLogin, authLogout, onAuthChange } from "./firebase.js";

// Always sign out when login page loads — fresh login required every time
authLogout().catch(() => {});

// Only redirect to dashboard AFTER a fresh successful login (not on page load)
let freshLogin = false;
onAuthChange(user => {
  if (user && freshLogin) window.location.href = "admin-dashboard.html";
});

const emailEl  = document.getElementById("adminEmail");
const passEl   = document.getElementById("adminPassword");
const loginBtn = document.getElementById("loginBtn");
const errBox   = document.getElementById("loginError");
const errMsg   = document.getElementById("loginErrorMsg");
const togglePw = document.getElementById("togglePw");

// Toggle password visibility
togglePw.addEventListener("click", () => {
  const isText = passEl.type === "text";
  passEl.type  = isText ? "password" : "text";
  togglePw.querySelector("i").className = isText ? "bi bi-eye-slash" : "bi bi-eye";
});

// Hide error on typing
[emailEl, passEl].forEach(el => el.addEventListener("input", () => errBox.classList.add("hidden")));

function showError(msg) {
  errMsg.textContent = msg;
  errBox.classList.remove("hidden");
  errBox.style.animation = "none";
  requestAnimationFrame(() => errBox.style.animation = "shake .4s ease");
}

loginBtn.addEventListener("click", async () => {
  const email = emailEl.value.trim();
  const pass  = passEl.value;
  if (!email || !pass) { showError("Please fill in all fields."); return; }

  loginBtn.disabled = true;
  loginBtn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;display:inline-block;margin-right:8px"></span> Signing in…';

  try {
    freshLogin = true;
    await authLogin(email, pass);
    window.location.href = "admin-dashboard.html";
  } catch(e) {
    const msgs = {
      "auth/user-not-found":     "No account found with this email.",
      "auth/wrong-password":     "Incorrect password. Please try again.",
      "auth/invalid-credential": "Invalid email or password.",
      "auth/too-many-requests":  "Too many attempts. Please try again later.",
    };
    showError(msgs[e.code] || "Login failed. Please check your credentials.");
  } finally {
    loginBtn.disabled = false;
    loginBtn.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Sign In';
  }
});

passEl.addEventListener("keydown", e => { if (e.key === "Enter") loginBtn.click(); });
