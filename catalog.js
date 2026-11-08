import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { collection, getDocs, getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { normalizeText, normalizeISBN, shelfLabel } from "./book-tools.js";

const firebaseConfig = {

apiKey: "AIzaSyCkCR-nUCHQYRiLILTdSzCeYn2CTB94ILQ",

authDomain: "laib-64c9b.firebaseapp.com",

projectId: "laib-64c9b",

storageBucket: "laib-64c9b.firebasestorage.app",

messagingSenderId: "429556863392",

appId: "1:429556863392:web:1cffe618fd87b6606914c5"

};
const db = getFirestore(initializeApp(firebaseConfig));
const search = document.querySelector("#catalog-search");
const availability = document.querySelector("#catalog-availability");
const status = document.querySelector("#catalog-status");
const results = document.querySelector("#catalog-results");
const more = document.querySelector("#catalog-more");
const pageSize = 24;
let books = [];
let shown = pageSize;

function addText(parent, tag, text, className) {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  parent.append(el);
}

function render() {
  const term = normalizeText(search.value);
  const isbn = normalizeISBN(search.value);
  const filtered = books.filter(book => {
    const matches = !term || [book.title, book.author].some(value => normalizeText(value).includes(term))
      || (isbn && normalizeISBN(book.isbn).includes(isbn));
    const inStock = Number(book.available) > 0;
    return matches && (!availability.value || inStock === (availability.value === "available"));
  });
  results.replaceChildren();
  for (const book of filtered.slice(0, shown)) {
    const card = document.createElement("article");
    card.className = "catalog-card";
    addText(card, "p", book.category || "كتاب", "catalog-kicker");
    addText(card, "h2", book.title || "بدون عنوان");
    addText(card, "p", book.author || "المؤلف غير محدد");
    const count = Number(book.available);
    const known = book.available != null && book.available !== "" && Number.isFinite(count);
    addText(card, "p", !known ? "التوفّر غير محدد" : count > 0 ? "متاح: " + count : "غير متاح حاليًا", "catalog-stock");
    if (book.isbn) addText(card, "p", "ISBN: " + book.isbn);
    addText(card, "p", shelfLabel(book), "catalog-shelf");
    const request = document.createElement("a");
    request.href = "reservations.html?book=" + encodeURIComponent(book.id);
    request.textContent = count > 0 ? "اطلب حجز نسخة" : "انضم لقائمة الانتظار";
    card.append(request);
    results.append(card);
  }
  status.textContent = filtered.length ? "عدد النتائج: " + filtered.length : "ما في كتب بتطابق البحث.";
  more.hidden = shown >= filtered.length;
}
function resetPage() { shown = pageSize; render(); }
try {
  const snapshot = await getDocs(collection(db, "books"));
  books = snapshot.docs.map(item => ({ ...item.data(), id: item.id })).sort((a, b) => String(a.title ?? "").localeCompare(String(b.title ?? ""), "ar"));
  search.addEventListener("input", resetPage);
  availability.addEventListener("change", resetPage);
  more.addEventListener("click", () => { shown += pageSize; render(); });
  render();
} catch {
  status.textContent = "تعذّر تحميل الكتالوج. جرّب تحديث الصفحة.";
}
