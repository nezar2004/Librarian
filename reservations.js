import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, getDoc, getDocs, getFirestore, onSnapshot, query, runTransaction, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {

apiKey: "AIzaSyCkCR-nUCHQYRiLILTdSzCeYn2CTB94ILQ",

authDomain: "laib-64c9b.firebaseapp.com",

projectId: "laib-64c9b",

storageBucket: "laib-64c9b.firebasestorage.app",

messagingSenderId: "429556863392",

appId: "1:429556863392:web:1cffe618fd87b6606914c5"

};
export function startReservations(root, { app = initializeApp(firebaseConfig), role } = {}) {
  const db = getFirestore(app);
  const auth = getAuth(app);
  const form = root.querySelector("#reservation-form");
  const submitButton = form.querySelector('button[type="submit"]');
  const bookSelect = root.querySelector("#reservation-book");
  const status = root.querySelector("#reservation-status");
  const login = root.querySelector("#reservation-login");
  const list = root.querySelector("#reservation-list");
  const results = root.querySelector("#reservation-results");
  const labels = { pending: "بانتظار المراجعة", waiting: "بقائمة الانتظار", ready: "جاهز للاستلام", fulfilled: "تم التسليم", cancelled: "ملغى" };
  const finalStates = new Set(["cancelled", "fulfilled"]);
  let current = null;
  let unsubscribe;
  let viewVersion = 0;

  function showStatus(message, state = "info") {
    status.dataset.state = state;
    status.textContent = message;
    status.hidden = !message;
  }

  function setBusy(button, message) {
    const original = button.textContent;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = message;
    return () => {
      button.textContent = original;
      button.removeAttribute("aria-busy");
      button.disabled = false;
    };
  }

  function render(snapshot, staff) {
    const entries = snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
    entries.sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
    results.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "reservation-empty";
      empty.textContent = "ما في طلبات حجز حتى الآن.";
      results.append(empty);
      return;
    }
    for (const item of entries) {
      const card = document.createElement("article");
      card.className = "catalog-card";
      const title = document.createElement("h3");
      title.textContent = item.bookTitle;
      const state = document.createElement("p");
      state.className = "reservation-badge";
      state.dataset.state = item.status;
      state.textContent = labels[item.status] || "حالة غير معروفة";
      card.append(title, state);
      if (staff && item.studentId) {
        const student = document.createElement("p");
        student.textContent = "رقم الطالب: " + item.studentId;
        card.append(student);
      }
      const actions = staff ? {
        pending: ["ready", "waiting", "cancelled"],
        waiting: ["ready", "cancelled"],
        ready: ["fulfilled", "cancelled"]
      }[item.status] : ["pending", "waiting"].includes(item.status) ? ["cancelled"] : [];
      for (const next of actions || []) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = next === "cancelled" ? "إلغاء الطلب" : labels[next];
        button.addEventListener("click", async () => {
          const restore = setBusy(button, "جاري التحديث…");
          const others = [...card.querySelectorAll("button")].filter(action => action !== button);
          others.forEach(action => { action.disabled = true; });
          const version = viewVersion;
          showStatus("جاري تحديث حالة الطلب…", "pending");
          try {
            const ref = doc(db, "reservations", item.id);
            await runTransaction(db, async transaction => {
              const old = await transaction.get(ref);
              if (!old.exists() || old.data().status !== item.status) throw new Error("تغيّرت حالة الطلب، جرّب مرة ثانية.");
              transaction.update(ref, { status: next, updatedAt: serverTimestamp() });
            });
            if (version === viewVersion) showStatus("تم تحديث حالة الطلب.", "success");
          } catch {
            if (version === viewVersion) showStatus("تعذّر تحديث الطلب. حدّث الصفحة وجرّب مرة ثانية.", "error");
          } finally {
            restore();
            others.forEach(action => { action.disabled = false; });
          }
        });
        card.append(button);
      }
      results.append(card);
    }
  }

  onAuthStateChanged(auth, async user => {
    const version = ++viewVersion;
    unsubscribe?.();
    current = null;
    login.hidden = Boolean(user);
    if (role) {
      login.querySelector('[href="student_login.html"]').hidden = role === "staff";
      login.querySelector('[href="admin_login.html"]').hidden = role === "student";
    }
    form.hidden = true;
    list.hidden = true;
    if (!user) { showStatus("سجّل الدخول حتى تشوف أو تقدّم طلب حجز."); return; }
    showStatus("جاري التحقق من الحساب…", "pending");
    try {
      const [librarian, student] = await Promise.all([
        getDoc(doc(db, "librarians", user.uid)).catch(() => null),
        getDoc(doc(db, "students", user.uid)).catch(() => null)
      ]);
      if (version !== viewVersion) return;
      const staff = Boolean(librarian?.exists());
      const studentId = String(student?.data()?.studentId ?? "");
      if ((role === "staff" && !staff) || (role === "student" && staff)) {
        login.hidden = false;
        showStatus(role === "staff" ? "سجّل الدخول بحساب أمين المكتبة لعرض طلبات الطلاب." : "سجّل الدخول بحساب الطالب لعرض حجوزاتك.", "error");
        return;
      }
      if (!staff && !studentId) { showStatus("هذا الحساب ما إله ملف طالب أو أمين مكتبة.", "error"); return; }
      if (!staff) {
        showStatus("جاري تحميل الكتب المتاحة للحجز…", "pending");
        const books = await getDocs(collection(db, "books"));
        if (version !== viewVersion) return;
        bookSelect.replaceChildren(new Option("اختر كتابًا", ""));
        for (const book of books.docs) bookSelect.add(new Option(book.data().title || book.id, book.id));
        const selected = new URLSearchParams(location.search).get("book");
        if ([...bookSelect.options].some(option => option.value === selected)) bookSelect.value = selected;
        form.hidden = false;
      }
      current = { uid: user.uid, staff, studentId };
      showStatus("جاري تحميل طلبات الحجز…", "pending");
      let initialSnapshot = true;
      list.hidden = false;
      root.querySelector("#reservation-list-title").textContent = staff ? "قائمة طلبات الحجز" : "طلباتي";
      const ref = collection(db, "reservations");
      unsubscribe = onSnapshot(staff ? ref : query(ref, where("uid", "==", user.uid)),
        snapshot => {
          if (version !== viewVersion) return;
          render(snapshot, staff);
          if (initialSnapshot) {
            initialSnapshot = false;
            if (!submitButton.disabled) showStatus(staff ? "الطلبات مرتبة من الأقدم للأحدث. جهّز النسخة قبل تغيير الحالة إلى جاهز." : "");
          }
        }, () => {
          if (version === viewVersion) showStatus("تعذّر تحميل الطلبات. تحقّق من صلاحيات الحساب.", "error");
        });
    } catch {
      if (version === viewVersion) showStatus("تعذّر تحميل صفحة الحجوزات. حدّث الصفحة وجرّب مرة ثانية.", "error");
    }
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const bookId = bookSelect.value;
    const account = current;
    if (!bookId || !account || account.staff || submitButton.disabled) return;
    const restore = setBusy(submitButton, "جاري إرسال الطلب…");
    showStatus("جاري حفظ طلب الحجز…", "pending");
    try {
      const request = doc(db, "reservations", account.uid + "_" + bookId);
      const bookRef = doc(db, "books", bookId);
      const next = await runTransaction(db, async transaction => {
        const [book, existing] = await Promise.all([transaction.get(bookRef), transaction.get(request)]);
        if (!book.exists()) throw new Error("الكتاب لم يعد موجودًا.");
        if (existing.exists() && !finalStates.has(existing.data().status)) throw new Error("عندك طلب مفتوح لهذا الكتاب.");
        const data = book.data();
        const state = Number(data.available) > 0 ? "pending" : "waiting";
        transaction.set(request, { uid: account.uid, studentId: account.studentId, bookId, bookTitle: data.title, status: state, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        return state;
      });
      if (current === account) showStatus(next === "waiting" ? "انضاف طلبك لقائمة الانتظار." : "تم إرسال طلب الحجز.", "success");
    } catch (error) {
      if (current === account) showStatus(error.code ? "تعذّر إرسال الطلب. تحقّق من صلاحيات حسابك." : error.message, "error");
    } finally {
      restore();
    }
  });
}

export async function openReservationPanel(panel, options) {
  if (panel.dataset.loaded) return;
  panel.dataset.loaded = "loading";
  const status = panel.querySelector("[role=status]");
  status.dataset.state = "pending";
  status.textContent = "جاري تحميل الحجوزات…";
  try {
    const response = await fetch("reservations.html?v=portal");
    if (!response.ok) throw new Error("Could not load reservations");
    const page = new DOMParser().parseFromString(await response.text(), "text/html");
    const main = page.querySelector("main");
    if (!main?.querySelector("#reservation-form")) throw new Error("Missing reservations panel");
    const view = document.createElement("div");
    view.append(...main.children);
    startReservations(view, options);
    panel.replaceChildren(view);
    panel.dataset.loaded = "ready";
  } catch {
    delete panel.dataset.loaded;
    status.dataset.state = "error";
    status.textContent = "تعذّر تحميل الحجوزات. افتح القسم مرة ثانية للمحاولة.";
  }
}
