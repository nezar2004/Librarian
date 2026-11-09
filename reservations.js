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
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const form = document.querySelector("#reservation-form");
const bookSelect = document.querySelector("#reservation-book");
const status = document.querySelector("#reservation-status");
const login = document.querySelector("#reservation-login");
const list = document.querySelector("#reservation-list");
const results = document.querySelector("#reservation-results");
const labels = { pending: "بانتظار المراجعة", waiting: "بقائمة الانتظار", ready: "جاهز للاستلام", fulfilled: "تم التسليم", cancelled: "ملغى" };
const finalStates = new Set(["cancelled", "fulfilled"]);
let current = null;
let unsubscribe;
let viewVersion = 0;

function render(snapshot, staff) {
  const entries = snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
  entries.sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
  results.replaceChildren();
  if (!entries.length) {
    results.textContent = "ما في طلبات حجز حتى الآن.";
    return;
  }
  for (const item of entries) {
    const card = document.createElement("article");
    card.className = "catalog-card";
    const title = document.createElement("h3");
    title.textContent = item.bookTitle;
    const state = document.createElement("p");
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
        button.disabled = true;
        try {
          const ref = doc(db, "reservations", item.id);
          await runTransaction(db, async transaction => {
            const old = await transaction.get(ref);
            if (!old.exists() || old.data().status !== item.status) throw new Error("تغيّرت حالة الطلب، جرّب مرة ثانية.");
            transaction.update(ref, { status: next, updatedAt: serverTimestamp() });
          });
          status.textContent = "تم تحديث حالة الطلب.";
        } catch {
          status.textContent = "تعذّر تحديث الطلب. حدّث الصفحة وجرّب مرة ثانية.";
          button.disabled = false;
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
  form.hidden = true;
  list.hidden = true;
  if (!user) { status.textContent = "سجّل الدخول حتى تشوف أو تقدّم طلب حجز."; return; }
  try {
    const [librarian, student] = await Promise.all([
      getDoc(doc(db, "librarians", user.uid)).catch(() => null),
      getDoc(doc(db, "students", user.uid)).catch(() => null)
    ]);
    if (version !== viewVersion) return;
    const staff = Boolean(librarian?.exists());
    const studentId = String(student?.data()?.studentId ?? "");
    if (!staff && !studentId) { status.textContent = "هذا الحساب ما إله ملف طالب أو أمين مكتبة."; return; }
    if (!staff) {
      const books = await getDocs(collection(db, "books"));
      if (version !== viewVersion) return;
      bookSelect.replaceChildren(new Option("اختر كتابًا", ""));
      for (const book of books.docs) bookSelect.add(new Option(book.data().title || book.id, book.id));
      const selected = new URLSearchParams(location.search).get("book");
      if ([...bookSelect.options].some(option => option.value === selected)) bookSelect.value = selected;
      form.hidden = false;
    }
    current = { uid: user.uid, staff, studentId };
    status.textContent = staff ? "الطلبات مرتبة من الأقدم للأحدث. جهّز النسخة قبل تغيير الحالة إلى جاهز." : "";
    list.hidden = false;
    document.querySelector("#reservation-list-title").textContent = staff ? "قائمة طلبات الحجز" : "طلباتي";
    const ref = collection(db, "reservations");
    unsubscribe = onSnapshot(staff ? ref : query(ref, where("uid", "==", user.uid)),
      snapshot => render(snapshot, staff), () => { status.textContent = "تعذّر تحميل الطلبات. تحقّق من صلاحيات الحساب."; });
  } catch {
    status.textContent = "تعذّر تحميل صفحة الحجوزات.";
  }
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  const bookId = bookSelect.value;
  const account = current;
  if (!bookId || !account || account.staff) return;
  const button = event.submitter;
  button.disabled = true;
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
    status.textContent = next === "waiting" ? "انضاف طلبك لقائمة الانتظار." : "تم إرسال طلب الحجز.";
  } catch (error) {
    status.textContent = error.code ? "تعذّر إرسال الطلب. تحقّق من صلاحيات حسابك." : error.message;
  } finally {
    button.disabled = false;
  }
});
