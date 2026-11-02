#include "api_handlers.h"
#include "file_handler.h"
#include "auth.h"
#include "utils.h"
#include "../lib/cJSON.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

#define JSON_HEADERS "Content-Type: application/json\r\n" \
                     "Access-Control-Allow-Origin: *\r\n" \
                     "Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\n" \
                     "Access-Control-Allow-Headers: Content-Type, Authorization\r\n"

#define CSV_HEADERS "Content-Type: text/csv\r\n" \
                    "Content-Disposition: attachment; filename=\"attendx_export.csv\"\r\n" \
                    "Access-Control-Allow-Origin: *\r\n"

/* =========================================================================
 * Portable String Helpers for standard C
 * ========================================================================= */

static char *portable_strcasestr(const char *haystack, const char *needle) {
    if (!haystack || !needle) return NULL;
    size_t needle_len = strlen(needle);
    if (needle_len == 0) return (char *)haystack;

    for (; *haystack; haystack++) {
        if (tolower((unsigned char)*haystack) == tolower((unsigned char)*needle)) {
            size_t i;
            for (i = 1; i < needle_len; i++) {
                if (!haystack[i] || tolower((unsigned char)haystack[i]) != tolower((unsigned char)needle[i])) {
                    break;
                }
            }
            if (i == needle_len) {
                return (char *)haystack;
            }
        }
    }
    return NULL;
}

static char *portable_strsep(char **stringp, const char *delim) {
    if (!stringp || !*stringp) return NULL;
    char *start = *stringp;
    char *p = start;

    while (*p) {
        if (strchr(delim, *p)) {
            *p = '\0';
            *stringp = p + 1;
            return start;
        }
        p++;
    }
    *stringp = NULL;
    return start;
}

/* =========================================================================
 * Response Helpers
 * ========================================================================= */

static void send_json_response(struct mg_connection *c, int status, cJSON *json_obj) {
    char *json_str = cJSON_PrintUnformatted(json_obj);
    if (!json_str) {
        mg_http_reply(c, 500, JSON_HEADERS, "{\"success\":false,\"error\":\"JSON generation error\"}");
        return;
    }
    mg_http_reply(c, status, JSON_HEADERS, "%s", json_str);
    free(json_str);
}

static void send_error_response(struct mg_connection *c, int status, const char *message) {
    cJSON *res = cJSON_CreateObject();
    cJSON_AddBoolToObject(res, "success", false);
    cJSON_AddStringToObject(res, "error", message ? message : "Unknown error");
    send_json_response(c, status, res);
    cJSON_Delete(res);
}

static void send_success_response(struct mg_connection *c, int status, const char *message, cJSON *data) {
    cJSON *res = cJSON_CreateObject();
    cJSON_AddBoolToObject(res, "success", true);
    if (message) {
        cJSON_AddStringToObject(res, "message", message);
    }
    if (data) {
        cJSON_AddItemToObject(res, "data", data);
    }
    send_json_response(c, status, res);
    cJSON_Delete(res);
}

static bool get_authenticated_user(struct mg_http_message *hm, User *user_out) {
    struct mg_str *hdr = mg_http_get_header(hm, "Authorization");
    if (!hdr || hdr->len == 0) {
        // Fallback: check query parameter ?token=...
        char token_buf[128] = {0};
        if (mg_http_get_var(&hm->query, "token", token_buf, sizeof(token_buf)) > 0) {
            return auth_validate_token(token_buf, user_out);
        }
        return false;
    }

    char hdr_str[256];
    size_t copy_len = hdr->len < sizeof(hdr_str) - 1 ? hdr->len : sizeof(hdr_str) - 1;
    memcpy(hdr_str, hdr->buf, copy_len);
    hdr_str[copy_len] = '\0';

    char token[128];
    if (!auth_extract_token_from_header(hdr_str, token, sizeof(token))) {
        return false;
    }

    return auth_validate_token(token, user_out);
}

static char *extract_path_param(const struct mg_str *uri, const char *prefix) {
    size_t prefix_len = strlen(prefix);
    if (uri->len <= prefix_len) return NULL;
    if (strncmp(uri->buf, prefix, prefix_len) != 0) return NULL;

    const char *start = uri->buf + prefix_len;
    size_t len = uri->len - prefix_len;

    // Find end before '/' or '?'
    size_t actual_len = 0;
    while (actual_len < len && start[actual_len] != '/' && start[actual_len] != '?') {
        actual_len++;
    }

    if (actual_len == 0) return NULL;

    char *param = malloc(actual_len + 1);
    if (!param) return NULL;
    memcpy(param, start, actual_len);
    param[actual_len] = '\0';
    return param;
}

/* =========================================================================
 * Endpoint Handlers
 * ========================================================================= */

// POST /api/login
static void handle_login(struct mg_connection *c, struct mg_http_message *hm) {
    char body[1024];
    size_t len = hm->body.len < sizeof(body) - 1 ? hm->body.len : sizeof(body) - 1;
    memcpy(body, hm->body.buf, len);
    body[len] = '\0';

    cJSON *json = cJSON_Parse(body);
    if (!json) {
        send_error_response(c, 400, "Invalid JSON payload in login request");
        return;
    }

    cJSON *username_item = cJSON_GetObjectItem(json, "username");
    cJSON *password_item = cJSON_GetObjectItem(json, "password");

    if (!cJSON_IsString(username_item) || !cJSON_IsString(password_item)) {
        cJSON_Delete(json);
        send_error_response(c, 400, "Username and password strings are required");
        return;
    }

    char token[64];
    User u;
    int rc = auth_login(username_item->valuestring, password_item->valuestring, token, &u);
    cJSON_Delete(json);

    if (rc != 0) {
        send_error_response(c, 401, "Invalid username or password");
        return;
    }

    cJSON *data = cJSON_CreateObject();
    cJSON_AddStringToObject(data, "token", token);

    cJSON *user_obj = cJSON_CreateObject();
    cJSON_AddStringToObject(user_obj, "username", u.username);
    cJSON_AddStringToObject(user_obj, "role", u.role);
    cJSON_AddItemToObject(data, "user", user_obj);

    send_success_response(c, 200, "Login successful", data);
}

