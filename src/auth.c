#include "auth.h"
#include "utils.h"
#include <string.h>
#include <time.h>
#include <stdio.h>

static Session sessions[MAX_SESSIONS];

void auth_init(void) {
    memset(sessions, 0, sizeof(sessions));
}

int auth_login(const char *username, const char *password, char *token_out, User *user_out) {
    if (!username || !password || !token_out) return -1;

    User u;
    if (user_find(username, &u) != 0) {
        return -1; // User does not exist
    }

    if (!verify_password(password, u.password_hash)) {
        return -2; // Invalid password
    }

    // Generate a secure session token
    char token[64];
    generate_random_token(token, sizeof(token));

    time_t now = time(NULL);
    time_t expires = now + SESSION_TTL_SECONDS;

    // Find slot (either inactive or oldest expired)
    int slot = -1;
    for (int i = 0; i < MAX_SESSIONS; i++) {
        if (!sessions[i].active || sessions[i].expires_at < now) {
            slot = i;
            break;
        }
    }

    if (slot == -1) {
        slot = 0; // overwrite first if saturated
    }

    safe_strncpy(sessions[slot].token, token, sizeof(sessions[slot].token));
    safe_strncpy(sessions[slot].username, u.username, sizeof(sessions[slot].username));
    safe_strncpy(sessions[slot].role, u.role, sizeof(sessions[slot].role));
    sessions[slot].expires_at = expires;
    sessions[slot].active = true;

    safe_strncpy(token_out, token, 64);
    if (user_out) {
        *user_out = u;
    }

    char act[256];
    snprintf(act, sizeof(act), "User %s logged in successfully (%s)", u.username, u.role);
    audit_log_action(u.username, act);

    return 0;
}

bool auth_validate_token(const char *token, User *user_out) {
    if (!token || strlen(token) == 0) return false;

    time_t now = time(NULL);
    for (int i = 0; i < MAX_SESSIONS; i++) {
        if (sessions[i].active && strcmp(sessions[i].token, token) == 0) {
            if (sessions[i].expires_at >= now) {
                if (user_out) {
                    safe_strncpy(user_out->username, sessions[i].username, sizeof(user_out->username));
                    safe_strncpy(user_out->role, sessions[i].role, sizeof(user_out->role));
                    user_out->password_hash[0] = '\0';
                }
                return true;
            } else {
                sessions[i].active = false; // Expired
                return false;
            }
        }
    }
    return false;
}

void auth_logout(const char *token) {
    if (!token) return;
    for (int i = 0; i < MAX_SESSIONS; i++) {
        if (sessions[i].active && strcmp(sessions[i].token, token) == 0) {
            sessions[i].active = false;
            audit_log_action(sessions[i].username, "User logged out");
            break;
        }
    }
}

bool auth_extract_token_from_header(const char *auth_header, char *token_out, size_t out_len) {
    if (!auth_header || !token_out || out_len == 0) return false;
    token_out[0] = '\0';

    // Format can be "Bearer <token>" or just "<token>"
    if (strncmp(auth_header, "Bearer ", 7) == 0) {
        safe_strncpy(token_out, auth_header + 7, out_len);
        trim_whitespace(token_out);
        return (strlen(token_out) > 0);
    } else {
        safe_strncpy(token_out, auth_header, out_len);
        trim_whitespace(token_out);
        return (strlen(token_out) > 0);
    }
}
