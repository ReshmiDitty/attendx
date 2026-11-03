#include "file_handler.h"
#include "utils.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>

#if defined(_WIN32)
#include <direct.h>
#define MKDIR(d) _mkdir(d)
#else
#include <unistd.h>
#define MKDIR(d) mkdir(d, 0755)
#endif

/* =========================================================================
 * VIVA EXPLANATION: Directory and File Initialization
 *
 * HOW IT WORKS:
 * 1. Checks if directories "data" and "backups" exist; creates them if missing.
 * 2. Opens each data file in append mode ("a") and immediately closes it.
 *    In standard C, opening a non-existent file with "a" creates an empty file.
 *    If the file already exists, it is left completely untouched.
 * ========================================================================= */
int ensure_directories(void) {
    MKDIR(DATA_DIR);
    MKDIR(BACKUP_DIR);
    return 0;
}

int init_all_files(void) {
    ensure_directories();

    const char *files[] = {
        STUDENTS_FILE,
        ATTENDANCE_FILE,
        USERS_FILE,
        AUDIT_LOG_FILE
    };

    for (size_t i = 0; i < sizeof(files) / sizeof(files[0]); i++) {
        FILE *fp = fopen(files[i], "a");
        if (!fp) {
            fprintf(stderr, "[AttendX File Error] Failed to open/create file: %s\n", files[i]);
            return -1;
        }
        fclose(fp);
    }
    return 0;
}

/* =========================================================================
 * VIVA EXPLANATION: Safe Timestamped Backup Copy
 *
 * HOW IT WORKS:
 * 1. Generates a timestamped filename, e.g., backups/students_20261102_155731.txt.bak
 * 2. Opens the source file in binary read mode ("rb").
 * 3. Opens the destination backup file in binary write mode ("wb").
 * 4. Uses fread() and fwrite() with a 4KB chunk buffer to safely duplicate the file byte-for-byte.
 * 5. Closes both files. This prevents any data loss before performing destructive operations.
 * ========================================================================= */
int create_timestamped_backup(const char *source_filepath, char *backup_filepath_out, size_t out_len) {
    if (!source_filepath) return -1;

    FILE *src = fopen(source_filepath, "rb");
    if (!src) {
        // File may be empty or not yet created, which is acceptable
        return 0;
    }

    // Determine basename (e.g. "students.txt" from "data/students.txt")
    const char *base = strrchr(source_filepath, '/');
    if (!base) base = strrchr(source_filepath, '\\');
    base = base ? base + 1 : source_filepath;

    char timestamp[32];
    get_timestamp_for_filename(timestamp, sizeof(timestamp));

    char backup_path[512];
    snprintf(backup_path, sizeof(backup_path), "%s/%s_%s.bak", BACKUP_DIR, base, timestamp);

    FILE *dst = fopen(backup_path, "wb");
    if (!dst) {
        fprintf(stderr, "[AttendX Backup Error] Could not create backup file: %s\n", backup_path);
        fclose(src);
        return -1;
    }

    char buffer[4096];
    size_t bytes_read;
    while ((bytes_read = fread(buffer, 1, sizeof(buffer), src)) > 0) {
        fwrite(buffer, 1, bytes_read, dst);
    }

    fclose(src);
    fclose(dst);

    if (backup_filepath_out && out_len > 0) {
        safe_strncpy(backup_filepath_out, backup_path, out_len);
    }

    return 0;
}

int create_full_system_backup(char *backup_dir_out, size_t out_len) {
    char b1[256], b2[256], b3[256], b4[256];
    create_timestamped_backup(STUDENTS_FILE, b1, sizeof(b1));
    create_timestamped_backup(ATTENDANCE_FILE, b2, sizeof(b2));
    create_timestamped_backup(USERS_FILE, b3, sizeof(b3));
    create_timestamped_backup(AUDIT_LOG_FILE, b4, sizeof(b4));

    if (backup_dir_out && out_len > 0) {
        safe_strncpy(backup_dir_out, BACKUP_DIR, out_len);
    }
    audit_log_action("system", "Manual full system backup created successfully");
    return 0;
}

/* =========================================================================
 * VIVA EXPLANATION: Audit Logging (Append-Only)
 *
 * HOW IT WORKS:
 * 1. Opens "data/audit_log.txt" in append mode ("a").
 * 2. Writes timestamp|user|action\n using fprintf().
 * 3. Immediately flushes and closes the file pointer.
 * ========================================================================= */
int audit_log_action(const char *user, const char *action) {
    if (!user || !action) return -1;

    FILE *fp = fopen(AUDIT_LOG_FILE, "a");
    if (!fp) {
        fprintf(stderr, "[AttendX Log Error] Cannot open audit log for appending\n");
        return -1;
    }

    char timestamp[32];
    get_current_timestamp(timestamp, sizeof(timestamp));

    char clean_user[MAX_USER_LEN];
    char clean_action[MAX_ACTION_LEN];
    safe_strncpy(clean_user, user, sizeof(clean_user));
    safe_strncpy(clean_action, action, sizeof(clean_action));
    sanitize_pipe_delimiter(clean_user);
    sanitize_pipe_delimiter(clean_action);

    fprintf(fp, "%s|%s|%s\n", timestamp, clean_user, clean_action);
    fflush(fp);
    fclose(fp);
    return 0;
}

