#ifndef UTILS_H
#define UTILS_H

#include <stddef.h>
#include <stdbool.h>

#define ATTENDX_SALT "AttendX_SecureSalt_v1"

// Date and time utilities
void get_current_timestamp(char *buf, size_t len);
void get_current_date(char *buf, size_t len);
void get_timestamp_for_filename(char *buf, size_t len);
bool is_valid_date_format(const char *date); // checks YYYY-MM-DD
int days_between_dates(const char *date1, const char *date2);

// String utilities
void trim_whitespace(char *str);
void safe_strncpy(char *dst, const char *src, size_t dst_size);
bool string_starts_with(const char *str, const char *prefix);
void sanitize_pipe_delimiter(char *str);

// Cryptographic hash (SHA-256) utilities
void sha256_hash_string(const char *input, char *hex_output);
void hash_password(const char *password, const char *salt, char *hex_output, size_t hex_max);
bool verify_password(const char *password, const char *stored_hash);

// Token generator for session management
void generate_random_token(char *buf, size_t len);

#endif // UTILS_H
