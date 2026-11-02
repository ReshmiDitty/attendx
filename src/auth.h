#ifndef AUTH_H
#define AUTH_H

#include "file_handler.h"
#include <stdbool.h>

#define MAX_SESSIONS 128
#define SESSION_TTL_SECONDS (24 * 3600) // 24 hours

typedef struct {
    char token[64];
    char username[MAX_USER_LEN];
    char role[MAX_ROLE_LEN];
    time_t expires_at;
    bool active;
} Session;

void auth_init(void);
int auth_login(const char *username, const char *password, char *token_out, User *user_out);
bool auth_validate_token(const char *token, User *user_out);
void auth_logout(const char *token);
bool auth_extract_token_from_header(const char *auth_header, char *token_out, size_t out_len);

#endif // AUTH_H