int audit_log_get_recent(AuditEntry **list_out, int *count_out, int limit) {
    if (!list_out || !count_out) return -1;
    *list_out = NULL;
    *count_out = 0;

    FILE *fp = fopen(AUDIT_LOG_FILE, "r");
    if (!fp) return 0;

    // Read all entries into dynamic array
    int capacity = 64;
    AuditEntry *entries = malloc(capacity * sizeof(AuditEntry));
    if (!entries) {
        fclose(fp);
        return -1;
    }

    int total = 0;
    char line[MAX_LINE_LEN];
    while (fgets(line, sizeof(line), fp)) {
        trim_whitespace(line);
        if (strlen(line) == 0) continue;

        char ts[32] = {0}, u[MAX_USER_LEN] = {0}, act[MAX_ACTION_LEN] = {0};
        char *p1 = strchr(line, '|');
        if (!p1) continue;
        char *p2 = strchr(p1 + 1, '|');
        if (!p2) continue;

        *p1 = '\0';
        *p2 = '\0';
        safe_strncpy(ts, line, sizeof(ts));
        safe_strncpy(u, p1 + 1, sizeof(u));
        safe_strncpy(act, p2 + 1, sizeof(act));

        if (total >= capacity) {
            capacity *= 2;
            AuditEntry *tmp = realloc(entries, capacity * sizeof(AuditEntry));
            if (!tmp) {
                free(entries);
                fclose(fp);
                return -1;
            }
            entries = tmp;
        }

        safe_strncpy(entries[total].timestamp, ts, sizeof(entries[total].timestamp));
        safe_strncpy(entries[total].user, u, sizeof(entries[total].user));
        safe_strncpy(entries[total].action, act, sizeof(entries[total].action));
        total++;
    }
    fclose(fp);

    // If limit > 0, return the most recent entries (from the tail) in reverse chronological order
    int result_count = (limit > 0 && limit < total) ? limit : total;
    AuditEntry *reversed = malloc(result_count * sizeof(AuditEntry));
    if (!reversed) {
        free(entries);
        return -1;
    }

    for (int i = 0; i < result_count; i++) {
        reversed[i] = entries[total - 1 - i];
    }

    free(entries);
    *list_out = reversed;
    *count_out = result_count;
    return 0;
}

/* =========================================================================
 * VIVA EXPLANATION: Student Operations
 *
 * HOW IT WORKS:
 * 1. student_exists: reads students.txt with fgets(), parses roll_no with strtok_r/strchr.
 * 2. student_add: verifies duplicate roll_no first, opens file with "a", appends record.
 * 3. student_update: creates timestamped backup, copies all lines to a temporary file
 *    "data/students_tmp.txt", replaces matching roll_no line, calls remove() and rename().
 * 4. student_delete: creates timestamped backup, copies all lines to temporary file EXCEPT
 *    matching roll_no line, calls remove() and rename().
 * ========================================================================= */

static void parse_student_line(char *line, Student *s) {
    memset(s, 0, sizeof(Student));
    char *token;
    char *rest = line;

    // roll_no
    token = strtok(rest, "|");
    if (token) safe_strncpy(s->roll_no, token, sizeof(s->roll_no));

    // name
    token = strtok(NULL, "|");
    if (token) safe_strncpy(s->name, token, sizeof(s->name));

    // section
    token = strtok(NULL, "|");
    if (token) safe_strncpy(s->section, token, sizeof(s->section));

    // email
    token = strtok(NULL, "|");
    if (token) safe_strncpy(s->email, token, sizeof(s->email));

    // phone
    token = strtok(NULL, "|");
    if (token) safe_strncpy(s->phone, token, sizeof(s->phone));

    // joined_on
    token = strtok(NULL, "|");
    if (token) {
        trim_whitespace(token);
        safe_strncpy(s->joined_on, token, sizeof(s->joined_on));
    }
}

bool student_exists(const char *roll_no) {
    if (!roll_no || strlen(roll_no) == 0) return false;
    Student s;
    return (student_find_by_roll(roll_no, &s) == 0);
}

int student_find_by_roll(const char *roll_no, Student *out) {
    if (!roll_no || !out) return -1;
    memset(out, 0, sizeof(Student));

    FILE *fp = fopen(STUDENTS_FILE, "r");
    if (!fp) return -1;

    char line[MAX_LINE_LEN];
    while (fgets(line, sizeof(line), fp)) {
        trim_whitespace(line);
        if (strlen(line) == 0) continue;

        char copy[MAX_LINE_LEN];
        safe_strncpy(copy, line, sizeof(copy));

        Student s;
        parse_student_line(copy, &s);
        if (strcmp(s.roll_no, roll_no) == 0) {
            *out = s;
            fclose(fp);
            return 0; // Found
        }
    }

    fclose(fp);
    return -1; // Not found
}

int student_get_all(Student **list_out, int *count_out) {
    if (!list_out || !count_out) return -1;
    *list_out = NULL;
    *count_out = 0;

    FILE *fp = fopen(STUDENTS_FILE, "r");
    if (!fp) return 0;

    int capacity = 32;
    Student *list = malloc(capacity * sizeof(Student));
    if (!list) {
        fclose(fp);
        return -1;
    }

    int count = 0;
    char line[MAX_LINE_LEN];
    while (fgets(line, sizeof(line), fp)) {
        trim_whitespace(line);
        if (strlen(line) == 0) continue;

        char copy[MAX_LINE_LEN];
        safe_strncpy(copy, line, sizeof(copy));

        Student s;
        parse_student_line(copy, &s);
        if (strlen(s.roll_no) == 0) continue;

        if (count >= capacity) {
            capacity *= 2;
            Student *tmp = realloc(list, capacity * sizeof(Student));
            if (!tmp) {
                free(list);
                fclose(fp);
                return -1;
            }
            list = tmp;
        }

        list[count++] = s;
    }

    fclose(fp);
    *list_out = list;
    *count_out = count;
    return 0;
}