// POST /api/logout
static void handle_logout(struct mg_connection *c, struct mg_http_message *hm) {
    struct mg_str *hdr = mg_http_get_header(hm, "Authorization");
    if (hdr && hdr->len > 0) {
        char hdr_str[256];
        size_t copy_len = hdr->len < sizeof(hdr_str) - 1 ? hdr->len : sizeof(hdr_str) - 1;
        memcpy(hdr_str, hdr->buf, copy_len);
        hdr_str[copy_len] = '\0';

        char token[128];
        if (auth_extract_token_from_header(hdr_str, token, sizeof(token))) {
            auth_logout(token);
        }
    }
    send_success_response(c, 200, "Logged out successfully", NULL);
}

// GET /api/me
static void handle_me(struct mg_connection *c, struct mg_http_message *hm) {
    User u;
    if (!get_authenticated_user(hm, &u)) {
        send_error_response(c, 401, "Unauthorized");
        return;
    }
    cJSON *user_obj = cJSON_CreateObject();
    cJSON_AddStringToObject(user_obj, "username", u.username);
    cJSON_AddStringToObject(user_obj, "role", u.role);
    send_success_response(c, 200, "Profile retrieved", user_obj);
}

// GET & POST /api/students
static void handle_students_list(struct mg_connection *c, struct mg_http_message *hm) {
    User u;
    if (!get_authenticated_user(hm, &u)) {
        send_error_response(c, 401, "Unauthorized - Please login first");
        return;
    }

    // GET /api/students
    if (mg_strcmp(hm->method, mg_str("GET")) == 0) {
        char query_section[MAX_SECTION_LEN] = {0};
        char query_search[MAX_NAME_LEN] = {0};
        mg_http_get_var(&hm->query, "section", query_section, sizeof(query_section));
        mg_http_get_var(&hm->query, "search", query_search, sizeof(query_search));

        Student *students = NULL;
        int count = 0;
        if (student_get_all(&students, &count) != 0) {
            send_error_response(c, 500, "Failed to read students data file");
            return;
        }

        cJSON *arr = cJSON_CreateArray();
        for (int i = 0; i < count; i++) {
            // Filter by section if requested
            if (strlen(query_section) > 0 && strcmp(query_section, "all") != 0) {
                if (mg_casecmp(students[i].section, query_section) != 0) {
                    continue;
                }
            }

            // Filter by search query (roll or name)
            if (strlen(query_search) > 0) {
                if (!portable_strcasestr(students[i].roll_no, query_search) &&
                    !portable_strcasestr(students[i].name, query_search)) {
                    continue;
                }
            }

            cJSON *item = cJSON_CreateObject();
            cJSON_AddStringToObject(item, "roll_no", students[i].roll_no);
            cJSON_AddStringToObject(item, "name", students[i].name);
            cJSON_AddStringToObject(item, "section", students[i].section);
            cJSON_AddStringToObject(item, "email", students[i].email);
            cJSON_AddStringToObject(item, "phone", students[i].phone);
            cJSON_AddStringToObject(item, "joined_on", students[i].joined_on);
            cJSON_AddItemToArray(arr, item);
        }

        if (students) free(students);
        send_success_response(c, 200, "Students retrieved successfully", arr);
        return;
    }

    // POST /api/students (Add student)
    if (mg_strcmp(hm->method, mg_str("POST")) == 0) {
        char body[1024];
        size_t len = hm->body.len < sizeof(body) - 1 ? hm->body.len : sizeof(body) - 1;
        memcpy(body, hm->body.buf, len);
        body[len] = '\0';

        cJSON *json = cJSON_Parse(body);
        if (!json) {
            send_error_response(c, 400, "Invalid JSON payload");
            return;
        }

        Student s;
        memset(&s, 0, sizeof(s));

        cJSON *roll = cJSON_GetObjectItem(json, "roll_no");
        cJSON *name = cJSON_GetObjectItem(json, "name");
        cJSON *sec  = cJSON_GetObjectItem(json, "section");
        cJSON *em   = cJSON_GetObjectItem(json, "email");
        cJSON *ph   = cJSON_GetObjectItem(json, "phone");
        cJSON *jn   = cJSON_GetObjectItem(json, "joined_on");

        if (!cJSON_IsString(roll) || !cJSON_IsString(name)) {
            cJSON_Delete(json);
            send_error_response(c, 400, "Roll number and student name are required");
            return;
        }

        safe_strncpy(s.roll_no, roll->valuestring, sizeof(s.roll_no));
        safe_strncpy(s.name, name->valuestring, sizeof(s.name));
        safe_strncpy(s.section, cJSON_IsString(sec) ? sec->valuestring : "General", sizeof(s.section));
        safe_strncpy(s.email, cJSON_IsString(em) ? em->valuestring : "", sizeof(s.email));
        safe_strncpy(s.phone, cJSON_IsString(ph) ? ph->valuestring : "", sizeof(s.phone));
        safe_strncpy(s.joined_on, cJSON_IsString(jn) ? jn->valuestring : "", sizeof(s.joined_on));

        cJSON_Delete(json);

        int rc = student_add(&s, u.username);
        if (rc == -2) {
            send_error_response(c, 409, "A student with this Roll Number already exists");
            return;
        } else if (rc != 0) {
            send_error_response(c, 500, "Failed to save student record");
            return;
        }

        cJSON *created = cJSON_CreateObject();
        cJSON_AddStringToObject(created, "roll_no", s.roll_no);
        cJSON_AddStringToObject(created, "name", s.name);
        send_success_response(c, 201, "Student added successfully", created);
        return;
    }

    send_error_response(c, 405, "Method not allowed");
}

