# Student portal rollout

Production Firebase project: `laib-64c9b`. Read its existing deployed rules and
test a staging copy before merging this pull request. Do not paste these blocks
as a full replacement. In Firestore, a broader overlapping allow rule wins.

## Existing data

- `students/{uid}` is a student account profile. Staff member entries with random
  document IDs are not account identities.
- A loan in `borrows/{loanId}` is visible to a student only after a librarian
  associates it with the verified Firebase `studentUid`. A student's self-entered
  student ID is not a reliable basis for migrating existing loans.
- Backfill only verified associations using the university roster and account UID.
  Leave unresolved legacy loans staff-only. New staff loans can select the verified
  student account in the lending form.
- Keep `returnDate` as the due date on the loan and record actual returns in
  `returnedAt`. Inventory needs integer `copies` and `available` values.

## Prototype rules to integrate with the current rules

These helper functions belong in `match /databases/{database}/documents`.
Restrict `librarians` writes to trusted staff provisioning. Keep owner profile
reads and staff loan permissions separate from the student grants below.

```rules
function studentSignedIn() {
  return request.auth != null &&
    exists(/databases/$(database)/documents/students/$(request.auth.uid));
}
function ownsLoan(data) {
  return studentSignedIn() && data.studentUid == request.auth.uid;
}
function validReturnRecord(data, loanId, loan) {
  return data.keys().hasAll(['loanId', 'bookId', 'studentId', 'studentUid', 'date', 'returnDate', 'createdAt']) &&
    data.keys().hasOnly(['loanId', 'bookId', 'studentId', 'studentUid', 'date', 'returnDate', 'createdAt']) &&
    data.loanId == loanId && data.bookId == loan.bookId &&
    data.studentId == loan.studentId && data.studentUid == loan.studentUid &&
    data.date == request.time && data.returnDate == request.time && data.createdAt == request.time;
}
function validStudentReturn(loanId, before, after) {
  let bookPath = /databases/$(database)/documents/books/$(before.bookId);
  let recordPath = /databases/$(database)/documents/returns/$(loanId);
  let oldBook = get(bookPath).data;
  let newBook = getAfter(bookPath).data;
  return ownsLoan(before) && before.status == 'borrowed' &&
    after.status == 'returned' && after.returned == true && after.returnedAt == request.time &&
    after.diff(before).affectedKeys().hasOnly(['status', 'returned', 'returnedAt']) &&
    oldBook.available is int && oldBook.copies is int &&
    oldBook.available >= 0 && oldBook.available < oldBook.copies &&
    newBook.available == oldBook.available + 1 &&
    newBook.lastReturnLoanId == loanId &&
    newBook.diff(oldBook).affectedKeys().hasOnly(['available', 'lastReturnLoanId']) &&
    !exists(recordPath) && existsAfter(recordPath) &&
    validReturnRecord(getAfter(recordPath).data, loanId, before);
}

match /borrows/{loanId} {
  allow get, list: if ownsLoan(resource.data);
  allow update: if validStudentReturn(loanId, resource.data, request.resource.data);
}
match /books/{bookId} {
  function studentStockUpdate(loanId) {
    let loanPath = /databases/$(database)/documents/borrows/$(loanId);
    let loan = get(loanPath).data;
    return loan.bookId == bookId &&
      validStudentReturn(loanId, loan, getAfter(loanPath).data);
  }
  allow update: if studentSignedIn() && request.resource.data.lastReturnLoanId is string &&
    studentStockUpdate(request.resource.data.lastReturnLoanId);
}
match /returns/{loanId} {
  function studentReturnRecord() {
    let loanPath = /databases/$(database)/documents/borrows/$(loanId);
    let loan = get(loanPath).data;
    return validReturnRecord(request.resource.data, loanId, loan) &&
      validStudentReturn(loanId, loan, getAfter(loanPath).data);
  }
  allow create: if studentSignedIn() && studentReturnRecord();
}
```

Integrate the reservation-specific block in [reservation-rules.md](reservation-rules.md)
after checking that students cannot assign staff privileges or edit the verified
identity used by staff. The queue is managed by a librarian. Marking a request ready
does not itself change stock.

## Release checks with two students and one librarian

- Signed-out visitors are redirected from the student dashboard and denied loan
  and reservation reads by Firestore. Test direct requests as well as the UI.
- Student A sees their records only. Student B cannot read, cancel, or return them
  even by calling Firestore directly.
- Two open loans for one book can be returned independently. A repeated return of
  the same loan cannot increase stock twice. Also test simultaneous staff/student
  returns, missing books, and final-copy concurrent lending.
- Verify stock and return records are unchanged if any write is rejected.
- Check pending/queued, ready and delivered reservations, including a duplicate
  request and student cancellation. Confirm role rules against the live schema
  before deploying or backfilling production data.