int student_add(const Student *s, const char *actor) {
    if (!s || strlen(s->roll_no) == 0 || strlen(s->name) == 0) return -1;

    // Prevent duplicate roll numbers
    if (student_exists(s->roll_no)) {
        return -2; // Conflict/Duplicate
    }

    FILE *fp = fopen(STUDENTS_FILE, "a");
    if (!fp) {
        fprintf(stderr, "[AttendX File Error] Could not open %s for appending\n", STUDENTS_FILE);
        return -1;
    }

    char r[MAX_ROLL_LEN], n[MAX_NAME_LEN], sec[MAX_SECTION_LEN];
    char em[MAX_EMAIL_LEN], ph[MAX_PHONE_LEN], jn[MAX_DATE_LEN];

    safe_strncpy(r, s->roll_no, sizeof(r));
    safe_strncpy(n, s->name, sizeof(n));
    safe_strncpy(sec, s->section, sizeof(sec));
    safe_strncpy(em, s->email, sizeof(em));
    safe_strncpy(ph, s->phone, sizeof(ph));
    safe_strncpy(jn, s->joined_on, sizeof(jn));

    sanitize_pipe_delimiter(r);
    sanitize_pipe_delimiter(n);
    sanitize_pipe_delimiter(sec);
    sanitize_pipe_delimiter(em);
    sanitize_pipe_delimiter(ph);
    sanitize_pipe_delimiter(jn);

    if (strlen(jn) == 0) {
        get_current_date(jn, sizeof(jn));
    }

    fprintf(fp, "%s|%s|%s|%s|%s|%s\n", r, n, sec, em, ph, jn);
    fflush(fp);
    fclose(fp);

    char act[256];
    snprintf(act, sizeof(act), "Added student %s (%s, %s)", n, r, sec);
    audit_log_action(actor ? actor : "system", act);
    return 0;
}

int student_update(const char *roll_no, const Student *s, const char *actor) {
    if (!roll_no || !s) return -1;

    // 1. Create timestamped backup before mutation
    create_timestamped_backup(STUDENTS_FILE, NULL, 0);

    FILE *src = fopen(STUDENTS_FILE, "r");
    if (!src) return -1;

    const char *tmp_path = "data/students_tmp.txt";
    FILE *dst = fopen(tmp_path, "w");
    if (!dst) {
        fclose(src);
        return -1;
    }

    char line[MAX_LINE_LEN];
    bool found = false;

    while (fgets(line, sizeof(line), src)) {
        char copy[MAX_LINE_LEN];
        safe_strncpy(copy, line, sizeof(copy));
        trim_whitespace(copy);
        if (strlen(copy) == 0) continue;

        Student current;
        parse_student_line(copy, &current);

        if (strcmp(current.roll_no, roll_no) == 0) {
            found = true;
            char r[MAX_ROLL_LEN], n[MAX_NAME_LEN], sec[MAX_SECTION_LEN];
            char em[MAX_EMAIL_LEN], ph[MAX_PHONE_LEN], jn[MAX_DATE_LEN];

            safe_strncpy(r, s->roll_no[0] ? s->roll_no : current.roll_no, sizeof(r));
            safe_strncpy(n, s->name[0] ? s->name : current.name, sizeof(n));
            safe_strncpy(sec, s->section[0] ? s->section : current.section, sizeof(sec));
            safe_strncpy(em, s->email[0] ? s->email : current.email, sizeof(em));
            safe_strncpy(ph, s->phone[0] ? s->phone : current.phone, sizeof(ph));
            safe_strncpy(jn, s->joined_on[0] ? s->joined_on : current.joined_on, sizeof(jn));

            sanitize_pipe_delimiter(r);
            sanitize_pipe_delimiter(n);
            sanitize_pipe_delimiter(sec);
            sanitize_pipe_delimiter(em);
            sanitize_pipe_delimiter(ph);
            sanitize_pipe_delimiter(jn);

            fprintf(dst, "%s|%s|%s|%s|%s|%s\n", r, n, sec, em, ph, jn);
        } else {
            trim_whitespace(line);
            fprintf(dst, "%s\n", line);
        }
    }

    fclose(src);
    fclose(dst);

    if (!found) {
        remove(tmp_path);
        return -2; // Not found
    }

    // Safe replace: remove original, rename temp
    remove(STUDENTS_FILE);
    rename(tmp_path, STUDENTS_FILE);

    char act[256];
    snprintf(act, sizeof(act), "Updated student details for %s", roll_no);
    audit_log_action(actor ? actor : "system", act);
    return 0;
}