// GET, PUT, DELETE /api/students/:roll
static void handle_student_detail(struct mg_connection *c, struct mg_http_message *hm, const char *roll) {
    User u;
    if (!get_authenticated_user(hm, &u)) {
        send_error_response(c, 401, "Unauthorized");
        return;
    }

    // GET /api/students/:roll
    if (mg_strcmp(hm->method, mg_str("GET")) == 0) {
        Student s;
        if (student_find_by_roll(roll, &s) != 0) {
            send_error_response(c, 404, "Student not found");
            return;
        }

        cJSON *obj = cJSON_CreateObject();
        cJSON_AddStringToObject(obj, "roll_no", s.roll_no);
        cJSON_AddStringToObject(obj, "name", s.name);
        cJSON_AddStringToObject(obj, "section", s.section);
        cJSON_AddStringToObject(obj, "email", s.email);
        cJSON_AddStringToObject(obj, "phone", s.phone);
        cJSON_AddStringToObject(obj, "joined_on", s.joined_on);
        send_success_response(c, 200, "Student details retrieved", obj);
        return;
    }

    // PUT /api/students/:roll (Update student)
    if (mg_strcmp(hm->method, mg_str("PUT")) == 0) {
        char body[1024];
        size_t len = hm->body.len < sizeof(body) - 1 ? hm->body.len : sizeof(body) - 1;
        memcpy(body, hm->body.buf, len);
        body[len] = '\0';

        cJSON *json = cJSON_Parse(body);
        if (!json) {
            send_error_response(c, 400, "Invalid JSON payload");
            return;
        }

        Student s;
        memset(&s, 0, sizeof(s));
        safe_strncpy(s.roll_no, roll, sizeof(s.roll_no));

        cJSON *name = cJSON_GetObjectItem(json, "name");
        cJSON *sec  = cJSON_GetObjectItem(json, "section");
        cJSON *em   = cJSON_GetObjectItem(json, "email");
        cJSON *ph   = cJSON_GetObjectItem(json, "phone");
        cJSON *jn   = cJSON_GetObjectItem(json, "joined_on");

        if (cJSON_IsString(name)) safe_strncpy(s.name, name->valuestring, sizeof(s.name));
        if (cJSON_IsString(sec))  safe_strncpy(s.section, sec->valuestring, sizeof(s.section));
        if (cJSON_IsString(em))   safe_strncpy(s.email, em->valuestring, sizeof(s.email));
        if (cJSON_IsString(ph))   safe_strncpy(s.phone, ph->valuestring, sizeof(s.phone));
        if (cJSON_IsString(jn))   safe_strncpy(s.joined_on, jn->valuestring, sizeof(s.joined_on));

        cJSON_Delete(json);

        int rc = student_update(roll, &s, u.username);
        if (rc == -2) {
            send_error_response(c, 404, "Student not found for update");
            return;
        } else if (rc != 0) {
            send_error_response(c, 500, "Failed to update student");
            return;
        }

        send_success_response(c, 200, "Student updated successfully", NULL);
        return;
    }

    // DELETE /api/students/:roll
    if (mg_strcmp(hm->method, mg_str("DELETE")) == 0) {
        // Only admin can delete students
        if (strcmp(u.role, "admin") != 0) {
            send_error_response(c, 403, "Forbidden - Only administrators can delete student records");
            return;
        }

        int rc = student_delete(roll, u.username);
        if (rc == -2) {
            send_error_response(c, 404, "Student not found");
            return;
        } else if (rc != 0) {
            send_error_response(c, 500, "Failed to delete student");
            return;
        }

        send_success_response(c, 200, "Student deleted successfully", NULL);
        return;
    }

    send_error_response(c, 405, "Method not allowed");
}

// GET & POST /api/attendance
static void handle_attendance(struct mg_connection *c, struct mg_http_message *hm) {
    User u;
    if (!get_authenticated_user(hm, &u)) {
        send_error_response(c, 401, "Unauthorized");
        return;
    }

    // GET /api/attendance?date=YYYY-MM-DD&section=...
    if (mg_strcmp(hm->method, mg_str("GET")) == 0) {
        char date_param[16] = {0};
        char section_param[MAX_SECTION_LEN] = {0};
        mg_http_get_var(&hm->query, "date", date_param, sizeof(date_param));
        mg_http_get_var(&hm->query, "section", section_param, sizeof(section_param));

        if (strlen(date_param) == 0) {
            get_current_date(date_param, sizeof(date_param));
        }

        // Fetch students to join with attendance
        Student *students = NULL;
        int s_count = 0;
        student_get_all(&students, &s_count);

        // Fetch attendance for this date
        AttendanceRecord *records = NULL;
        int a_count = 0;
        attendance_get_by_date(date_param, &records, &a_count);

        cJSON *res_data = cJSON_CreateObject();
        cJSON_AddStringToObject(res_data, "date", date_param);
        cJSON_AddBoolToObject(res_data, "is_recorded", a_count > 0);

        int present_count = 0, absent_count = 0, late_count = 0;
        cJSON *list_arr = cJSON_CreateArray();

        for (int i = 0; i < s_count; i++) {
            if (strlen(section_param) > 0 && strcmp(section_param, "all") != 0) {
                if (mg_casecmp(students[i].section, section_param) != 0) {
                    continue;
                }
            }

            // Find matching record
            const char *status = "Unmarked";
            const char *remarks = "";
            for (int j = 0; j < a_count; j++) {
                if (strcmp(records[j].roll_no, students[i].roll_no) == 0) {
                    status = records[j].status;
                    remarks = records[j].remarks;
                    break;
                }
            }

            if (strcmp(status, "Present") == 0) present_count++;
            else if (strcmp(status, "Absent") == 0) absent_count++;
            else if (strcmp(status, "Late") == 0) late_count++;

            cJSON *item = cJSON_CreateObject();
            cJSON_AddStringToObject(item, "roll_no", students[i].roll_no);
            cJSON_AddStringToObject(item, "name", students[i].name);
            cJSON_AddStringToObject(item, "section", students[i].section);
            cJSON_AddStringToObject(item, "status", status);
            cJSON_AddStringToObject(item, "remarks", remarks);
            cJSON_AddItemToArray(list_arr, item);
        }

        cJSON_AddNumberToObject(res_data, "total_students", cJSON_GetArraySize(list_arr));
        cJSON_AddNumberToObject(res_data, "present_count", present_count);
        cJSON_AddNumberToObject(res_data, "absent_count", absent_count);
        cJSON_AddNumberToObject(res_data, "late_count", late_count);
        cJSON_AddItemToObject(res_data, "records", list_arr);

        if (students) free(students);
        if (records) free(records);

        send_success_response(c, 200, "Attendance data retrieved", res_data);
        return;
    }

    // POST /api/attendance (Save full day's attendance)
    if (mg_strcmp(hm->method, mg_str("POST")) == 0) {
        char *body = malloc(hm->body.len + 1);
        if (!body) {
            send_error_response(c, 500, "Memory allocation error");
            return;
        }
        memcpy(body, hm->body.buf, hm->body.len);
        body[hm->body.len] = '\0';

        cJSON *json = cJSON_Parse(body);
        free(body);

        if (!json) {
            send_error_response(c, 400, "Invalid JSON payload");
            return;
        }

        cJSON *date_item = cJSON_GetObjectItem(json, "date");
        cJSON *records_arr = cJSON_GetObjectItem(json, "records");

        if (!cJSON_IsString(date_item) || !cJSON_IsArray(records_arr)) {
            cJSON_Delete(json);
            send_error_response(c, 400, "Date and records array are required");
            return;
        }

        const char *date = date_item->valuestring;
        if (!is_valid_date_format(date)) {
            cJSON_Delete(json);
            send_error_response(c, 400, "Invalid date format. Expected YYYY-MM-DD");
            return;
        }

        // Block future dates
        char today[16];
        get_current_date(today, sizeof(today));
        if (days_between_dates(today, date) > 0) {
            cJSON_Delete(json);
            send_error_response(c, 400, "Future dates cannot be recorded");
            return;
        }

        int count = cJSON_GetArraySize(records_arr);
        if (count == 0) {
            cJSON_Delete(json);
            send_error_response(c, 400, "Records array cannot be empty");
            return;
        }

        AttendanceRecord *batch = malloc(count * sizeof(AttendanceRecord));
        if (!batch) {
            cJSON_Delete(json);
            send_error_response(c, 500, "Memory allocation error");
            return;
        }

        for (int i = 0; i < count; i++) {
            cJSON *item = cJSON_GetArrayItem(records_arr, i);
            cJSON *r   = cJSON_GetObjectItem(item, "roll_no");
            cJSON *st  = cJSON_GetObjectItem(item, "status");
            cJSON *rem = cJSON_GetObjectItem(item, "remarks");

            safe_strncpy(batch[i].date, date, sizeof(batch[i].date));
            safe_strncpy(batch[i].roll_no, cJSON_IsString(r) ? r->valuestring : "", sizeof(batch[i].roll_no));
            safe_strncpy(batch[i].status, cJSON_IsString(st) ? st->valuestring : "Present", sizeof(batch[i].status));
            safe_strncpy(batch[i].remarks, cJSON_IsString(rem) ? rem->valuestring : "", sizeof(batch[i].remarks));
        }

        cJSON_Delete(json);

        int rc = attendance_save_batch(batch, count, date, u.username);
        free(batch);

        if (rc != 0) {
            send_error_response(c, 500, "Failed to save attendance records");
            return;
        }

        send_success_response(c, 200, "Attendance saved successfully", NULL);
        return;
    }

    send_error_response(c, 405, "Method not allowed");
}

