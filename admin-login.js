// ============================================================
//  admin-login.js — BrightSchool Result Broadsheet
//  Sign In + Sign Up with pending approval flow
// ============================================================
import { authLogin, authLogout, onAuthChange, createAccount, savePendingUser } from "./firebase.js";

// Always sign out when login page loads
authLogout().catch(() => {});

let freshLogin = false;
onAuthChange(user => {
  if (user && freshLogin) window.location.href = "admin-dashboard.html";
});

// ── Tab switcher ──────────────────────────────────────────────
window.switchTab = function(tab) {
  const loginForm    = document.getElementById("loginForm");
  const signupForm   = document.getElementById("signupForm");
  const tabLoginBtn  = document.getElementById("tabLoginBtn");
  const tabSignupBtn = document.getElementById("tabSignupBtn");
  if (tab === "login") {
    loginForm.style.display  = "block";
    signupForm.style.display = "none";
    tabLoginBtn.style.background  = "var(--primary)";
    tabLoginBtn.style.color       = "#fff";
    tabSignupBtn.style.background = "#f1f5f9";
    tabSignupBtn.style.color      = "var(--text-muted)";
  } else {
    loginForm.style.display  = "none";
    signupForm.style.display = "block";
    tabSignupBtn.style.background = "var(--primary)";
    tabSignupBtn.style.color      = "#fff";
    tabLoginBtn.style.background  = "#f1f5f9";
    tabLoginBtn.style.color       = "var(--text-muted)";
  }
};

// ── LOGIN ─────────────────────────────────────────────────────
const emailEl   = document.getElementById("adminEmail");
const passEl    = document.getElementById("adminPassword");
const loginBtn  = document.getElementById("loginBtn");
const errBox    = document.getElementById("loginError");
const errMsg    = document.getElementById("loginErrorMsg");
const togglePw  = document.getElementById("togglePw");

togglePw.addEventListener("click", () => {
  const isText = passEl.type === "text";
  passEl.type  = isText ? "password" : "text";
  togglePw.querySelector("i").className = isText ? "bi bi-eye-slash" : "bi bi-eye";
});

[emailEl, passEl].forEach(el => el.addEventListener("input", () => errBox.classList.add("hidden")));

function showLoginError(msg) {
  errMsg.textContent = msg;
  errBox.classList.remove("hidden");
  errBox.style.animation = "none";
  requestAnimationFrame(() => errBox.style.animation = "shake .4s ease");
}

loginBtn.addEventListener("click", async () => {
  const email = emailEl.value.trim();
  const pass  = passEl.value;
  if (!email || !pass) { showLoginError("Please fill in all fields."); return; }
  loginBtn.disabled = true;
  loginBtn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;display:inline-block;margin-right:8px"></span> Signing in...';
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
    showLoginError(msgs[e.code] || "Login failed. Please check your credentials.");
  } finally {
    loginBtn.disabled = false;
    loginBtn.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Sign In';
  }
});

passEl.addEventListener("keydown", e => { if (e.key === "Enter") loginBtn.click(); });

// ── SIGN UP ───────────────────────────────────────────────────
const signupBtn      = document.getElementById("signupBtn");
const signupErrBox   = document.getElementById("signupError");
const signupErrMsg   = document.getElementById("signupErrorMsg");
const signupSuccess  = document.getElementById("signupSuccess");
const toggleSignupPw = document.getElementById("toggleSignupPw");
const signupPassEl   = document.getElementById("signupPassword");

toggleSignupPw.addEventListener("click", () => {
  const isText = signupPassEl.type === "text";
  signupPassEl.type = isText ? "password" : "text";
  toggleSignupPw.querySelector("i").className = isText ? "bi bi-eye-slash" : "bi bi-eye";
});

function showSignupError(msg) {
  signupErrMsg.textContent = msg;
  signupErrBox.classList.remove("hidden");
  signupSuccess.classList.add("hidden");
}

signupBtn.addEventListener("click", async () => {
  const name     = document.getElementById("signupName").value.trim();
  const email    = document.getElementById("signupEmail").value.trim().toLowerCase();
  const password = document.getElementById("signupPassword").value;
  const confirm  = document.getElementById("signupConfirm").value;

  if (!name)               { showSignupError("Enter your full name."); return; }
  if (!email)              { showSignupError("Enter your email address."); return; }
  if (password.length < 6) { showSignupError("Password must be at least 6 characters."); return; }
  if (password !== confirm) { showSignupError("Passwords do not match."); return; }

  signupBtn.disabled = true;
  signupBtn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;display:inline-block;margin-right:8px"></span> Creating account...';
  signupErrBox.classList.add("hidden");

  try {
    const user = await createAccount(email, password);
    await savePendingUser({ uid: user.uid, name, email, status: "pending", createdAt: new Date().toISOString() });
    await authLogout();
    signupSuccess.classList.remove("hidden");
    signupErrBox.classList.add("hidden");
    document.getElementById("signupName").value     = "";
    document.getElementById("signupEmail").value    = "";
    document.getElementById("signupPassword").value = "";
    document.getElementById("signupConfirm").value  = "";
  } catch(e) {
    const msgs = {
      "auth/email-already-in-use": "An account with this email already exists.",
      "auth/invalid-email":        "Invalid email address.",
      "auth/weak-password":        "Password is too weak. Use at least 6 characters.",
    };
    showSignupError(msgs[e.code] || "Sign up failed: " + e.message);
  } finally {
    signupBtn.disabled = false;
    signupBtn.innerHTML = '<i class="bi bi-person-plus-fill"></i> Create Account';
  }
});