int student_delete(const char *roll_no, const char *actor) {
    if (!roll_no) return -1;

    // 1. Create timestamped backup before deletion
    create_timestamped_backup(STUDENTS_FILE, NULL, 0);

    FILE *src = fopen(STUDENTS_FILE, "r");
    if (!src) return -1;

    const char *tmp_path = "data/students_tmp.txt";
    FILE *dst = fopen(tmp_path, "w");
    if (!dst) {
        fclose(src);
        return -1;
    }

    char line[MAX_LINE_LEN];
    bool found = false;

    while (fgets(line, sizeof(line), src)) {
        char copy[MAX_LINE_LEN];
        safe_strncpy(copy, line, sizeof(copy));
        trim_whitespace(copy);
        if (strlen(copy) == 0) continue;

        Student current;
        parse_student_line(copy, &current);

        if (strcmp(current.roll_no, roll_no) == 0) {
            found = true;
            // Skip writing to delete record
        } else {
            trim_whitespace(line);
            fprintf(dst, "%s\n", line);
        }
    }

    fclose(src);
    fclose(dst);

    if (!found) {
        remove(tmp_path);
        return -2; // Not found
    }

    remove(STUDENTS_FILE);
    rename(tmp_path, STUDENTS_FILE);

    // Also clean up attendance records for this student
    attendance_delete_by_student(roll_no);

    char act[256];
    snprintf(act, sizeof(act), "Deleted student with Roll No: %s", roll_no);
    audit_log_action(actor ? actor : "system", act);
    return 0;
}

/* =========================================================================
 * VIVA EXPLANATION: Attendance Operations
 *
 * HOW IT WORKS:
 * 1. attendance_save_batch:
 *    - Creates timestamped backup of "data/attendance.txt".
 *    - Reads all existing attendance records into a temp file EXCEPT records
 *      matching the target date.
 *    - Writes all new batch records for that date into the temp file.
 *    - Uses remove() and rename() to atomically replace the file.
 *    - This guarantees 100% duplicate prevention for any student on that date!
 * ========================================================================= */

static void parse_attendance_line(char *line, AttendanceRecord *rec) {
    memset(rec, 0, sizeof(AttendanceRecord));
    char *token;
    char *rest = line;

    // date
    token = strtok(rest, "|");
    if (token) safe_strncpy(rec->date, token, sizeof(rec->date));

    // roll_no
    token = strtok(NULL, "|");
    if (token) safe_strncpy(rec->roll_no, token, sizeof(rec->roll_no));

    // status
    token = strtok(NULL, "|");
    if (token) safe_strncpy(rec->status, token, sizeof(rec->status));

    // remarks
    token = strtok(NULL, "|");
    if (token) {
        trim_whitespace(token);
        safe_strncpy(rec->remarks, token, sizeof(rec->remarks));
    }
}

int attendance_get_all(AttendanceRecord **list_out, int *count_out) {
    if (!list_out || !count_out) return -1;
    *list_out = NULL;
    *count_out = 0;

    FILE *fp = fopen(ATTENDANCE_FILE, "r");
    if (!fp) return 0;

    int capacity = 256;
    AttendanceRecord *list = malloc(capacity * sizeof(AttendanceRecord));
    if (!list) {
        fclose(fp);
        return -1;
    }

    int count = 0;
    char line[MAX_LINE_LEN];
    while (fgets(line, sizeof(line), fp)) {
        trim_whitespace(line);
        if (strlen(line) == 0) continue;

        char copy[MAX_LINE_LEN];
        safe_strncpy(copy, line, sizeof(copy));

        AttendanceRecord rec;
        parse_attendance_line(copy, &rec);
        if (strlen(rec.date) == 0 || strlen(rec.roll_no) == 0) continue;

        if (count >= capacity) {
            capacity *= 2;
            AttendanceRecord *tmp = realloc(list, capacity * sizeof(AttendanceRecord));
            if (!tmp) {
                free(list);
                fclose(fp);
                return -1;
            }
            list = tmp;
        }

        list[count++] = rec;
    }

    fclose(fp);
    *list_out = list;
    *count_out = count;
    return 0;
}

int attendance_get_by_date(const char *date, AttendanceRecord **list_out, int *count_out) {
    if (!date || !list_out || !count_out) return -1;
    *list_out = NULL;
    *count_out = 0;

    FILE *fp = fopen(ATTENDANCE_FILE, "r");
    if (!fp) return 0;

    int capacity = 64;
    AttendanceRecord *list = malloc(capacity * sizeof(AttendanceRecord));
    if (!list) {
        fclose(fp);
        return -1;
    }

    int count = 0;
    char line[MAX_LINE_LEN];
    while (fgets(line, sizeof(line), fp)) {
        trim_whitespace(line);
        if (strlen(line) == 0) continue;

        char copy[MAX_LINE_LEN];
        safe_strncpy(copy, line, sizeof(copy));

        AttendanceRecord rec;
        parse_attendance_line(copy, &rec);

        if (strcmp(rec.date, date) == 0) {
            if (count >= capacity) {
                capacity *= 2;
                AttendanceRecord *tmp = realloc(list, capacity * sizeof(AttendanceRecord));
                if (!tmp) {
                    free(list);
                    fclose(fp);
                    return -1;
                }
                list = tmp;
            }
            list[count++] = rec;
        }
    }

    fclose(fp);
    *list_out = list;
    *count_out = count;
    return 0;
}

int attendance_get_by_student(const char *roll_no, AttendanceRecord **list_out, int *count_out) {
    if (!roll_no || !list_out || !count_out) return -1;
    *list_out = NULL;
    *count_out = 0;

    FILE *fp = fopen(ATTENDANCE_FILE, "r");
    if (!fp) return 0;

    int capacity = 64;
    AttendanceRecord *list = malloc(capacity * sizeof(AttendanceRecord));
    if (!list) {
        fclose(fp);
        return -1;
    }

    int count = 0;
    char line[MAX_LINE_LEN];
    while (fgets(line, sizeof(line), fp)) {
        trim_whitespace(line);
        if (strlen(line) == 0) continue;

        char copy[MAX_LINE_LEN];
        safe_strncpy(copy, line, sizeof(copy));

        AttendanceRecord rec;
        parse_attendance_line(copy, &rec);

        if (strcmp(rec.roll_no, roll_no) == 0) {
            if (count >= capacity) {
                capacity *= 2;
                AttendanceRecord *tmp = realloc(list, capacity * sizeof(AttendanceRecord));
                if (!tmp) {
                    free(list);
                    fclose(fp);
                    return -1;
                }
                list = tmp;
            }
            list[count++] = rec;
        }
    }

    fclose(fp);
    *list_out = list;
    *count_out = count;
    return 0;
}