// GET /api/reports/student/:roll
static void handle_reports_student(struct mg_connection *c, struct mg_http_message *hm, const char *roll) {
    (void)hm;
    StudentStats stats;
    if (report_get_student_stats(roll, &stats) != 0) {
        send_error_response(c, 404, "Student not found");
        return;
    }

    AttendanceRecord *records = NULL;
    int count = 0;
    attendance_get_by_student(roll, &records, &count);

    cJSON *data = cJSON_CreateObject();
    cJSON *s_obj = cJSON_CreateObject();
    cJSON_AddStringToObject(s_obj, "roll_no", stats.student.roll_no);
    cJSON_AddStringToObject(s_obj, "name", stats.student.name);
    cJSON_AddStringToObject(s_obj, "section", stats.student.section);
    cJSON_AddStringToObject(s_obj, "email", stats.student.email);
    cJSON_AddStringToObject(s_obj, "phone", stats.student.phone);
    cJSON_AddStringToObject(s_obj, "joined_on", stats.student.joined_on);
    cJSON_AddItemToObject(data, "student", s_obj);

    cJSON_AddNumberToObject(data, "total_days", stats.total_days);
    cJSON_AddNumberToObject(data, "present_days", stats.present_days);
    cJSON_AddNumberToObject(data, "absent_days", stats.absent_days);
    cJSON_AddNumberToObject(data, "late_days", stats.late_days);
    cJSON_AddNumberToObject(data, "percentage", stats.percentage);

    cJSON *rec_arr = cJSON_CreateArray();
    for (int i = 0; i < count; i++) {
        cJSON *rec = cJSON_CreateObject();
        cJSON_AddStringToObject(rec, "date", records[i].date);
        cJSON_AddStringToObject(rec, "status", records[i].status);
        cJSON_AddStringToObject(rec, "remarks", records[i].remarks);
        cJSON_AddItemToArray(rec_arr, rec);
    }
    cJSON_AddItemToObject(data, "history", rec_arr);

    if (records) free(records);

    send_success_response(c, 200, "Student report retrieved", data);
}

