export function normalizeText(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/g, "").replace(/\s+/g, " ").trim();
}

export function normalizeISBN(value) {
  const clean = normalizeText(value).replace(/[\s-]+/g, "");
  return /^[0-9]+x?$/.test(clean) ? clean : "";
}

export function shelfLabel(book) {
  const parts = [["الطابق", book.floor], ["القسم", book.section], ["الرف", book.shelf]]
    .filter(([, value]) => String(value ?? "").trim())
    .map(([label, value]) => label + ": " + value);
  return parts.join(" · ") || "موقع الرف غير محدد";
}

export function bookKey(book) {
  return normalizeText(book.title) + "\u001f" + normalizeText(book.author);
}

export function safeBookText(value, maxLength) {
  const text = String(value ?? "").trim();
  if (text.length > maxLength || /[<>]/.test(text)) throw new Error("قيمة غير صالحة أو طويلة.");
  return text;
}
