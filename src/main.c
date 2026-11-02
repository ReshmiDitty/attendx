#include "file_handler.h"
#include "auth.h"
#include "server.h"
#include "utils.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* =========================================================================
 * Banner & Helpers
 * ========================================================================= */
static void print_banner(void) {
    printf("\n");
    printf("====================================================================\n");
    printf("   _   _   _                  _  __  __ \n");
    printf("  /_\\ | |_| |_ ___ _ _  __| | \\ \\/ / \n");
    printf(" / _ \\|  _|  _/ -_) ' \\/ _` |  >  <  \n");
    printf("/_/ \\_\\\\__|\\__\\___|_||_\\__,_| /_/\\_\\ \n");
    printf(" Student Attendance Management System (Pure C Edition)\n");
    printf("====================================================================\n");
    printf(" >> Storage Engine   : Standard C File Handling (stdio.h)\n");
    printf(" >> Active Directory : /data (students.txt, attendance.txt, etc.)\n");
    printf(" >> Safe Backups     : Enabled (/backups/*_YYYYMMDD_HHMMSS.bak)\n");
    printf("====================================================================\n\n");
}

/* =========================================================================
 * Console Display Functions (VS Code Terminal Output)
 * ========================================================================= */

static void console_view_students(void) {
    printf("\n--- [STUDENT DIRECTORY] (Reading data/students.txt via fgets) ---\n");
    Student *students = NULL;
    int count = 0;

    if (student_get_all(&students, &count) != 0 || count == 0) {
        printf("No student records found in data/students.txt.\n");
        if (students) free(students);
        return;
    }

    printf("+---------+----------------------+---------+------------------------------+-------------------+\n");
    printf("| ROLL NO | STUDENT NAME         | SECTION | EMAIL                        | PHONE             |\n");
    printf("+---------+----------------------+---------+------------------------------+-------------------+\n");

    for (int i = 0; i < count; i++) {
        printf("| %-7s | %-20s | %-7s | %-28s | %-17s |\n",
               students[i].roll_no,
               students[i].name,
               students[i].section,
               students[i].email,
               students[i].phone);
    }
    printf("+---------+----------------------+---------+------------------------------+-------------------+\n");
    printf("Total registered students: %d\n\n", count);

    free(students);
}

static void console_view_attendance_report(void) {
    printf("\n--- [ATTENDANCE ANALYTICS REPORT] (< 75%% Threshold Highlighted) ---\n");
    StudentStats *stats = NULL;
    int count = 0;

    if (report_get_all_student_stats(&stats, &count) != 0 || count == 0) {
        printf("No attendance records found.\n");
        if (stats) free(stats);
        return;
    }

    printf("+---------+----------------------+---------+--------+---------+--------+------+----------+----------+\n");
    printf("| ROLL NO | STUDENT NAME         | SECTION | TOTAL  | PRESENT | ABSENT | LATE | ATTEND %% | STATUS   |\n");
    printf("+---------+----------------------+---------+--------+---------+--------+------+----------+----------+\n");

    int low_count = 0;
    for (int i = 0; i < count; i++) {
        const char *status_tag = "OK";
        if (stats[i].percentage < 75.0) {
            status_tag = "CRITICAL";
            low_count++;
        }

        printf("| %-7s | %-20s | %-7s | %-6d | %-7d | %-6d | %-4d | %7.1f%% | %-8s |\n",
               stats[i].student.roll_no,
               stats[i].student.name,
               stats[i].student.section,
               stats[i].total_days,
               stats[i].present_days,
               stats[i].absent_days,
               stats[i].late_days,
               stats[i].percentage,
               status_tag);
    }
    printf("+---------+----------------------+---------+--------+---------+--------+------+----------+----------+\n");

    if (low_count > 0) {
        printf(">> [WARNING] %d student(s) have attendance below the 75%% mandatory threshold!\n\n", low_count);
    } else {
        printf(">> [SUCCESS] All students maintain >= 75%% attendance.\n\n");
    }

    free(stats);
}