// GET /api/reports/summary (Dashboard KPIs & Charts Data)
static void handle_reports_summary(struct mg_connection *c, struct mg_http_message *hm) {
    (void)hm;

    Student *students = NULL;
    int s_count = 0;
    student_get_all(&students, &s_count);

    AttendanceRecord *attendance = NULL;
    int a_count = 0;
    attendance_get_all(&attendance, &a_count);

    char today[16];
    get_current_date(today, sizeof(today));

    // 1. KPI Counts
    int present_today = 0, absent_today = 0, late_today = 0;
    int total_present = 0, total_absent = 0, total_late = 0;

    for (int i = 0; i < a_count; i++) {
        if (strcmp(attendance[i].date, today) == 0) {
            if (strcmp(attendance[i].status, "Present") == 0) present_today++;
            else if (strcmp(attendance[i].status, "Absent") == 0) absent_today++;
            else if (strcmp(attendance[i].status, "Late") == 0) late_today++;
        }
        if (strcmp(attendance[i].status, "Present") == 0) total_present++;
        else if (strcmp(attendance[i].status, "Absent") == 0) total_absent++;
        else if (strcmp(attendance[i].status, "Late") == 0) total_late++;
    }

    double overall_pct = 0.0;
    if (a_count > 0) {
        overall_pct = ((double)(total_present + total_late) / (double)a_count) * 100.0;
    }

    int total_today = present_today + absent_today + late_today;
    double present_today_pct = total_today > 0 ? ((double)present_today / (double)total_today) * 100.0 : 0.0;
    double absent_today_pct = total_today > 0 ? ((double)absent_today / (double)total_today) * 100.0 : 0.0;
    double late_today_pct = total_today > 0 ? ((double)late_today / (double)total_today) * 100.0 : 0.0;

    cJSON *res = cJSON_CreateObject();
    cJSON *kpi = cJSON_CreateObject();
    cJSON_AddNumberToObject(kpi, "total_students", s_count);
    cJSON_AddNumberToObject(kpi, "present_today", present_today);
    cJSON_AddNumberToObject(kpi, "absent_today", absent_today);
    cJSON_AddNumberToObject(kpi, "late_today", late_today);
    cJSON_AddNumberToObject(kpi, "total_today", total_today);
    cJSON_AddNumberToObject(kpi, "present_today_pct", present_today_pct);
    cJSON_AddNumberToObject(kpi, "absent_today_pct", absent_today_pct);
    cJSON_AddNumberToObject(kpi, "late_today_pct", late_today_pct);
    cJSON_AddNumberToObject(kpi, "overall_percentage", overall_pct);
    cJSON_AddItemToObject(res, "kpi", kpi);

    // 2. Section-wise Breakdown
    cJSON *sec_arr = cJSON_CreateArray();
    const char *distinct_sections[16];
    int sec_count = 0;

    for (int i = 0; i < s_count; i++) {
        bool exists = false;
        for (int j = 0; j < sec_count; j++) {
            if (strcmp(distinct_sections[j], students[i].section) == 0) {
                exists = true;
                break;
            }
        }
        if (!exists && sec_count < 16) {
            distinct_sections[sec_count++] = students[i].section;
        }
    }

    for (int j = 0; j < sec_count; j++) {
        const char *sec_name = distinct_sections[j];
        int sec_students = 0;
        int sec_present = 0, sec_absent = 0, sec_late = 0, sec_total_records = 0;

        for (int i = 0; i < s_count; i++) {
            if (strcmp(students[i].section, sec_name) == 0) {
                sec_students++;
            }
        }

        for (int i = 0; i < a_count; i++) {
            for (int k = 0; k < s_count; k++) {
                if (strcmp(attendance[i].roll_no, students[k].roll_no) == 0 &&
                    strcmp(students[k].section, sec_name) == 0) {
                    sec_total_records++;
                    if (strcmp(attendance[i].status, "Present") == 0) {
                        sec_present++;
                    } else if (strcmp(attendance[i].status, "Absent") == 0) {
                        sec_absent++;
                    } else if (strcmp(attendance[i].status, "Late") == 0) {
                        sec_late++;
                    }
                    break;
                }
            }
        }

        double sec_pct = sec_total_records > 0 ? ((double)(sec_present + sec_late) / (double)sec_total_records) * 100.0 : 0.0;
        double sec_present_pct = sec_total_records > 0 ? ((double)sec_present / (double)sec_total_records) * 100.0 : 0.0;
        double sec_absent_pct = sec_total_records > 0 ? ((double)sec_absent / (double)sec_total_records) * 100.0 : 0.0;

        cJSON *sec_item = cJSON_CreateObject();
        cJSON_AddStringToObject(sec_item, "section", sec_name);
        cJSON_AddNumberToObject(sec_item, "total_students", sec_students);
        cJSON_AddNumberToObject(sec_item, "percentage", sec_pct);
        cJSON_AddNumberToObject(sec_item, "present_percentage", sec_present_pct);
        cJSON_AddNumberToObject(sec_item, "absent_percentage", sec_absent_pct);
        cJSON_AddNumberToObject(sec_item, "present_count", sec_present);
        cJSON_AddNumberToObject(sec_item, "absent_count", sec_absent);
        cJSON_AddNumberToObject(sec_item, "late_count", sec_late);
        cJSON_AddItemToArray(sec_arr, sec_item);
    }
    cJSON_AddItemToObject(res, "sections", sec_arr);

    // 3. 7-Day & 30-Day Attendance Trend
    // Extract unique dates from attendance in sorted order
    char unique_dates[64][16];
    int date_count = 0;

    for (int i = 0; i < a_count; i++) {
        bool exists = false;
        for (int j = 0; j < date_count; j++) {
            if (strcmp(unique_dates[j], attendance[i].date) == 0) {
                exists = true;
                break;
            }
        }
        if (!exists && date_count < 64) {
            safe_strncpy(unique_dates[date_count++], attendance[i].date, 16);
        }
    }

    // Simple bubble sort dates chronologically
    for (int i = 0; i < date_count - 1; i++) {
        for (int j = 0; j < date_count - i - 1; j++) {
            if (strcmp(unique_dates[j], unique_dates[j + 1]) > 0) {
                char temp[16];
                safe_strncpy(temp, unique_dates[j], 16);
                safe_strncpy(unique_dates[j], unique_dates[j + 1], 16);
                safe_strncpy(unique_dates[j + 1], temp, 16);
            }
        }
    }

    cJSON *trend_arr = cJSON_CreateArray();
    for (int d = 0; d < date_count; d++) {
        int d_pres = 0, d_abs = 0, d_late = 0;
        for (int i = 0; i < a_count; i++) {
            if (strcmp(attendance[i].date, unique_dates[d]) == 0) {
                if (strcmp(attendance[i].status, "Present") == 0) d_pres++;
                else if (strcmp(attendance[i].status, "Absent") == 0) d_abs++;
                else if (strcmp(attendance[i].status, "Late") == 0) d_late++;
            }
        }
        int total = d_pres + d_abs + d_late;
        double pct = total > 0 ? ((double)(d_pres + d_late) / (double)total) * 100.0 : 0.0;
        double pres_pct = total > 0 ? ((double)d_pres / (double)total) * 100.0 : 0.0;
        double abs_pct = total > 0 ? ((double)d_abs / (double)total) * 100.0 : 0.0;

        cJSON *t_item = cJSON_CreateObject();
        cJSON_AddStringToObject(t_item, "date", unique_dates[d]);
        cJSON_AddNumberToObject(t_item, "present", d_pres);
        cJSON_AddNumberToObject(t_item, "absent", d_abs);
        cJSON_AddNumberToObject(t_item, "late", d_late);
        cJSON_AddNumberToObject(t_item, "percentage", pct);
        cJSON_AddNumberToObject(t_item, "present_percentage", pres_pct);
        cJSON_AddNumberToObject(t_item, "absent_percentage", abs_pct);
        cJSON_AddItemToArray(trend_arr, t_item);
    }
    cJSON_AddItemToObject(res, "trend", trend_arr);

    // 4. Low Attendance Alert List (< 75%)
    cJSON *low_arr = cJSON_CreateArray();
    for (int i = 0; i < s_count; i++) {
        StudentStats stats;
        report_get_student_stats(students[i].roll_no, &stats);
        if (stats.total_days > 0 && stats.percentage < 75.0) {
            cJSON *low_item = cJSON_CreateObject();
            cJSON_AddStringToObject(low_item, "roll_no", stats.student.roll_no);
            cJSON_AddStringToObject(low_item, "name", stats.student.name);
            cJSON_AddStringToObject(low_item, "section", stats.student.section);
            cJSON_AddNumberToObject(low_item, "percentage", stats.percentage);
            cJSON_AddNumberToObject(low_item, "present_days", stats.present_days);
            cJSON_AddNumberToObject(low_item, "total_days", stats.total_days);
            cJSON_AddItemToArray(low_arr, low_item);
        }
    }
    cJSON_AddItemToObject(res, "low_attendance_alerts", low_arr);

    // 5. Recent Activity Feed (Audit log)
    AuditEntry *entries = NULL;
    int entry_count = 0;
    audit_log_get_recent(&entries, &entry_count, 10);

    cJSON *log_arr = cJSON_CreateArray();
    for (int i = 0; i < entry_count; i++) {
        cJSON *l_item = cJSON_CreateObject();
        cJSON_AddStringToObject(l_item, "timestamp", entries[i].timestamp);
        cJSON_AddStringToObject(l_item, "user", entries[i].user);
        cJSON_AddStringToObject(l_item, "action", entries[i].action);
        cJSON_AddItemToArray(log_arr, l_item);
    }
    cJSON_AddItemToObject(res, "activity_feed", log_arr);

    if (entries) free(entries);
    if (students) free(students);
    if (attendance) free(attendance);

    send_success_response(c, 200, "Dashboard summary calculated", res);
}

