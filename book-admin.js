import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, getDoc, getDocs, runTransaction, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { bookKey, normalizeISBN, normalizeText, safeBookText } from "./book-tools.js";

export async function requireLibrarian(app, db) {
  const auth = getAuth(app);
  await auth.authStateReady();
  if (!auth.currentUser || !(await getDoc(doc(db, "librarians", auth.currentUser.uid))).exists()) {
    throw new Error("سجّل الدخول بحساب أمين المكتبة أولًا.");
  }
}

const aliases = {
  title: ["title", "عنوان الكتاب", "العنوان"],
  author: ["author", "المؤلف", "اسم المؤلف"],
  isbn: ["isbn", "الرقم المرجعي"],
  category: ["category", "التصنيف"],
  copies: ["copies", "عدد النسخ"],
  floor: ["floor", "الطابق"],
  section: ["section", "القسم"],
  shelf: ["shelf", "الرف"]
};

function parseRow(row, columns) {
  const value = field => row[columns[field]];
  const title = safeBookText(value("title"), 180);
  const author = safeBookText(value("author"), 150);
  if (!title || !author) throw new Error("العنوان والمؤلف مطلوبان");
  const copies = Number(String(value("copies") ?? "").trim() || 1);
  if (!Number.isInteger(copies) || copies < 1 || copies > 10000) throw new Error("عدد النسخ لازم يكون عددًا صحيحًا بين 1 و10000");
  const rawISBN = safeBookText(value("isbn"), 30);
  const isbn = normalizeISBN(rawISBN);
  if (rawISBN && !/^(?:\d{9}[\dXx]|\d{13})$/.test(isbn)) throw new Error("ISBN يجب أن يكون 10 أو 13 خانة");
  return {
    title, author, copies, available: copies, isbn,
    category: safeBookText(value("category"), 80),
    floor: safeBookText(value("floor"), 60),
    section: safeBookText(value("section"), 80),
    shelf: safeBookText(value("shelf"), 60)
  };
}

function duplicateTracker(existing) {
  const keys = new Set(existing.map(bookKey));
  const isbns = new Set(existing.map(book => normalizeISBN(book.isbn)).filter(Boolean));
  return {
    has: book => keys.has(bookKey(book)) || (book.isbn && isbns.has(book.isbn)),
    add(book) { keys.add(bookKey(book)); if (book.isbn) isbns.add(book.isbn); }
  };
}

function previewRows(rows, existing) {
  const headers = rows[0]?.map(normalizeText) || [];
  const columns = Object.fromEntries(Object.entries(aliases).map(([key, names]) =>
    [key, headers.findIndex(header => names.includes(header))]));
  if (columns.title < 0 || columns.author < 0) throw new Error("الصف الأول لازم يحتوي عمودَي title وauthor أو العنوان والمؤلف.");
  const duplicates = duplicateTracker(existing);
  return rows.slice(1).map((row, index) => {
    const cells = [index + 2, row[columns.title] || "—", row[columns.author] || "—"];
    try {
      const book = parseRow(row, columns);
      if (duplicates.has(book)) return { cells: [...cells, "مكرر — سيتم تجاوزه"] };
      duplicates.add(book);
      return { cells: [...cells, "جاهز للحفظ"], book };
    } catch (error) {
      return { cells: [...cells, error.message] };
    }
  });
}

async function importId(book) {
  const data = new TextEncoder().encode(bookKey(book));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return "import-" + Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
}

