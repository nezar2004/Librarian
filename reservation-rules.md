# Reservation release checklist

The GitHub Pages release must follow an authenticated test of the existing Librarian project.
Merge the following **prototype** block into the existing
`match /databases/{database}/documents` block. Review any broader wildcard rules first:
an overlapping allow rule can override these restrictions. Confirm that students
cannot write librarian role documents or impersonate other student records.

```rules
match /reservations/{id} {
  function signedIn() {
    return request.auth != null;
  }
  function isLibrarian() {
    return signedIn() &&
      exists(/databases/$(database)/documents/librarians/$(request.auth.uid));
  }
  function isStudent() {
    return signedIn() &&
      exists(/databases/$(database)/documents/students/$(request.auth.uid));
  }
  function isOwner() {
    return signedIn() && resource.data.uid == request.auth.uid;
  }
  function validReservation(data) {
    return data.keys().hasAll(['uid', 'studentId', 'bookId', 'bookTitle', 'status', 'createdAt', 'updatedAt']) &&
      data.keys().hasOnly(['uid', 'studentId', 'bookId', 'bookTitle', 'status', 'createdAt', 'updatedAt']) &&
      data.uid is string && data.uid.size() <= 128 &&
      data.studentId is string && data.studentId.size() > 0 && data.studentId.size() <= 80 &&
      data.bookId is string && data.bookId.matches('[^/]{1,160}') &&
      data.bookTitle is string && data.bookTitle.size() > 0 && data.bookTitle.size() <= 250 &&
      data.status in ['pending', 'waiting', 'ready', 'fulfilled', 'cancelled'] &&
      data.createdAt is timestamp && data.updatedAt == request.time;
  }
  function startsOwnReservation(data) {
    let student = get(/databases/$(database)/documents/students/$(request.auth.uid));
    let book = get(/databases/$(database)/documents/books/$(data.bookId));
    return data.uid == request.auth.uid &&
      id == data.uid + '_' + data.bookId &&
      data.studentId == student.data.studentId &&
      data.bookTitle == book.data.title &&
      data.createdAt == request.time &&
      data.status == (book.data.available > 0 ? 'pending' : 'waiting');
  }
  function canStaffTransition(before, after) {
    return (before == 'pending' && after in ['ready', 'waiting', 'cancelled']) ||
      (before == 'waiting' && after in ['ready', 'cancelled']) ||
      (before == 'ready' && after in ['fulfilled', 'cancelled']);
  }

  allow list: if isLibrarian() || isOwner();
  allow get: if isLibrarian() || isOwner() ||
    (isStudent() && request.auth.uid.matches('[A-Za-z0-9]{1,128}') &&
      id.matches(request.auth.uid + '_[^/]+') && resource == null);
  allow create: if isStudent() && validReservation(request.resource.data) &&
    startsOwnReservation(request.resource.data);
  allow update: if validReservation(request.resource.data) && (
    (isLibrarian() &&
      request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'updatedAt']) &&
      canStaffTransition(resource.data.status, request.resource.data.status)) ||
    (isOwner() && resource.data.status in ['pending', 'waiting'] &&
      request.resource.data.status == 'cancelled' &&
      request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'updatedAt'])) ||
    (isStudent() && isOwner() && resource.data.status in ['cancelled', 'fulfilled'] &&
      startsOwnReservation(request.resource.data))
  );
  allow delete: if false;
}
```

Verify with test accounts that a student can open and cancel only their own requests,
staff can see the queue and progress states, and a signed-out visitor can read neither.
Test the rule branches against the project's actual document schema, including any
older records with a non-string student ID or a non-numeric stock value.
A ready status is set manually after a librarian sets aside a copy. It does not
modify stock or replace the existing loan workflow.