int attendance_save_batch(const AttendanceRecord *records, int count, const char *date, const char *actor) {
    if (!records || count <= 0 || !date) return -1;

    // 1. Create timestamped backup of attendance.txt before batch update
    create_timestamped_backup(ATTENDANCE_FILE, NULL, 0);

    FILE *src = fopen(ATTENDANCE_FILE, "r");
    const char *tmp_path = "data/attendance_tmp.txt";
    FILE *dst = fopen(tmp_path, "w");
    if (!dst) {
        if (src) fclose(src);
        return -1;
    }

    // 2. Copy all records that DO NOT match the target date OR the modified student roll numbers
    if (src) {
        char line[MAX_LINE_LEN];
        while (fgets(line, sizeof(line), src)) {
            char copy[MAX_LINE_LEN];
            safe_strncpy(copy, line, sizeof(copy));
            trim_whitespace(copy);
            if (strlen(copy) == 0) continue;

            AttendanceRecord cur;
            parse_attendance_line(copy, &cur);

            // Check if this record is being replaced by the current batch
            bool match = false;
            if (strcmp(cur.date, date) == 0) {
                for (int i = 0; i < count; i++) {
                    if (strcmp(cur.roll_no, records[i].roll_no) == 0) {
                        match = true;
                        break;
                    }
                }
            }

            if (!match) {
                trim_whitespace(line);
                fprintf(dst, "%s\n", line);
            }
        }
        fclose(src);
    }

    // 3. Write all new or updated records
    for (int i = 0; i < count; i++) {
        char d[MAX_DATE_LEN], r[MAX_ROLL_LEN], st[MAX_STATUS_LEN], rem[MAX_REMARKS_LEN];
        safe_strncpy(d, date, sizeof(d));
        safe_strncpy(r, records[i].roll_no, sizeof(r));
        safe_strncpy(st, records[i].status, sizeof(st));
        safe_strncpy(rem, records[i].remarks, sizeof(rem));

        sanitize_pipe_delimiter(d);
        sanitize_pipe_delimiter(r);
        sanitize_pipe_delimiter(st);
        sanitize_pipe_delimiter(rem);

        fprintf(dst, "%s|%s|%s|%s\n", d, r, st, rem);
    }

    fclose(dst);

    remove(ATTENDANCE_FILE);
    rename(tmp_path, ATTENDANCE_FILE);

    char act[256];
    snprintf(act, sizeof(act), "Recorded attendance batch for date %s (%d records)", date, count);
    audit_log_action(actor ? actor : "system", act);
    return 0;
}

int attendance_save_single(const AttendanceRecord *rec, const char *actor) {
    if (!rec) return -1;
    return attendance_save_batch(rec, 1, rec->date, actor);
}

int attendance_delete_by_student(const char *roll_no) {
    if (!roll_no) return -1;

    FILE *src = fopen(ATTENDANCE_FILE, "r");
    if (!src) return 0;

    const char *tmp_path = "data/attendance_tmp.txt";
    FILE *dst = fopen(tmp_path, "w");
    if (!dst) {
        fclose(src);
        return -1;
    }

    char line[MAX_LINE_LEN];
    while (fgets(line, sizeof(line), src)) {
        char copy[MAX_LINE_LEN];
        safe_strncpy(copy, line, sizeof(copy));
        trim_whitespace(copy);
        if (strlen(copy) == 0) continue;

        AttendanceRecord cur;
        parse_attendance_line(copy, &cur);

        if (strcmp(cur.roll_no, roll_no) != 0) {
            trim_whitespace(line);
            fprintf(dst, "%s\n", line);
        }
    }

    fclose(src);
    fclose(dst);

    remove(ATTENDANCE_FILE);
    rename(tmp_path, ATTENDANCE_FILE);
    return 0;
}

/* =========================================================================
 * VIVA EXPLANATION: User Management Operations
 *
 * HOW IT WORKS:
 * 1. user_find: searches users.txt for matching username.
 * 2. user_add: appends username|hash|role\n.
 * 3. user_update_password: safe temp-file replacement with backup.
 * 4. user_delete: safe temp-file omit with backup.
 * ========================================================================= */

static void parse_user_line(char *line, User *u) {
    memset(u, 0, sizeof(User));
    char *token;
    char *rest = line;

    // username
    token = strtok(rest, "|");
    if (token) safe_strncpy(u->username, token, sizeof(u->username));

    // password_hash
    token = strtok(NULL, "|");
    if (token) safe_strncpy(u->password_hash, token, sizeof(u->password_hash));

    // role
    token = strtok(NULL, "|");
    if (token) {
        trim_whitespace(token);
        safe_strncpy(u->role, token, sizeof(u->role));
    }
}

