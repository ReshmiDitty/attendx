#ifndef FILE_HANDLER_H
#define FILE_HANDLER_H

#include <stddef.h>
#include <stdbool.h>

#define DATA_DIR "data"
#define BACKUP_DIR "backups"

#define STUDENTS_FILE    "data/students.txt"
#define ATTENDANCE_FILE  "data/attendance.txt"
#define USERS_FILE       "data/users.txt"
#define AUDIT_LOG_FILE   "data/audit_log.txt"

// Maximum buffer lengths
#define MAX_LINE_LEN 1024
#define MAX_ROLL_LEN 32
#define MAX_NAME_LEN 128
#define MAX_SECTION_LEN 32
#define MAX_EMAIL_LEN 128
#define MAX_PHONE_LEN 32
#define MAX_DATE_LEN 16
#define MAX_STATUS_LEN 16
#define MAX_REMARKS_LEN 128
#define MAX_USER_LEN 64
#define MAX_ROLE_LEN 32
#define MAX_HASH_LEN 128
#define MAX_ACTION_LEN 256

/* =========================================================================
 * Core C Data Structures
 * ========================================================================= */

typedef struct {
    char roll_no[MAX_ROLL_LEN];
    char name[MAX_NAME_LEN];
    char section[MAX_SECTION_LEN];
    char email[MAX_EMAIL_LEN];
    char phone[MAX_PHONE_LEN];
    char joined_on[MAX_DATE_LEN];
} Student;

typedef struct {
    char date[MAX_DATE_LEN];        // Format: YYYY-MM-DD
    char roll_no[MAX_ROLL_LEN];
    char status[MAX_STATUS_LEN];    // "Present", "Absent", "Late"
    char remarks[MAX_REMARKS_LEN];
} AttendanceRecord;

typedef struct {
    char username[MAX_USER_LEN];
    char password_hash[MAX_HASH_LEN];
    char role[MAX_ROLE_LEN];        // "admin" or "teacher"
} User;

typedef struct {
    char timestamp[32];             // Format: YYYY-MM-DD HH:MM:SS
    char user[MAX_USER_LEN];
    char action[MAX_ACTION_LEN];
} AuditEntry;

// Summary structure for student profile and reports
typedef struct {
    Student student;
    int total_days;
    int present_days;
    int absent_days;
    int late_days;
    double percentage;
} StudentStats;

/* =========================================================================
 * Directory and File Initialization Functions
 * ========================================================================= */

int ensure_directories(void);
int init_all_files(void);
int seed_sample_data_if_empty(void);

/* =========================================================================
 * Safe File Operations & Backups
 * ========================================================================= */

// Creates a timestamped duplicate of a file in /backups using fread/fwrite
int create_timestamped_backup(const char *source_filepath, char *backup_filepath_out, size_t out_len);

// Manual backup of all database files
int create_full_system_backup(char *backup_dir_out, size_t out_len);

/* =========================================================================
 * Student Operations (CRUD)
 * ========================================================================= */

int student_add(const Student *s, const char *actor);
int student_get_all(Student **list_out, int *count_out);
int student_find_by_roll(const char *roll_no, Student *out);
int student_update(const char *roll_no, const Student *s, const char *actor);
int student_delete(const char *roll_no, const char *actor);
bool student_exists(const char *roll_no);

/* =========================================================================
 * Attendance Operations (CRUD & Queries)
 * ========================================================================= */

int attendance_save_single(const AttendanceRecord *rec, const char *actor);
int attendance_save_batch(const AttendanceRecord *records, int count, const char *date, const char *actor);
int attendance_get_by_date(const char *date, AttendanceRecord **list_out, int *count_out);
int attendance_get_by_student(const char *roll_no, AttendanceRecord **list_out, int *count_out);
int attendance_get_all(AttendanceRecord **list_out, int *count_out);
int attendance_delete_by_student(const char *roll_no);

/* =========================================================================
 * User Operations (Authentication & Management)
 * ========================================================================= */

int user_add(const User *u, const char *actor);
int user_find(const char *username, User *out);
int user_get_all(User **list_out, int *count_out);
int user_update_password(const char *username, const char *new_hash, const char *actor);
int user_delete(const char *username, const char *actor);

/* =========================================================================
 * Audit Logging Operations
 * ========================================================================= */

int audit_log_action(const char *user, const char *action);
int audit_log_get_recent(AuditEntry **list_out, int *count_out, int limit);

/* =========================================================================
 * Statistics and Reports Generation
 * ========================================================================= */

int report_get_student_stats(const char *roll_no, StudentStats *stats_out);
int report_get_all_student_stats(StudentStats **stats_out, int *count_out);

#endif // FILE_HANDLER_H
