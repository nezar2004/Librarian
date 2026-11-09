import { translate, languageCode } from "./library-language.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { collection, getDocs, getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { normalizeText, normalizeISBN } from "./book-tools.js";

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
search.value = (new URLSearchParams(location.search).get("q") || "").slice(0, 160);
const availability = document.querySelector("#catalog-availability");
const status = document.querySelector("#catalog-status");
const results = document.querySelector("#catalog-results");
const more = document.querySelector("#catalog-more");
const pageSize = 24;
let books = [];
let shown = pageSize;
let loadState = "loading";

function addText(parent, tag, text, className) {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  parent.append(el);
}

function render() {
  if (loadState !== "ready") {
    status.textContent = loadState === "loading" ? translate("جاري تحميل الكتب…") : translate("تعذّر تحميل الكتالوج. جرّب تحديث الصفحة.", "Couldn’t load the catalog. Try refreshing the page.");
    return;
  }
  const number = new Intl.NumberFormat(languageCode() === "en" ? "en" : "ar-JO");
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
    addText(card, "p", book.category || translate("كتاب", "Book"), "catalog-kicker");
    addText(card, "h2", book.title || translate("بدون عنوان", "Untitled"));
    addText(card, "p", book.author || translate("المؤلف غير محدد", "Author not listed"));
    const count = Number(book.available);
    const known = book.available != null && book.available !== "" && Number.isFinite(count);
    addText(card, "p", !known ? translate("التوفّر غير محدد", "Availability unknown") : count > 0 ? translate("متاح: ", "Available: ") + number.format(count) : translate("غير متاح حاليًا", "Currently unavailable"), "catalog-stock");
    if (book.isbn) addText(card, "p", "ISBN: " + book.isbn);
    const shelf = [[translate("الطابق", "Floor"), book.floor], [translate("القسم", "Section"), book.section], [translate("الرف", "Shelf"), book.shelf]]
      .filter(([, value]) => String(value ?? "").trim()).map(([label, value]) => label + ": " + value);
    addText(card, "p", shelf.join(" · ") || translate("موقع الرف غير محدد", "Shelf location not listed"), "catalog-shelf");
    const request = document.createElement("a");
    request.href = "reservations.html?book=" + encodeURIComponent(book.id);
    request.textContent = translate(count > 0 ? "اطلب حجز نسخة" : "انضم لقائمة الانتظار", count > 0 ? "Request a copy" : "Join the waiting list");
    card.append(request);
    results.append(card);
  }
  status.textContent = filtered.length ? translate("عدد النتائج: ", "Results: ") + number.format(filtered.length) : translate("ما في كتب بتطابق البحث.", "No books match your search.");
  more.hidden = shown >= filtered.length;
}
function resetPage() { shown = pageSize; render(); }
document.addEventListener("library:language", render);
try {
  const snapshot = await getDocs(collection(db, "books"));
  books = snapshot.docs.map(item => ({ ...item.data(), id: item.id })).sort((a, b) => String(a.title ?? "").localeCompare(String(b.title ?? ""), "ar"));
  loadState = "ready";
  search.addEventListener("input", resetPage);
  availability.addEventListener("change", resetPage);
  more.addEventListener("click", () => { shown += pageSize; render(); });
  render();
} catch {
  loadState = "error";
  render();
}