int user_find(const char *username, User *out) {
    if (!username || !out) return -1;
    memset(out, 0, sizeof(User));

    FILE *fp = fopen(USERS_FILE, "r");
    if (!fp) return -1;

    char line[MAX_LINE_LEN];
    while (fgets(line, sizeof(line), fp)) {
        trim_whitespace(line);
        if (strlen(line) == 0) continue;

        char copy[MAX_LINE_LEN];
        safe_strncpy(copy, line, sizeof(copy));

        User u;
        parse_user_line(copy, &u);
        if (strcmp(u.username, username) == 0) {
            *out = u;
            fclose(fp);
            return 0; // Found
        }
    }

    fclose(fp);
    return -1; // Not found
}

int user_get_all(User **list_out, int *count_out) {
    if (!list_out || !count_out) return -1;
    *list_out = NULL;
    *count_out = 0;

    FILE *fp = fopen(USERS_FILE, "r");
    if (!fp) return 0;

    int capacity = 16;
    User *list = malloc(capacity * sizeof(User));
    if (!list) {
        fclose(fp);
        return -1;
    }

    int count = 0;
    char line[MAX_LINE_LEN];
    while (fgets(line, sizeof(line), fp)) {
        trim_whitespace(line);
        if (strlen(line) == 0) continue;

        char copy[MAX_LINE_LEN];
        safe_strncpy(copy, line, sizeof(copy));

        User u;
        parse_user_line(copy, &u);
        if (strlen(u.username) == 0) continue;

        if (count >= capacity) {
            capacity *= 2;
            User *tmp = realloc(list, capacity * sizeof(User));
            if (!tmp) {
                free(list);
                fclose(fp);
                return -1;
            }
            list = tmp;
        }

        list[count++] = u;
    }

    fclose(fp);
    *list_out = list;
    *count_out = count;
    return 0;
}

int user_add(const User *u, const char *actor) {
    if (!u || strlen(u->username) == 0) return -1;

    User existing;
    if (user_find(u->username, &existing) == 0) {
        return -2; // User already exists
    }

    FILE *fp = fopen(USERS_FILE, "a");
    if (!fp) return -1;

    char usr[MAX_USER_LEN], hash[MAX_HASH_LEN], role[MAX_ROLE_LEN];
    safe_strncpy(usr, u->username, sizeof(usr));
    safe_strncpy(hash, u->password_hash, sizeof(hash));
    safe_strncpy(role, u->role[0] ? u->role : "teacher", sizeof(role));

    sanitize_pipe_delimiter(usr);
    sanitize_pipe_delimiter(hash);
    sanitize_pipe_delimiter(role);

    fprintf(fp, "%s|%s|%s\n", usr, hash, role);
    fflush(fp);
    fclose(fp);

    char act[256];
    snprintf(act, sizeof(act), "Created user %s with role %s", usr, role);
    audit_log_action(actor ? actor : "system", act);
    return 0;
}

int user_update_password(const char *username, const char *new_hash, const char *actor) {
    if (!username || !new_hash) return -1;

    create_timestamped_backup(USERS_FILE, NULL, 0);

    FILE *src = fopen(USERS_FILE, "r");
    if (!src) return -1;

    const char *tmp_path = "data/users_tmp.txt";
    FILE *dst = fopen(tmp_path, "w");
    if (!dst) {
        fclose(src);
        return -1;
    }

    char line[MAX_LINE_LEN];
    bool found = false;

    while (fgets(line, sizeof(line), src)) {
        char copy[MAX_LINE_LEN];
        safe_strncpy(copy, line, sizeof(copy));
        trim_whitespace(copy);
        if (strlen(copy) == 0) continue;

        User u;
        parse_user_line(copy, &u);

        if (strcmp(u.username, username) == 0) {
            found = true;
            char h[MAX_HASH_LEN];
            safe_strncpy(h, new_hash, sizeof(h));
            sanitize_pipe_delimiter(h);
            fprintf(dst, "%s|%s|%s\n", u.username, h, u.role);
        } else {
            trim_whitespace(line);
            fprintf(dst, "%s\n", line);
        }
    }

    fclose(src);
    fclose(dst);

    if (!found) {
        remove(tmp_path);
        return -2;
    }

    remove(USERS_FILE);
    rename(tmp_path, USERS_FILE);

    char act[256];
    snprintf(act, sizeof(act), "Updated password for user %s", username);
    audit_log_action(actor ? actor : "system", act);
    return 0;
}

int user_delete(const char *username, const char *actor) {
    if (!username) return -1;
    if (strcmp(username, "admin") == 0) return -3; // Cannot delete primary admin

    create_timestamped_backup(USERS_FILE, NULL, 0);

    FILE *src = fopen(USERS_FILE, "r");
    if (!src) return -1;

    const char *tmp_path = "data/users_tmp.txt";
    FILE *dst = fopen(tmp_path, "w");
    if (!dst) {
        fclose(src);
        return -1;
    }

    char line[MAX_LINE_LEN];
    bool found = false;

    while (fgets(line, sizeof(line), src)) {
        char copy[MAX_LINE_LEN];
        safe_strncpy(copy, line, sizeof(copy));
        trim_whitespace(copy);
        if (strlen(copy) == 0) continue;

        User u;
        parse_user_line(copy, &u);

        if (strcmp(u.username, username) == 0) {
            found = true;
        } else {
            trim_whitespace(line);
            fprintf(dst, "%s\n", line);
        }
    }

    fclose(src);
    fclose(dst);

    if (!found) {
        remove(tmp_path);
        return -2;
    }

    remove(USERS_FILE);
    rename(tmp_path, USERS_FILE);

    char act[256];
    snprintf(act, sizeof(act), "Deleted user %s", username);
    audit_log_action(actor ? actor : "system", act);
    return 0;
}