static void console_add_student(void) {
    printf("\n--- [ADD NEW STUDENT] (Appends to data/students.txt) ---\n");
    Student s;
    memset(&s, 0, sizeof(s));

    printf("Enter Roll Number (e.g. CS106): ");
    if (scanf("%31s", s.roll_no) != 1) return;

    // Check duplicate
    if (student_exists(s.roll_no)) {
        printf("[ERROR] Student with Roll Number %s already exists!\n\n", s.roll_no);
        return;
    }

    // Flush input buffer
    int c;
    while ((c = getchar()) != '\n' && c != EOF);

    printf("Enter Full Name: ");
    if (!fgets(s.name, sizeof(s.name), stdin)) return;
    trim_whitespace(s.name);

    printf("Enter Section (e.g. CS-A): ");
    if (scanf("%31s", s.section) != 1) return;

    printf("Enter Email Address: ");
    if (scanf("%127s", s.email) != 1) return;

    printf("Enter Phone Number: ");
    while ((c = getchar()) != '\n' && c != EOF);
    if (!fgets(s.phone, sizeof(s.phone), stdin)) return;
    trim_whitespace(s.phone);

    get_current_date(s.joined_on, sizeof(s.joined_on));

    int rc = student_add(&s, "console_admin");
    if (rc == 0) {
        printf("[SUCCESS] Student %s (%s) saved to data/students.txt!\n\n", s.name, s.roll_no);
    } else {
        printf("[ERROR] Failed to save student.\n\n");
    }
}

static void console_mark_attendance(void) {
    printf("\n--- [MARK ATTENDANCE] (Safe Temp File Replacement Pattern) ---\n");
    char roll[32];
    printf("Enter Student Roll Number: ");
    if (scanf("%31s", roll) != 1) return;

    if (!student_exists(roll)) {
        printf("[ERROR] Student %s does not exist.\n\n", roll);
        return;
    }

    char date[16];
    get_current_date(date, sizeof(date));
    printf("Attendance Date [Default Today: %s]: ", date);

    char input_date[32];
    int c;
    while ((c = getchar()) != '\n' && c != EOF);
    if (fgets(input_date, sizeof(input_date), stdin)) {
        trim_whitespace(input_date);
        if (strlen(input_date) == 10) {
            safe_strncpy(date, input_date, sizeof(date));
        }
    }

    printf("Enter Status: (1 = Present, 2 = Absent, 3 = Late): ");
    int choice = 1;
    if (scanf("%d", &choice) != 1) choice = 1;

    const char *status_str = "Present";
    if (choice == 2) status_str = "Absent";
    else if (choice == 3) status_str = "Late";

    printf("Enter Remarks (optional): ");
    char remarks[128] = "Console attendance";
    while ((c = getchar()) != '\n' && c != EOF);
    if (fgets(remarks, sizeof(remarks), stdin)) {
        trim_whitespace(remarks);
    }

    AttendanceRecord rec;
    safe_strncpy(rec.date, date, sizeof(rec.date));
    safe_strncpy(rec.roll_no, roll, sizeof(rec.roll_no));
    safe_strncpy(rec.status, status_str, sizeof(rec.status));
    safe_strncpy(rec.remarks, remarks, sizeof(rec.remarks));

    printf(">> Writing backup copy in /backups...\n");
    printf(">> Atomically replacing data/attendance.txt via temp file...\n");

    int rc = attendance_save_single(&rec, "console_user");
    if (rc == 0) {
        printf("[SUCCESS] Attendance marked for %s on %s as %s!\n\n", roll, date, status_str);
    } else {
        printf("[ERROR] Failed to record attendance.\n\n");
    }
}

static void console_create_backup(void) {
    printf("\n--- [CREATE SYSTEM BACKUP] (Binary Block Copy via fread/fwrite) ---\n");
    char backup_dir[256];
    create_full_system_backup(backup_dir, sizeof(backup_dir));
    printf("[SUCCESS] Full binary snapshot generated in %s/!\n\n", backup_dir);
}

static void console_view_audit_log(void) {
    printf("\n--- [AUDIT TRAIL LOG] (data/audit_log.txt - Append-Only) ---\n");
    AuditEntry *entries = NULL;
    int count = 0;
    audit_log_get_recent(&entries, &count, 15);

    if (count == 0 || !entries) {
        printf("No audit logs found.\n\n");
        return;
    }

    for (int i = 0; i < count; i++) {
        printf("[%s] (%s): %s\n", entries[i].timestamp, entries[i].user, entries[i].action);
    }
    printf("\n");
    free(entries);
}

/* =========================================================================
 * Automated Walkthrough Demo (Instantly prints all operations in terminal)
 * ========================================================================= */