export function initBookAdmin(app, db, refresh) {
  const get = id => document.getElementById(id);
  const shelfTool = get("shelf-tool");
  const shelfBook = get("shelf-book");
  const shelfStatus = get("shelf-status");
  const file = get("book-import-file");
  const confirm = get("book-import-confirm");
  const status = get("book-import-status");
  const preview = get("book-import-preview");
  const shelfFields = { floor: get("shelf-floor"), section: get("shelf-section"), shelf: get("shelf-code") };
  const loadBooks = async () => (await getDocs(collection(db, "books"))).docs;
  let shelfBooks = new Map();
  let staged = [];
  let fileVersion = 0;

  function fillShelfFields() {
    const selected = shelfBooks.get(shelfBook.value);
    for (const [field, input] of Object.entries(shelfFields)) input.value = selected?.[field] ?? "";
  }
  shelfTool.addEventListener("toggle", async () => {
    if (!shelfTool.open) return;
    try {
      await requireLibrarian(app, db);
      shelfBooks = new Map((await loadBooks()).map(snapshot => [snapshot.id, snapshot.data()]));
      shelfBook.replaceChildren(new Option("اختر كتابًا", ""));
      for (const [id, book] of shelfBooks) shelfBook.add(new Option(book.title || id, id));
      fillShelfFields();
      shelfStatus.textContent = "";
    } catch (error) {
      shelfStatus.textContent = error.message;
    }
  });
  shelfBook.addEventListener("change", fillShelfFields);
  get("shelf-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.submitter;
    const id = shelfBook.value;
    if (!id) return;
    button.disabled = true;
    try {
      await requireLibrarian(app, db);
      const fields = Object.fromEntries(Object.entries(shelfFields).map(([key, input]) =>
        [key, safeBookText(input.value, input.maxLength)]));
      await updateDoc(doc(db, "books", id), fields);
      shelfBooks.set(id, { ...shelfBooks.get(id), ...fields });
      shelfStatus.textContent = "تم حفظ موقع الرف.";
    } catch (error) {
      shelfStatus.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  file.addEventListener("change", async () => {
    const version = ++fileVersion;
    staged = [];
    confirm.disabled = true;
    preview.replaceChildren();
    const selected = file.files[0];
    if (!selected) { status.textContent = ""; return; }
    if (selected.size > 2 * 1024 * 1024) { status.textContent = "حجم الملف لازم يكون أقل من 2 ميغابايت."; return; }
    status.textContent = "جاري قراءة الملف…";
    try {
      await requireLibrarian(app, db);
      const [xlsx, books, bytes] = await Promise.all([
        import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs"),
        loadBooks(),
        selected.arrayBuffer()
      ]);
      const workbook = xlsx.read(bytes, { sheetRows: 102 });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("الملف ما فيه ورقة بيانات.");
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "", blankrows: false });
      if (rows.length > 101) throw new Error("الملف يتجاوز 100 صف بيانات.");
      if (version !== fileVersion) return;
      const review = previewRows(rows, books.map(item => item.data()));
      staged = review.flatMap(row => row.book ? [row.book] : []);
      for (const { cells } of review) {
        const tr = preview.insertRow();
        for (const value of cells) tr.insertCell().textContent = value;
      }
      status.textContent = "الصفوف الجاهزة: " + staged.length + " من " + review.length;
      confirm.disabled = !staged.length;
    } catch (error) {
      if (version === fileVersion) status.textContent = "تعذّرت قراءة الملف: " + error.message;
    }
  });

  confirm.addEventListener("click", async () => {
    if (!staged.length) return;
    confirm.disabled = true;
    file.disabled = true;
    const candidates = staged;
    status.textContent = "جاري حفظ الكتب…";
    try {
      await requireLibrarian(app, db);
      const existing = duplicateTracker((await loadBooks()).map(item => item.data()));
      const fresh = candidates.filter(book => !existing.has(book));
      const entries = await Promise.all(fresh.map(async book =>
        ({ book, ref: doc(db, "books", await importId(book)) })));
      const saved = await runTransaction(db, async transaction => {
        const checks = await Promise.all(entries.map(({ ref }) => transaction.get(ref)));
        let count = 0;
        entries.forEach(({ book, ref }, i) => {
          if (!checks[i].exists()) {
            transaction.set(ref, { ...book, createdAt: serverTimestamp() });
            count++;
          }
        });
        return count;
      });
      staged = [];
      file.value = "";
      preview.replaceChildren();
      status.textContent = "تم حفظ " + saved + " كتاب، وتجاوز " + (candidates.length - saved) + " صف مكرر.";
      void refresh().catch(console.error);
    } catch (error) {
      status.textContent = "تعذّر الحفظ: " + error.message;
    } finally {
      file.disabled = false;
      confirm.disabled = !staged.length;
    }
  });
}