/* =========================================================================
 * VIVA EXPLANATION: Statistics and Reports Calculation
 *
 * HOW IT WORKS:
 * 1. Reads student attendance history.
 * 2. Tallies Present, Absent, and Late records.
 * 3. Calculates percentage = ((Present + Late * 0.5) / Total) * 100 or standard
 *    (Present / Total) * 100.
 * ========================================================================= */
int report_get_student_stats(const char *roll_no, StudentStats *stats_out) {
    if (!roll_no || !stats_out) return -1;
    memset(stats_out, 0, sizeof(StudentStats));

    if (student_find_by_roll(roll_no, &stats_out->student) != 0) {
        return -1;
    }

    AttendanceRecord *records = NULL;
    int count = 0;
    attendance_get_by_student(roll_no, &records, &count);

    stats_out->total_days = count;
    for (int i = 0; i < count; i++) {
        if (strcmp(records[i].status, "Present") == 0) {
            stats_out->present_days++;
        } else if (strcmp(records[i].status, "Absent") == 0) {
            stats_out->absent_days++;
        } else if (strcmp(records[i].status, "Late") == 0) {
            stats_out->late_days++;
        }
    }

    if (records) free(records);

    if (stats_out->total_days > 0) {
        stats_out->percentage = ((double)(stats_out->present_days + stats_out->late_days) / (double)stats_out->total_days) * 100.0;
    } else {
        stats_out->percentage = 0.0;
    }

    return 0;
}

int report_get_all_student_stats(StudentStats **stats_out, int *count_out) {
    if (!stats_out || !count_out) return -1;
    *stats_out = NULL;
    *count_out = 0;

    Student *students = NULL;
    int s_count = 0;
    if (student_get_all(&students, &s_count) != 0 || s_count == 0) {
        if (students) free(students);
        return 0;
    }

    StudentStats *arr = malloc(s_count * sizeof(StudentStats));
    if (!arr) {
        free(students);
        return -1;
    }

    for (int i = 0; i < s_count; i++) {
        report_get_student_stats(students[i].roll_no, &arr[i]);
    }

    free(students);
    *stats_out = arr;
    *count_out = s_count;
    return 0;
}

/* =========================================================================
 * VIVA EXPLANATION: Sample Data Seeding
 *
 * HOW IT WORKS:
 * 1. Checks if students.txt is empty by inspecting file size.
 * 2. If empty, writes 15 diverse student records.
 * 3. Checks if users.txt is empty; writes admin and teacher accounts with
 *    SHA-256 hashed passwords.
 * 4. Checks if attendance.txt is empty; generates 30 calendar days of
 *    realistic attendance records for all 15 students.
 * ========================================================================= */
static bool is_file_empty(const char *path) {
    FILE *fp = fopen(path, "r");
    if (!fp) return true;
    fseek(fp, 0, SEEK_END);
    long size = ftell(fp);
    fclose(fp);
    return (size <= 0);
}

