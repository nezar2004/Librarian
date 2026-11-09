import { collection, doc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function returnLoan(db, loanId, studentUid) {
  const loanRef = doc(db, "borrows", loanId);
  const returnRef = doc(db, "returns", loanId);
  await runTransaction(db, async tx => {
    const loan = await tx.get(loanRef);
    if (!loan.exists() || (studentUid && loan.data().studentUid !== studentUid)) {
      throw new Error("سجل الإعارة غير متاح لهذا الحساب.");
    }
    const record = loan.data();
    if (record.status !== "borrowed") throw new Error("تم إرجاع هذه الإعارة سابقًا.");
    const bookRef = doc(db, "books", record.bookId);
    const book = await tx.get(bookRef);
    if (!book.exists()) throw new Error("الكتاب غير موجود. تواصل مع أمين المكتبة.");
    const { available, copies } = book.data();
    if (!Number.isInteger(available) || !Number.isInteger(copies) || available < 0 || available >= copies) {
      throw new Error("عدد النسخ يحتاج مراجعة من أمين المكتبة.");
    }
    tx.update(loanRef, { status: "returned", returned: true, returnedAt: serverTimestamp() });
    tx.update(bookRef, { available: available + 1, lastReturnLoanId: loanId });
    tx.set(returnRef, {
      loanId, bookId: record.bookId, studentId: record.studentId,
      studentUid: record.studentUid ?? "", date: serverTimestamp(),
      returnDate: serverTimestamp(), createdAt: serverTimestamp()
    });
  });
}

export async function lendBook(db, bookId, member, dates) {
  const bookRef = doc(db, "books", bookId);
  const loanRef = doc(collection(db, "borrows"));
  const activityRef = doc(collection(db, "activities"));
  await runTransaction(db, async tx => {
    const book = await tx.get(bookRef);
    if (!book.exists()) throw new Error("الكتاب غير موجود.");
    const { title, available } = book.data();
    if (!Number.isInteger(available) || available <= 0) throw new Error("الكتاب غير متاح.");
    tx.set(loanRef, {
      ...member, ...dates, bookId, bookTitle: title, status: "borrowed", createdAt: serverTimestamp()
    });
    tx.update(bookRef, { available: available - 1 });
    tx.set(activityRef, {
      studentId: member.studentId, bookTitle: title, action: "استعارة",
      status: "مستعار", createdAt: serverTimestamp()
    });
  });
}
