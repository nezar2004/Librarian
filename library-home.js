import { languageCode } from "./library-language.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { collection, getDocs, getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {

apiKey: "AIzaSyCkCR-nUCHQYRiLILTdSzCeYn2CTB94ILQ",

authDomain: "laib-64c9b.firebaseapp.com",

projectId: "laib-64c9b",

storageBucket: "laib-64c9b.firebasestorage.app",

messagingSenderId: "429556863392",

appId: "1:429556863392:web:1cffe618fd87b6606914c5"

};

const menu = document.getElementById("menu-toggle");
const navigation = document.getElementById("mobile-menu");
const smallScreen = matchMedia("(max-width: 640px)");

function closeMenu() {
  menu.setAttribute("aria-expanded", "false");
}

menu.hidden = false;
menu.addEventListener("click", () => menu.setAttribute("aria-expanded", String(menu.getAttribute("aria-expanded") === "false")));
navigation.addEventListener("click", event => {
  if (!smallScreen.matches || !event.target.closest("a")) return;
  closeMenu();
  const link = event.target.closest("a");
  if (link.hash) document.querySelector(link.hash)?.focus({ preventScroll: true });
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && smallScreen.matches && menu.getAttribute("aria-expanded") === "true") {
    closeMenu();
    menu.focus();
  }
});
smallScreen.addEventListener("change", closeMenu);

try {
  const db = getFirestore(initializeApp(firebaseConfig));
  const books = (await getDocs(collection(db, "books"))).docs.map(book => book.data());
  function renderCounts() {
  const number = new Intl.NumberFormat(languageCode() === "en" ? "en" : "ar-JO");
  document.getElementById("books-count").textContent = number.format(books.length);
  document.getElementById("available-count").textContent = number.format(books.filter(book => Number(book.available) > 0).length);
  const categories = new Set(books.map(book => String(book.category ?? "").trim()).filter(Boolean));
  document.getElementById("categories-count").textContent = number.format(categories.size);
  }
  document.addEventListener("library:language", renderCounts);
  renderCounts();
} catch {
  // Catalog navigation and sign-in remain usable without the counters.
}