// GET /api/export/csv
static void handle_export_csv(struct mg_connection *c, struct mg_http_message *hm) {
    char type_param[32] = {0};
    mg_http_get_var(&hm->query, "type", type_param, sizeof(type_param));

    if (strcmp(type_param, "attendance") == 0) {
        AttendanceRecord *records = NULL;
        int count = 0;
        attendance_get_all(&records, &count);

        size_t est_len = (count + 1) * 128 + 1024;
        char *csv = malloc(est_len);
        if (!csv) {
            if (records) free(records);
            send_error_response(c, 500, "Memory allocation failed");
            return;
        }

        size_t pos = snprintf(csv, est_len, "Date,Roll No,Status,Remarks\n");
        for (int i = 0; i < count; i++) {
            pos += snprintf(csv + pos, est_len - pos, "\"%s\",\"%s\",\"%s\",\"%s\"\n",
                            records[i].date, records[i].roll_no, records[i].status, records[i].remarks);
            if (pos >= est_len - 128) break;
        }

        if (records) free(records);
        mg_http_reply(c, 200, CSV_HEADERS, "%s", csv);
        free(csv);
        return;
    } else {
        // Default: export students summary
        StudentStats *stats = NULL;
        int count = 0;
        report_get_all_student_stats(&stats, &count);

        size_t est_len = (count + 1) * 256 + 1024;
        char *csv = malloc(est_len);
        if (!csv) {
            if (stats) free(stats);
            send_error_response(c, 500, "Memory allocation failed");
            return;
        }

        size_t pos = snprintf(csv, est_len, "Roll No,Name,Section,Email,Phone,Total Classes,Present,Absent,Late,Attendance %%\n");
        for (int i = 0; i < count; i++) {
            pos += snprintf(csv + pos, est_len - pos,
                            "\"%s\",\"%s\",\"%s\",\"%s\",\"%s\",%d,%d,%d,%d,%.1f%%\n",
                            stats[i].student.roll_no, stats[i].student.name, stats[i].student.section,
                            stats[i].student.email, stats[i].student.phone, stats[i].total_days,
                            stats[i].present_days, stats[i].absent_days, stats[i].late_days, stats[i].percentage);
            if (pos >= est_len - 256) break;
        }

        if (stats) free(stats);
        mg_http_reply(c, 200, CSV_HEADERS, "%s", csv);
        free(csv);
        return;
    }
}

