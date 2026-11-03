# AttendX – Student Attendance Management System
https://attendx-avcf3tll8k8wfsmahtao6h.streamlit.app/

> **A production-grade, high-performance Student Attendance Management System built with pure C programming (C99/C11 standard file I/O) and a modern, Linear/Stripe-inspired web interface.**

---

## 📑 Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture & Technology Stack](#architecture--technology-stack)
3. [Folder Structure](#folder-structure)
4. [File Handling Storage Engine (Viva Explanation)](#file-handling-storage-engine-viva-explanation)
5. [C File Operations & Flow Diagrams](#c-file-operations--flow-diagrams)
6. [Security & Password Hashing](#security--password-hashing)
7. [REST API Documentation](#rest-api-documentation)
8. [Frontend Features & Design System](#frontend-features--design-system)
9. [Build & Execution Guide](#build--execution-guide)
10. [Viva Preparation & FAQs](#viva-preparation--faqs)

---

## 1. Project Overview

**AttendX** demonstrates how to build a full-stack, enterprise-grade web application using **pure C** for the backend engine and flat files for data persistence—without relying on Python, Node.js, SQLite, or external database engines.

### Key Highlights:
- **100% Standard C File Handling**: Powered by `fopen()`, `fclose()`, `fgets()`, `fprintf()`, `fread()`, `fwrite()`, `remove()`, and `rename()`.
- **Zero Database Engines**: All entities (`students`, `attendance`, `users`, `audit logs`) are stored in human-readable, pipe-delimited flat files in `/data`.
- **Atomic Safe Updates & Automatic Backups**: Destructive operations (update, delete, batch write) write to temporary files first and preserve a timestamped binary backup in `/backups` before replacing originals.
- **Embedded Web Server**: Embedded C HTTP server built with the single-file Mongoose library and JSON serialization via cJSON.
- **Polished SaaS Frontend**: Served directly by the C server with Light and Dark mode, KPI animations, Chart.js trends, GitHub-style 35-day attendance heatmap, CSV import/export, and printable reports.

---

## 2. Architecture & Technology Stack

```
+-------------------------------------------------------------------------+
|                         Frontend Web Browser                            |
|  - HTML5, Vanilla CSS3 (Custom Design System with CSS Variables)         |
|  - Vanilla JavaScript (SPA State, Custom Modals, Toast Engine)          |
|  - Chart.js 4.4 (Trend Line, Section Bar, Today's Doughnut)             |
|  - Lucide Icons & Responsive Mobile-First Drawer Layout                 |
+------------------------------------+------------------------------------+
                                     |
                       HTTP / REST JSON (fetch API)
                                     |
+------------------------------------v------------------------------------+
|                         AttendX C Web Server                            |
|                                                                         |
|   [ Mongoose HTTP Server (mongoose.c/h) ]                               |
|   - Event loop listening on port 8080                                   |
|   - Static file handler serving /public (HTML, CSS, JS)                 |
|   - API Router matching /api/* routes                                   |
|                                                                         |
|   [ REST API Handlers (api_handlers.c/h) ]                              |
|   - Request validation, status codes (200, 201, 400, 401, 404, 409)     |
|   - JSON serialization & parsing with cJSON (cJSON.c/h)                 |
|   - Bearer token authentication & role authorization                    |
|                                                                         |
|   [ Security & Crypto Subsystem (utils.c / auth.c) ]                    |
|   - FIPS 180-2 compliant 64-round SHA-256 password hashing with salt   |
|   - In-memory session management table with TTL expiration              |
|                                                                         |
|   [ Flatfile Storage Engine (file_handler.c/h) ]                        |
|   - CRUD for students, attendance, users, and append-only audit trail   |
|   - Atomic swap: write to temp -> remove original -> rename temp        |
|   - Binary block copy backup generator using fread/fwrite               |
+------------------------------------+------------------------------------+
                                     |
                     Standard C Standard I/O (stdio.h)
                                     |
             +-----------------------+-----------------------+
             |                                               |
             v                                               v
    [ Data Directory (/data) ]                    [ Backups Directory (/backups) ]
    - students.txt                                - students.txt_YYYYMMDD_HHMMSS.bak
    - attendance.txt                              - attendance.txt_YYYYMMDD_HHMMSS.bak
    - users.txt                                   - users.txt_YYYYMMDD_HHMMSS.bak
    - audit_log.txt                               - audit_log.txt_YYYYMMDD_HHMMSS.bak
```

---

## 3. Folder Structure

```
cmicroproj/
├── build.bat               # Windows MinGW GCC build script
├── Makefile                # Cross-platform Makefile (Windows & Linux)
├── README.md               # Detailed documentation & Viva guide
├── attendx.exe             # Compiled standalone executable
│
├── src/                    # C Application Source Code
│   ├── main.c              # Entry point, banner, seeding, server initialization
│   ├── server.h / .c       # Mongoose HTTP event loop & static file server
│   ├── api_handlers.h / .c # REST endpoints, query parser, JSON controller
│   ├── file_handler.h / .c # Core file handling module (CRUD, backups, reports)
│   ├── auth.h / .c         # Session management, token validation, login/logout
│   └── utils.h / .c        # SHA-256 implementation, date/time, string utilities
│
├── lib/                    # Single-File C Libraries
│   ├── mongoose.h / .c     # Mongoose embedded networking engine
│   └── cJSON.h / .c        # Ultra-lightweight JSON parser and generator
│
├── public/                 # Static Assets Served by C Server
│   ├── index.html          # Single Page Application (Login, Dashboard, Modals)
│   ├── css/
│   │   └── style.css       # SaaS design system (Light/Dark mode, Heatmap, Print)
│   └── js/
│       ├── app.js          # Client UI orchestrator, filters, table pagination
│       ├── api.js          # API client wrapping fetch() calls
│       ├── charts.js       # Chart.js renderers with dynamic theme colors
│       ├── chart.umd.js    # Local offline Chart.js bundle
│       └── lucide.min.js   # Local offline Lucide icons library
│
├── data/                   # Flatfile Data Store (Pipe Delimited)
│   ├── students.txt        # roll_no|name|section|email|phone|joined_on
│   ├── attendance.txt      # date|roll_no|status|remarks
│   ├── users.txt           # username|password_hash|role
│   └── audit_log.txt       # timestamp|user|action (append-only)
│
└── backups/                # Automatic Timestamped Backup Copies (*.bak)
```

---

## 4. File Handling Storage Engine (Viva Explanation)

Every entity is mapped to a dedicated flat file with strict delimitation and defensive memory checks:

### 1. `data/students.txt`
- **Format**: `roll_no|name|section|email|phone|joined_on`
- **Example**: `CS101|Aarav Sharma|CS-A|aarav.sharma@attendx.edu|+91 98765 43210|2026-08-01`
- **Integrity**: Duplicate roll numbers are rejected before appending (`return -2;`).

### 2. `data/attendance.txt`
- **Format**: `date|roll_no|status|remarks`
- **Example**: `2026-10-15|CS101|Present|Regular attendance`
- **Integrity**: Duplicate prevention ensures that multiple submissions for the same student on the same date safely update the existing record rather than creating duplicate lines.

### 3. `data/users.txt`
- **Format**: `username|password_hash|role`
- **Example**: `admin|e7cf3549432f8d32ac...|admin`
- **Security**: Passwords are never stored in plain text; they are hashed with salted SHA-256.

### 4. `data/audit_log.txt` (Append-Only)
- **Format**: `timestamp|user|action`
- **Example**: `2026-11-02 17:05:35|admin|Deleted student with Roll No: CS999`
- **Auditability**: All actions (logins, student additions, edits, deletions, backups) are timestamped and preserved.

---

## 5. C File Operations & Flow Diagrams

### Operation 1: Reading Records (`"r"` mode)
```c
FILE *fp = fopen(STUDENTS_FILE, "r");
if (!fp) return -1; // Null check prevents crash

char line[MAX_LINE_LEN];
while (fgets(line, sizeof(line), fp)) {
    trim_whitespace(line);
    // Parse pipe-delimited tokens safely
}
fclose(fp);
```
- **Explanation**: `fopen()` in read mode (`"r"`) opens the stream. `fgets()` bounds input buffer reading up to `sizeof(line)` bytes, preventing stack buffer overflows (unlike dangerous `gets()` or unbounded `scanf()`).

---

### Operation 2: Appending Records (`"a"` mode)
```c
FILE *fp = fopen(AUDIT_LOG_FILE, "a");
if (!fp) return -1;

fprintf(fp, "%s|%s|%s\n", timestamp, user, action);
fflush(fp);
fclose(fp);
```
- **Explanation**: In append mode (`"a"`), the file pointer is automatically positioned at the end of the file. New data is appended atomically without altering existing lines. `fflush()` ensures buffer contents are committed to disk immediately.

---

### Operation 3: Atomic Safe Update and Delete (Temp File + Rename)

When updating or deleting records in standard C, in-place file modifications can corrupt data if the system loses power or encounters an error mid-stream. AttendX implements the **Atomic Temporary File Replacement Pattern**:

```
+-------------------------------------------------------------------+
| 1. Create Timestamped Backup in /backups (Binary fread/fwrite)    |
+---------------------------------+---------------------------------+
                                  |
+---------------------------------v---------------------------------+
| 2. Open Original File in "r"  &  Open Temp File in "w"            |
|    (e.g., data/students.txt)     (e.g., data/students_tmp.txt)    |
+---------------------------------+---------------------------------+
                                  |
+---------------------------------v---------------------------------+
| 3. Iterate through lines using fgets():                           |
|    - If line DOES NOT match target: write original to temp        |
|    - If line MATCHES target (Update): write new data to temp      |
|    - If line MATCHES target (Delete): skip writing to temp        |
+---------------------------------+---------------------------------+
                                  |
+---------------------------------v---------------------------------+
| 4. Close both file streams: fclose(src) & fclose(tmp)             |
+---------------------------------+---------------------------------+
                                  |
+---------------------------------v---------------------------------+
| 5. remove("data/students.txt")                                    |
| 6. rename("data/students_tmp.txt", "data/students.txt")           |
+-------------------------------------------------------------------+
```

#### Why `remove()` before `rename()`?
In ISO C and the Windows POSIX implementation (`MSVCRT`), if the destination file already exists, `rename()` fails with `EEXIST`. Calling `remove(original)` first guarantees cross-platform compatibility across both MinGW Windows and Linux.

---

### Operation 4: Binary Backup Copy (`"rb"` and `"wb"`)
```c
FILE *src = fopen(source_path, "rb");
FILE *dst = fopen(backup_path, "wb");

char buffer[4096];
size_t bytes_read;
while ((bytes_read = fread(buffer, 1, sizeof(buffer), src)) > 0) {
    fwrite(buffer, 1, bytes_read, dst);
}
fclose(src);
fclose(dst);
```
- **Explanation**: Uses binary mode (`"rb"` and `"wb"`) to read raw byte chunks (4 KB buffer) using `fread()` and writes them with `fwrite()`. This guarantees an exact bit-for-bit duplicate in `/backups` regardless of line ending conventions (`\r\n` vs `\n`).

---

## 6. Security & Password Hashing

AttendX features a self-contained, standard **FIPS 180-2 compliant 64-round SHA-256** implementation (`src/utils.c`) requiring zero external cryptography dependencies.

- **Password Salt**: `AttendX_SecureSalt_v1`
- **Hash Formula**: `Hex( SHA-256( Salt + ":" + Password ) )`
- **Session Tokens**: Cryptographically generated 32-character hex tokens stored in an in-memory session table with 24-hour expiration (`SESSION_TTL_SECONDS = 86400`).

---

## 7. REST API Documentation

All API responses follow a uniform JSON structure:
```json
{
  "success": true,
  "message": "Operation description",
  "data": { ... }
}
```

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/login` | Authenticate with username and password | No |
| `POST` | `/api/logout` | Invalidate active session token | Yes |
| `GET` | `/api/me` | Fetch currently logged-in user profile | Yes |
| `GET` | `/api/students` | Get all students (supports `?section=` & `?search=`) | Yes |
| `POST` | `/api/students` | Add a new student record (prevents duplicate roll) | Yes |
| `GET` | `/api/students/:roll` | Get full details of a specific student | Yes |
| `PUT` | `/api/students/:roll` | Update student details (atomic temp file copy) | Yes |
| `DELETE`| `/api/students/:roll` | Delete student and their attendance history | Admin only |
| `GET` | `/api/attendance` | Get attendance for a date (`?date=YYYY-MM-DD`) | Yes |
| `POST` | `/api/attendance` | Save full day's attendance batch (atomic overwrite) | Yes |
| `GET` | `/api/reports/summary` | Dashboard metrics, 7/30-day trends, low alerts | Yes |
| `GET` | `/api/reports/student/:roll`| Individual student attendance stats and history | Yes |
| `GET` | `/api/export/csv` | Export students or attendance as CSV file | Yes |
| `POST` | `/api/import/csv` | Bulk import students from CSV content | Yes |
| `GET` | `/api/audit-log` | Retrieve recent audit log entries from `audit_log.txt` | Yes |
| `POST` | `/api/settings/backup` | Trigger an immediate manual backup of all data files | Admin only |
| `POST` | `/api/settings/password` | Change user password | Yes |
| `GET` | `/api/users` | List registered user accounts | Admin only |
| `POST` | `/api/users` | Create a new teacher or admin account | Admin only |
| `DELETE`| `/api/users/:username` | Delete a teacher account (admin protected) | Admin only |

---

## 8. Frontend Features & Design System

The frontend is served as static files directly by the C Mongoose server:
1. **Split-Screen Login**: Modern SaaS split layout with feature highlights and one-click demo login buttons for `Admin` and `Teacher`.
2. **Dashboard Overview**:
   - 4 animated count-up KPI cards (Total Students, Present Today, Absent Today, Overall Attendance %).
   - 7-Day / 30-Day Attendance Trend Line Chart with bezier curves and area gradients.
   - Section-wise Attendance Performance Bar Chart.
   - Present vs. Absent vs. Late Doughnut Chart.
   - Low Attendance Watchlist Panel (< 75%) with student cards and quick navigation.
   - Real-time Activity Feed reading directly from `audit_log.txt`.
3. **Student Directory**:
   - Live debounced search by roll number, name, or email.
   - Section dropdown filter.
   - Column sorting and pagination (10 per page).
   - Add/Edit/Delete modals with form validation.
   - **Student Profile View**: Displays student details, attendance percentage badge, attendance history table, and a **GitHub-style 35-Day Calendar Heatmap Matrix** with status tooltips.
4. **Mark Attendance**:
   - Date picker with future date restriction.
   - Section selector.
   - Notice banner warning if attendance for the date was already submitted.
   - Bulk actions: "Mark All Present", "Mark All Absent".
   - Student cards with large tactile [Present] [Absent] [Late] toggles and optional remarks.
   - Sticky bottom summary bar with live counters and submission button.
5. **Reports & Analytics**:
   - Attendance percentage report table highlighting students < 75% in a red alert badge.
   - Print-friendly layout (`@media print` stylesheet) and CSV export.
6. **Settings (Admin)**:
   - Threshold adjustments, password change, teacher management, manual backup trigger, full audit log viewer.
7. **Dark / Light Mode**:
   - Smooth CSS transitions with preference persisted in `localStorage`.

---

## 9. Build & Execution Guide

### Prerequisites
- **Windows**: MinGW or MSYS2 GCC (`gcc.exe`)
- **Linux / macOS**: Standard GCC (`build-essential`)

### Quick Compilation

#### On Windows (Command Prompt or PowerShell):
```cmd
build.bat
```
*Or using GCC directly:*
```cmd
gcc -Wall -Wextra -std=c11 -O2 -Ilib src/main.c src/server.c src/api_handlers.c src/file_handler.c src/auth.c src/utils.c lib/mongoose.c lib/cJSON.c -o attendx.exe -lws2_32
```

#### On Linux / macOS:
```bash
make
```

### Running the Application
```cmd
attendx.exe
```
Output banner in terminal:
```
====================================================================
   _   _   _                  _  __  __ 
  /_\ | |_| |_ ___ _ _  __| | \ \/ / 
 / _ \|  _|  _/ -_) ' \/ _` |  >  <  
/_/ \_\__|\\__\___|_||_\__,_| /_/\_\ 
 Student Attendance Management System (Pure C Edition)
====================================================================
 >> Storage Engine   : Standard C File I/O (/data)
 >> Safe File Copies : Active (Timestamped backups in /backups)
 >> Default Accounts : admin / admin123  |  teacher / teacher123
 >> Web Server URL   : AttendX running at http://localhost:8080
 >> Static Root      : ./public
 >> Press Ctrl+C in terminal to stop server
====================================================================
```

Open your browser and navigate to:
```
http://localhost:8080
```

### Seeded Credentials:
- **Admin**: `admin` / `admin123`
- **Teacher**: `teacher` / `teacher123`

---

## 10. Viva Preparation & FAQs

### Q1: Why did you not use a database like MySQL or SQLite?
> **Answer**: The core academic objective of this microproject is to demonstrate deep mastery of standard C file handling operations (`stdio.h`). By designing our own flat-file storage engine with pipe delimiters, we showcase custom record parsing, file locking concepts, atomic updates via temporary files, and binary backup handling.

### Q2: How do you prevent file corruption when updating a record?
> **Answer**: We use the **Atomic Temporary File Replacement Pattern**. Instead of overwriting bytes in-place (which can corrupt the file if the program terminates prematurely), we:
> 1. Create a timestamped backup in `/backups` using `fread` and `fwrite`.
> 2. Read lines from the original file with `fgets()`.
> 3. Write modified and unmodified lines into a temporary file (`data/students_tmp.txt`).
> 4. Close both file streams with `fclose()`.
> 5. Call `remove(original)` followed by `rename(temp, original)`.

### Q3: How do you prevent buffer overflow vulnerabilities?
> **Answer**: We strictly prohibit unbounded functions like `gets()` or unbounded `scanf("%s")`. All string copying uses `safe_strncpy()` with explicit buffer sizes and null terminators. File reading uses `fgets(buffer, sizeof(buffer), fp)`. Formatted string outputs use bounded `snprintf()`.

### Q4: How is password security handled in C?
> **Answer**: Plain text passwords are never stored. We implemented a self-contained, 64-round SHA-256 algorithm with a cryptographic salt. During authentication, the input password is concatenated with the salt, hashed, and compared with the stored hash using `strcmp()`.

### Q5: How does the C backend communicate with the JavaScript frontend?
> **Answer**: The C server runs an embedded Mongoose HTTP event loop. It serves static assets (`index.html`, `style.css`, `app.js`, `chart.umd.js`) on GET requests to static routes. Dynamic requests sent by `fetch()` to `/api/*` are intercepted by our C REST router (`api_handlers.c`), which parses parameters, interacts with `file_handler.c`, and formats the response as JSON using `cJSON`.

---
*AttendX – Built with precision in C for Advanced Computing Academics.*