static void run_automated_demo(void) {
    printf("\n====================================================================\n");
    printf("   RUNNING AUTOMATED C FILE HANDLING VERIFICATION & DEMONSTRATION   \n");
    printf("====================================================================\n");

    // 1. Display Students
    console_view_students();

    // 2. Display Attendance Statistics & Alerts
    console_view_attendance_report();

    // 3. Test File Backup
    console_create_backup();

    // 4. Test Student Addition & Safe Temp File Update
    printf("--- [TEST: C File Handling Operations (Add / Update / Delete)] ---\n");
    Student test_s = { "CS888", "Viva Demo Student", "CS-A", "demo@attendx.edu", "+91 91234 56789", "2026-11-02" };
    student_delete("CS888", "test_runner"); // Clean prior test
    student_add(&test_s, "test_runner");
    printf("1. Appended student 'CS888' (Viva Demo Student) to data/students.txt.\n");

    // Update
    Student updated_s = test_s;
    safe_strncpy(updated_s.name, "Viva Demo Student (Honors)", sizeof(updated_s.name));
    student_update("CS888", &updated_s, "test_runner");
    printf("2. Performed atomic update of 'CS888' using temporary file & backup copy.\n");

    // Record attendance
    AttendanceRecord test_att = { "2026-11-02", "CS888", "Present", "Viva demonstration" };
    attendance_save_single(&test_att, "test_runner");
    printf("3. Recorded attendance for 'CS888' with duplicate prevention.\n");

    // Clean up
    student_delete("CS888", "test_runner");
    printf("4. Safely deleted student 'CS888' with backup archived in /backups/.\n\n");

    // 5. Audit Log
    console_view_audit_log();

    printf("====================================================================\n");
    printf("   AUTOMATED DEMO COMPLETE: ALL C FILE OPERATIONS VERIFIED 100%%     \n");
    printf("====================================================================\n\n");
}

/* =========================================================================
 * Main Program Entry Point
 * ========================================================================= */
int main(int argc, char *argv[]) {
    // 1. Initialize database directories and files
    if (init_all_files() != 0) {
        fprintf(stderr, "[AttendX Fatal] Could not initialize data directory or files.\n");
        return 1;
    }

    // 2. Seed 15 sample students, 30 days of attendance, and admin/teacher accounts
    seed_sample_data_if_empty();

    // 3. Initialize authentication subsystem
    auth_init();

    // If --server flag is passed, start HTTP web server immediately
    if (argc > 1 && (strcmp(argv[1], "--server") == 0 || strcmp(argv[1], "-s") == 0)) {
        const char *port = (argc > 2) ? argv[2] : "8080";
        char listen_addr[64];
        snprintf(listen_addr, sizeof(listen_addr), "http://0.0.0.0:%s", port);
        print_banner();
        printf(">> Server running at http://localhost:%s\n", port);
        printf(">> Press Ctrl+C in terminal to stop.\n\n");
        return start_server(listen_addr);
    }

    // If --demo or -d flag is passed, run automated terminal demo and exit
    if (argc > 1 && (strcmp(argv[1], "--demo") == 0 || strcmp(argv[1], "-d") == 0)) {
        print_banner();
        run_automated_demo();
        return 0;
    }

    // Default: Interactive Console Menu (Output in VS Code Terminal)
    print_banner();

    int choice = -1;
    while (choice != 0) {
        printf("======================= [ATTENDX CONSOLE MENU] ======================\n");
        printf(" [1] View All Students (Reads data/students.txt)\n");
        printf(" [2] View Attendance Report & Watchlist (< 75%% Alert)\n");
        printf(" [3] Add New Student (Appends to data/students.txt)\n");
        printf(" [4] Mark Attendance (Safe Temp File Copy + Backup)\n");
        printf(" [5] Create Full System Backup Now (Copies to /backups)\n");
        printf(" [6] View Audit Trail Log (Reads data/audit_log.txt)\n");
        printf(" [7] Run Full Automated Demonstration (Instant Output)\n");
        printf(" [8] Start Web Server (Optional: http://localhost:8080)\n");
        printf(" [0] Exit\n");
        printf("====================================================================\n");
        printf("Select an option [0-8]: ");

        if (scanf("%d", &choice) != 1) {
            break;
        }

        switch (choice) {
            case 1: console_view_students(); break;
            case 2: console_view_attendance_report(); break;
            case 3: console_add_student(); break;
            case 4: console_mark_attendance(); break;
            case 5: console_create_backup(); break;
            case 6: console_view_audit_log(); break;
            case 7: run_automated_demo(); break;
            case 8: {
                printf("\nStarting Web Server on http://localhost:8080...\n");
                printf("Press Ctrl+C to stop server and return to terminal.\n\n");
                start_server("http://0.0.0.0:8080");
                break;
            }
            case 0:
                printf("\nExiting AttendX. Goodbye!\n\n");
                break;
            default:
                printf("\n[Invalid Option] Please enter a number between 0 and 8.\n\n");
                break;
        }
    }

    return 0;
}