// POST /api/import/csv
static void handle_import_csv(struct mg_connection *c, struct mg_http_message *hm) {
    User u;
    if (!get_authenticated_user(hm, &u)) {
        send_error_response(c, 401, "Unauthorized");
        return;
    }

    char *body = malloc(hm->body.len + 1);
    if (!body) {
        send_error_response(c, 500, "Memory allocation error");
        return;
    }
    memcpy(body, hm->body.buf, hm->body.len);
    body[hm->body.len] = '\0';

    cJSON *json = cJSON_Parse(body);
    const char *csv_text = NULL;
    if (json) {
        cJSON *csv_item = cJSON_GetObjectItem(json, "csv");
        if (cJSON_IsString(csv_item)) {
            csv_text = csv_item->valuestring;
        }
    } else {
        csv_text = body;
    }

    if (!csv_text || strlen(csv_text) == 0) {
        if (json) cJSON_Delete(json);
        free(body);
        send_error_response(c, 400, "CSV content is empty");
        return;
    }

    int imported = 0, skipped = 0;
    char *copy = strdup(csv_text);
    char *line = strtok(copy, "\r\n");

    // Skip header if it contains "roll" or "name"
    if (line && (portable_strcasestr(line, "roll") || portable_strcasestr(line, "name"))) {
        line = strtok(NULL, "\r\n");
    }

    while (line) {
        trim_whitespace(line);
        if (strlen(line) > 0) {
            Student s;
            memset(&s, 0, sizeof(s));

            // Support either pipe '|' or comma ','
            const char *delim = strchr(line, '|') ? "|" : ",";
            char *p = line;
            char *t;

            // Roll
            t = portable_strsep(&p, delim);
            if (t) {
                while (*t == '\"' || *t == ' ') t++;
                char *end = t + strlen(t) - 1;
                while (end > t && (*end == '\"' || *end == ' ')) *end-- = '\0';
                safe_strncpy(s.roll_no, t, sizeof(s.roll_no));
            }

            // Name
            t = portable_strsep(&p, delim);
            if (t) {
                while (*t == '\"' || *t == ' ') t++;
                char *end = t + strlen(t) - 1;
                while (end > t && (*end == '\"' || *end == ' ')) *end-- = '\0';
                safe_strncpy(s.name, t, sizeof(s.name));
            }

            // Section
            t = portable_strsep(&p, delim);
            if (t) {
                while (*t == '\"' || *t == ' ') t++;
                char *end = t + strlen(t) - 1;
                while (end > t && (*end == '\"' || *end == ' ')) *end-- = '\0';
                safe_strncpy(s.section, t, sizeof(s.section));
            }

            // Email
            t = portable_strsep(&p, delim);
            if (t) {
                while (*t == '\"' || *t == ' ') t++;
                char *end = t + strlen(t) - 1;
                while (end > t && (*end == '\"' || *end == ' ')) *end-- = '\0';
                safe_strncpy(s.email, t, sizeof(s.email));
            }

            // Phone
            t = portable_strsep(&p, delim);
            if (t) {
                while (*t == '\"' || *t == ' ') t++;
                char *end = t + strlen(t) - 1;
                while (end > t && (*end == '\"' || *end == ' ')) *end-- = '\0';
                safe_strncpy(s.phone, t, sizeof(s.phone));
            }

            if (strlen(s.section) == 0) safe_strncpy(s.section, "CS-A", sizeof(s.section));
            get_current_date(s.joined_on, sizeof(s.joined_on));

            if (strlen(s.roll_no) > 0 && strlen(s.name) > 0) {
                int rc = student_add(&s, u.username);
                if (rc == 0) imported++;
                else skipped++;
            }
        }
        line = strtok(NULL, "\r\n");
    }

    free(copy);
    if (json) cJSON_Delete(json);
    free(body);

    cJSON *res_data = cJSON_CreateObject();
    cJSON_AddNumberToObject(res_data, "imported", imported);
    cJSON_AddNumberToObject(res_data, "skipped", skipped);
    send_success_response(c, 200, "CSV import completed", res_data);
}

// GET /api/audit-log
static void handle_audit_log(struct mg_connection *c, struct mg_http_message *hm) {
    (void)hm;
    AuditEntry *entries = NULL;
    int count = 0;
    audit_log_get_recent(&entries, &count, 100);

    cJSON *arr = cJSON_CreateArray();
    for (int i = 0; i < count; i++) {
        cJSON *item = cJSON_CreateObject();
        cJSON_AddStringToObject(item, "timestamp", entries[i].timestamp);
        cJSON_AddStringToObject(item, "user", entries[i].user);
        cJSON_AddStringToObject(item, "action", entries[i].action);
        cJSON_AddItemToArray(arr, item);
    }

    if (entries) free(entries);
    send_success_response(c, 200, "Audit logs retrieved", arr);
}

// POST /api/settings/backup
static void handle_settings_backup(struct mg_connection *c, struct mg_http_message *hm) {
    User u;
    if (!get_authenticated_user(hm, &u)) {
        send_error_response(c, 401, "Unauthorized");
        return;
    }
    if (strcmp(u.role, "admin") != 0) {
        send_error_response(c, 403, "Admin privileges required");
        return;
    }

    char backup_dir[256];
    create_full_system_backup(backup_dir, sizeof(backup_dir));

    cJSON *res = cJSON_CreateObject();
    cJSON_AddStringToObject(res, "backup_location", backup_dir);
    send_success_response(c, 200, "Full backup generated successfully in /backups", res);
}

// POST /api/settings/password
static void handle_settings_password(struct mg_connection *c, struct mg_http_message *hm) {
    User u;
    if (!get_authenticated_user(hm, &u)) {
        send_error_response(c, 401, "Unauthorized");
        return;
    }

    char body[1024];
    size_t len = hm->body.len < sizeof(body) - 1 ? hm->body.len : sizeof(body) - 1;
    memcpy(body, hm->body.buf, len);
    body[len] = '\0';

    cJSON *json = cJSON_Parse(body);
    if (!json) {
        send_error_response(c, 400, "Invalid JSON payload");
        return;
    }

    cJSON *curr = cJSON_GetObjectItem(json, "current_password");
    cJSON *newp = cJSON_GetObjectItem(json, "new_password");

    if (!cJSON_IsString(curr) || !cJSON_IsString(newp)) {
        cJSON_Delete(json);
        send_error_response(c, 400, "Current and new password strings are required");
        return;
    }

    User current_user;
    user_find(u.username, &current_user);

    if (!verify_password(curr->valuestring, current_user.password_hash)) {
        cJSON_Delete(json);
        send_error_response(c, 400, "Current password is incorrect");
        return;
    }

    char new_hash[65];
    hash_password(newp->valuestring, ATTENDX_SALT, new_hash, sizeof(new_hash));
    cJSON_Delete(json);

    user_update_password(u.username, new_hash, u.username);
    send_success_response(c, 200, "Password updated successfully", NULL);
}