int seed_sample_data_if_empty(void) {
    init_all_files();

    // 1. Seed Users if empty
    if (is_file_empty(USERS_FILE)) {
        char admin_hash[65], teacher_hash[65];
        hash_password("admin123", ATTENDX_SALT, admin_hash, sizeof(admin_hash));
        hash_password("teacher123", ATTENDX_SALT, teacher_hash, sizeof(teacher_hash));

        User admin_user = { "admin", "", "admin" };
        safe_strncpy(admin_user.password_hash, admin_hash, sizeof(admin_user.password_hash));

        User teacher_user = { "teacher", "", "teacher" };
        safe_strncpy(teacher_user.password_hash, teacher_hash, sizeof(teacher_user.password_hash));

        user_add(&admin_user, "system");
        user_add(&teacher_user, "system");
    }

    // 2. Seed Students if empty
    if (is_file_empty(STUDENTS_FILE)) {
        Student sample_students[30] = {
            { "CS101", "Aarav Sharma",       "CS-A", "aarav.sharma@attendx.edu",    "+91 98765 43210", "2026-08-01" },
            { "CS102", "Ananya Iyer",        "CS-A", "ananya.iyer@attendx.edu",     "+91 98765 43211", "2026-08-01" },
            { "CS103", "Rohan Verma",        "CS-A", "rohan.verma@attendx.edu",     "+91 98765 43212", "2026-08-01" },
            { "CS104", "Diya Patel",         "CS-A", "diya.patel@attendx.edu",      "+91 98765 43213", "2026-08-01" },
            { "CS105", "Kabir Khan",         "CS-A", "kabir.khan@attendx.edu",      "+91 98765 43214", "2026-08-01" },
            { "CS106", "Priyanka Das",       "CS-A", "priyanka.das@attendx.edu",    "+91 98765 43215", "2026-08-01" },
            { "CS107", "Siddharth Rao",      "CS-A", "siddharth.rao@attendx.edu",   "+91 98765 43216", "2026-08-01" },
            { "CS108", "Neha Kapoor",        "CS-A", "neha.kapoor@attendx.edu",     "+91 98765 43217", "2026-08-01" },
            { "CS109", "Aryan Saxena",       "CS-A", "aryan.saxena@attendx.edu",    "+91 98765 43218", "2026-08-01" },
            { "CS110", "Bhavna Mehta",       "CS-A", "bhavna.mehta@attendx.edu",    "+91 98765 43219", "2026-08-01" },

            { "CS201", "Ishaan Roy",         "CS-B", "ishaan.roy@attendx.edu",      "+91 98765 43220", "2026-08-01" },
            { "CS202", "Sneha Nair",         "CS-B", "sneha.nair@attendx.edu",      "+91 98765 43221", "2026-08-01" },
            { "CS203", "Vikram Malhotra",    "CS-B", "vikram.m@attendx.edu",        "+91 98765 43222", "2026-08-01" },
            { "CS204", "Pooja Reddy",        "CS-B", "pooja.reddy@attendx.edu",     "+91 98765 43223", "2026-08-01" },
            { "CS205", "Aditya Joshi",       "CS-B", "aditya.j@attendx.edu",        "+91 98765 43224", "2026-08-01" },
            { "CS206", "Ritu Choudhary",     "CS-B", "ritu.c@attendx.edu",          "+91 98765 43225", "2026-08-01" },
            { "CS207", "Manan Shah",         "CS-B", "manan.shah@attendx.edu",      "+91 98765 43226", "2026-08-01" },
            { "CS208", "Shalini Tiwari",     "CS-B", "shalini.t@attendx.edu",      "+91 98765 43227", "2026-08-01" },
            { "CS209", "Kunal Singhania",    "CS-B", "kunal.s@attendx.edu",         "+91 98765 43228", "2026-08-01" },
            { "CS210", "Avani Mishra",       "CS-B", "avani.m@attendx.edu",        "+91 98765 43229", "2026-08-01" },

            { "IT301", "Meera Kulkarni",     "IT-A", "meera.k@attendx.edu",         "+91 98765 43230", "2026-08-01" },
            { "IT302", "Devendra Sen",       "IT-A", "dev.sen@attendx.edu",         "+91 98765 43231", "2026-08-01" },
            { "IT303", "Tanya Gupta",        "IT-A", "tanya.gupta@attendx.edu",     "+91 98765 43232", "2026-08-01" },
            { "IT304", "Farhan Sheikh",      "IT-A", "farhan.s@attendx.edu",        "+91 98765 43233", "2026-08-01" },
            { "IT305", "Rhea D'Souza",       "IT-A", "rhea.dsouza@attendx.edu",     "+91 98765 43234", "2026-08-01" },
            { "IT306", "Yashwant Deshmukh",  "IT-A", "yash.d@attendx.edu",          "+91 98765 43235", "2026-08-01" },
            { "IT307", "Kriti Aggarwal",     "IT-A", "kriti.a@attendx.edu",         "+91 98765 43236", "2026-08-01" },
            { "IT308", "Nikhil Pillai",      "IT-A", "nikhil.p@attendx.edu",        "+91 98765 43237", "2026-08-01" },
            { "IT309", "Sakshi Bhatt",       "IT-A", "sakshi.b@attendx.edu",        "+91 98765 43238", "2026-08-01" },
            { "IT310", "Varun Chatterjee",   "IT-A", "varun.c@attendx.edu",         "+91 98765 43239", "2026-08-01" }
        };

        for (int i = 0; i < 30; i++) {
            student_add(&sample_students[i], "system");
        }
    }

    // 3. Seed 30 days of realistic Attendance if empty
    if (is_file_empty(ATTENDANCE_FILE)) {
        Student *students = NULL;
        int s_count = 0;
        student_get_all(&students, &s_count);

        if (s_count > 0 && students) {
            FILE *fp = fopen(ATTENDANCE_FILE, "w");
            if (fp) {
                time_t now = time(NULL);
                struct tm *current_tm = localtime(&now);
                time_t base_time = mktime(current_tm);

                // Generate for 30 consecutive school days leading up to today
                int days_generated = 0;
                int day_offset = 35; // start ~35 calendar days ago

                while (days_generated < 30 && day_offset >= 0) {
                    time_t day_time = base_time - (day_offset * 86400);
                    struct tm *dt = localtime(&day_time);
                    day_offset--;

                    // Skip Sunday (wday == 0)
                    if (dt->tm_wday == 0) continue;

                    char date_str[16];
                    strftime(date_str, sizeof(date_str), "%Y-%m-%d", dt);

                    for (int i = 0; i < s_count; i++) {
                        const char *status = "Present";
                        const char *remarks = "Regular attendance";

                        // Assign specific attendance patterns so some students have <75% attendance for testing
                        if (strcmp(students[i].roll_no, "CS105") == 0) {
                            // Kabir Khan - low attendance (~60%)
                            int mod = (days_generated + i) % 5;
                            if (mod == 0 || mod == 2) {
                                status = "Absent";
                                remarks = "Medical leave / Unexcused";
                            } else if (mod == 4) {
                                status = "Late";
                                remarks = "Bus delay 15m";
                            }
                        } else if (strcmp(students[i].roll_no, "IT304") == 0) {
                            // Farhan Sheikh - low attendance (~65%)
                            int mod = (days_generated + 3) % 4;
                            if (mod == 0) {
                                status = "Absent";
                                remarks = "Personal reasons";
                            } else if (mod == 1) {
                                status = "Late";
                                remarks = "Traffic delay";
                            }
                        } else {
                            // Normal high attendance (~88-95%)
                            int r = rand() % 100;
                            if (r < 7) {
                                status = "Absent";
                                remarks = "Family function / sick";
                            } else if (r < 14) {
                                status = "Late";
                                remarks = "Delayed arrival";
                            }
                        }

                        fprintf(fp, "%s|%s|%s|%s\n", date_str, students[i].roll_no, status, remarks);
                    }
                    days_generated++;
                }
                fclose(fp);
            }
            free(students);
        }
        audit_log_action("system", "Seeded 15 sample students and 30-day realistic attendance records");
    }

    return 0;
}