// GET, POST, DELETE /api/users
static void handle_users(struct mg_connection *c, struct mg_http_message *hm) {
    User u;
    if (!get_authenticated_user(hm, &u)) {
        send_error_response(c, 401, "Unauthorized");
        return;
    }
    if (strcmp(u.role, "admin") != 0) {
        send_error_response(c, 403, "Admin privileges required to manage accounts");
        return;
    }

    if (mg_strcmp(hm->method, mg_str("GET")) == 0) {
        User *users = NULL;
        int count = 0;
        user_get_all(&users, &count);

        cJSON *arr = cJSON_CreateArray();
        for (int i = 0; i < count; i++) {
            cJSON *item = cJSON_CreateObject();
            cJSON_AddStringToObject(item, "username", users[i].username);
            cJSON_AddStringToObject(item, "role", users[i].role);
            cJSON_AddItemToArray(arr, item);
        }

        if (users) free(users);
        send_success_response(c, 200, "Users retrieved", arr);
        return;
    }

    if (mg_strcmp(hm->method, mg_str("POST")) == 0) {
        char body[1024];
        size_t len = hm->body.len < sizeof(body) - 1 ? hm->body.len : sizeof(body) - 1;
        memcpy(body, hm->body.buf, len);
        body[len] = '\0';

        cJSON *json = cJSON_Parse(body);
        if (!json) {
            send_error_response(c, 400, "Invalid JSON");
            return;
        }

        cJSON *usr  = cJSON_GetObjectItem(json, "username");
        cJSON *pass = cJSON_GetObjectItem(json, "password");
        cJSON *role = cJSON_GetObjectItem(json, "role");

        if (!cJSON_IsString(usr) || !cJSON_IsString(pass)) {
            cJSON_Delete(json);
            send_error_response(c, 400, "Username and password are required");
            return;
        }

        User new_u;
        safe_strncpy(new_u.username, usr->valuestring, sizeof(new_u.username));
        safe_strncpy(new_u.role, cJSON_IsString(role) ? role->valuestring : "teacher", sizeof(new_u.role));
        hash_password(pass->valuestring, ATTENDX_SALT, new_u.password_hash, sizeof(new_u.password_hash));

        cJSON_Delete(json);

        int rc = user_add(&new_u, u.username);
        if (rc == -2) {
            send_error_response(c, 409, "User already exists");
            return;
        } else if (rc != 0) {
            send_error_response(c, 500, "Failed to create user");
            return;
        }

        send_success_response(c, 201, "User created successfully", NULL);
        return;
    }

    send_error_response(c, 405, "Method not allowed");
}

static void handle_user_delete(struct mg_connection *c, struct mg_http_message *hm, const char *username) {
    User u;
    if (!get_authenticated_user(hm, &u)) {
        send_error_response(c, 401, "Unauthorized");
        return;
    }
    if (strcmp(u.role, "admin") != 0) {
        send_error_response(c, 403, "Admin privileges required");
        return;
    }

    if (mg_strcmp(hm->method, mg_str("DELETE")) == 0) {
        int rc = user_delete(username, u.username);
        if (rc == -3) {
            send_error_response(c, 400, "Cannot delete primary admin account");
            return;
        } else if (rc == -2) {
            send_error_response(c, 404, "User not found");
            return;
        } else if (rc != 0) {
            send_error_response(c, 500, "Failed to delete user");
            return;
        }

        send_success_response(c, 200, "User deleted successfully", NULL);
        return;
    }

    send_error_response(c, 405, "Method not allowed");
}

/* =========================================================================
 * Master API Router
 * ========================================================================= */

void handle_api_request(struct mg_connection *c, struct mg_http_message *hm) {
    // Handle CORS pre-flight OPTIONS request
    if (mg_strcmp(hm->method, mg_str("OPTIONS")) == 0) {
        mg_http_reply(c, 204, JSON_HEADERS, "");
        return;
    }

    // Auth endpoints
    if (mg_match(hm->uri, mg_str("/api/login"), NULL)) {
        handle_login(c, hm);
        return;
    }
    if (mg_match(hm->uri, mg_str("/api/logout"), NULL)) {
        handle_logout(c, hm);
        return;
    }
    if (mg_match(hm->uri, mg_str("/api/me"), NULL)) {
        handle_me(c, hm);
        return;
    }

    // Reports summary
    if (mg_match(hm->uri, mg_str("/api/reports/summary"), NULL)) {
        handle_reports_summary(c, hm);
        return;
    }

    // Single student report: /api/reports/student/:roll
    char *report_roll = extract_path_param(&hm->uri, "/api/reports/student/");
    if (report_roll) {
        handle_reports_student(c, hm, report_roll);
        free(report_roll);
        return;
    }

    // Students collection: /api/students
    if (mg_match(hm->uri, mg_str("/api/students"), NULL)) {
        // Check if ?roll= query parameter is used with PUT/DELETE
        char query_roll[MAX_ROLL_LEN] = {0};
        if (mg_http_get_var(&hm->query, "roll", query_roll, sizeof(query_roll)) > 0) {
            handle_student_detail(c, hm, query_roll);
            return;
        }
        handle_students_list(c, hm);
        return;
    }

    // Single student detail: /api/students/:roll
    char *student_roll = extract_path_param(&hm->uri, "/api/students/");
    if (student_roll) {
        handle_student_detail(c, hm, student_roll);
        free(student_roll);
        return;
    }

    // Attendance
    if (mg_match(hm->uri, mg_str("/api/attendance"), NULL)) {
        handle_attendance(c, hm);
        return;
    }

    // Export CSV
    if (mg_match(hm->uri, mg_str("/api/export/csv"), NULL)) {
        handle_export_csv(c, hm);
        return;
    }

    // Import CSV
    if (mg_match(hm->uri, mg_str("/api/import/csv"), NULL)) {
        handle_import_csv(c, hm);
        return;
    }

    // Audit Log
    if (mg_match(hm->uri, mg_str("/api/audit-log"), NULL)) {
        handle_audit_log(c, hm);
        return;
    }

    // Settings
    if (mg_match(hm->uri, mg_str("/api/settings/backup"), NULL)) {
        handle_settings_backup(c, hm);
        return;
    }
    if (mg_match(hm->uri, mg_str("/api/settings/password"), NULL)) {
        handle_settings_password(c, hm);
        return;
    }

    // User management
    if (mg_match(hm->uri, mg_str("/api/users"), NULL)) {
        handle_users(c, hm);
        return;
    }
    char *del_user = extract_path_param(&hm->uri, "/api/users/");
    if (del_user) {
        handle_user_delete(c, hm, del_user);
        free(del_user);
        return;
    }

    // 404 Not Found for any unknown /api route
    send_error_response(c, 404, "API endpoint not found");
}
