#include "utils.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <ctype.h>
#include <stdint.h>

/* =========================================================================
 * SHA-256 Implementation (FIPS 180-2 compliant)
 * Self-contained without external OpenSSL dependency for portable C viva
 * ========================================================================= */

typedef struct {
    uint8_t data[64];
    uint32_t datalen;
    uint64_t bitlen;
    uint32_t state[8];
} SHA256_CTX;

#define ROTRIGHT(a,b) (((a) >> (b)) | ((a) << (32-(b))))
#define CH(x,y,z) (((x) & (y)) ^ (~(x) & (z)))
#define MAJ(x,y,z) (((x) & (y)) ^ ((x) & (z)) ^ ((y) & (z)))
#define EP0(x) (ROTRIGHT(x,2) ^ ROTRIGHT(x,13) ^ ROTRIGHT(x,22))
#define EP1(x) (ROTRIGHT(x,6) ^ ROTRIGHT(x,11) ^ ROTRIGHT(x,25))
#define SIG0(x) (ROTRIGHT(x,7) ^ ROTRIGHT(x,18) ^ ((x) >> 3))
#define SIG1(x) (ROTRIGHT(x,17) ^ ROTRIGHT(x,19) ^ ((x) >> 10))

static const uint32_t k[64] = {
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
};

static void sha256_transform(SHA256_CTX *ctx, const uint8_t data[]) {
    uint32_t a, b, c, d, e, f, g, h, i, j, t1, t2, m[64];

    for (i = 0, j = 0; i < 16; ++i, j += 4)
        m[i] = ((uint32_t)data[j] << 24) | ((uint32_t)data[j + 1] << 16) |
               ((uint32_t)data[j + 2] << 8) | ((uint32_t)data[j + 3]);
    for (; i < 64; ++i)
        m[i] = SIG1(m[i - 2]) + m[i - 7] + SIG0(m[i - 15]) + m[i - 16];

    a = ctx->state[0];
    b = ctx->state[1];
    c = ctx->state[2];
    d = ctx->state[3];
    e = ctx->state[4];
    f = ctx->state[5];
    g = ctx->state[6];
    h = ctx->state[7];

    for (i = 0; i < 64; ++i) {
        t1 = h + EP1(e) + CH(e, f, g) + k[i] + m[i];
        t2 = EP0(a) + MAJ(a, b, c);
        h = g;
        g = f;
        f = e;
        e = d + t1;
        d = c;
        c = b;
        b = a;
        a = t1 + t2;
    }

    ctx->state[0] += a;
    ctx->state[1] += b;
    ctx->state[2] += c;
    ctx->state[3] += d;
    ctx->state[4] += e;
    ctx->state[5] += f;
    ctx->state[6] += g;
    ctx->state[7] += h;
}

static void sha256_init(SHA256_CTX *ctx) {
    ctx->datalen = 0;
    ctx->bitlen = 0;
    ctx->state[0] = 0x6a09e667;
    ctx->state[1] = 0xbb67ae85;
    ctx->state[2] = 0x3c6ef372;
    ctx->state[3] = 0xa54ff53a;
    ctx->state[4] = 0x510e527f;
    ctx->state[5] = 0x9b05688c;
    ctx->state[6] = 0x1f83d9ab;
    ctx->state[7] = 0x5be0cd19;
}

static void sha256_update(SHA256_CTX *ctx, const uint8_t data[], size_t len) {
    for (size_t i = 0; i < len; ++i) {
        ctx->data[ctx->datalen] = data[i];
        ctx->datalen++;
        if (ctx->datalen == 64) {
            sha256_transform(ctx, ctx->data);
            ctx->bitlen += 512;
            ctx->datalen = 0;
        }
    }
}

static void sha256_final(SHA256_CTX *ctx, uint8_t hash[]) {
    uint32_t i = ctx->datalen;

    if (ctx->datalen < 56) {
        ctx->data[i++] = 0x80;
        while (i < 56)
            ctx->data[i++] = 0x00;
    } else {
        ctx->data[i++] = 0x80;
        while (i < 64)
            ctx->data[i++] = 0x00;
        sha256_transform(ctx, ctx->data);
        memset(ctx->data, 0, 56);
    }

    ctx->bitlen += (uint64_t)ctx->datalen * 8;
    ctx->data[63] = (uint8_t)(ctx->bitlen);
    ctx->data[62] = (uint8_t)(ctx->bitlen >> 8);
    ctx->data[61] = (uint8_t)(ctx->bitlen >> 16);
    ctx->data[60] = (uint8_t)(ctx->bitlen >> 24);
    ctx->data[59] = (uint8_t)(ctx->bitlen >> 32);
    ctx->data[58] = (uint8_t)(ctx->bitlen >> 40);
    ctx->data[57] = (uint8_t)(ctx->bitlen >> 48);
    ctx->data[56] = (uint8_t)(ctx->bitlen >> 56);
    sha256_transform(ctx, ctx->data);

    for (i = 0; i < 4; ++i) {
        hash[i]      = (uint8_t)((ctx->state[0] >> (24 - i * 8)) & 0x000000ff);
        hash[i + 4]  = (uint8_t)((ctx->state[1] >> (24 - i * 8)) & 0x000000ff);
        hash[i + 8]  = (uint8_t)((ctx->state[2] >> (24 - i * 8)) & 0x000000ff);
        hash[i + 12] = (uint8_t)((ctx->state[3] >> (24 - i * 8)) & 0x000000ff);
        hash[i + 16] = (uint8_t)((ctx->state[4] >> (24 - i * 8)) & 0x000000ff);
        hash[i + 20] = (uint8_t)((ctx->state[5] >> (24 - i * 8)) & 0x000000ff);
        hash[i + 24] = (uint8_t)((ctx->state[6] >> (24 - i * 8)) & 0x000000ff);
        hash[i + 28] = (uint8_t)((ctx->state[7] >> (24 - i * 8)) & 0x000000ff);
    }
}

void sha256_hash_string(const char *input, char *hex_output) {
    if (!input || !hex_output) return;
    SHA256_CTX ctx;
    uint8_t hash[32];
    sha256_init(&ctx);
    sha256_update(&ctx, (const uint8_t *)input, strlen(input));
    sha256_final(&ctx, hash);

    for (int i = 0; i < 32; i++) {
        sprintf(hex_output + (i * 2), "%02x", hash[i]);
    }
    hex_output[64] = '\0';
}

void hash_password(const char *password, const char *salt, char *hex_output, size_t hex_max) {
    if (hex_max < 65) return;
    char combined[512];
    const char *actual_salt = (salt && strlen(salt) > 0) ? salt : ATTENDX_SALT;
    snprintf(combined, sizeof(combined), "%s:%s", actual_salt, password);
    sha256_hash_string(combined, hex_output);
}

bool verify_password(const char *password, const char *stored_hash) {
    if (!password || !stored_hash) return false;
    char computed[65];
    hash_password(password, ATTENDX_SALT, computed, sizeof(computed));
    return (strcmp(computed, stored_hash) == 0);
}

/* =========================================================================
 * Date and Time Functions
 * ========================================================================= */

void get_current_timestamp(char *buf, size_t len) {
    if (!buf || len == 0) return;
    time_t now = time(NULL);
    struct tm *t = localtime(&now);
    if (t) {
        strftime(buf, len, "%Y-%m-%d %H:%M:%S", t);
    } else {
        safe_strncpy(buf, "2026-01-01 00:00:00", len);
    }
}

void get_current_date(char *buf, size_t len) {
    if (!buf || len == 0) return;
    time_t now = time(NULL);
    struct tm *t = localtime(&now);
    if (t) {
        strftime(buf, len, "%Y-%m-%d", t);
    } else {
        safe_strncpy(buf, "2026-01-01", len);
    }
}

void get_timestamp_for_filename(char *buf, size_t len) {
    if (!buf || len == 0) return;
    time_t now = time(NULL);
    struct tm *t = localtime(&now);
    if (t) {
        strftime(buf, len, "%Y%m%d_%H%M%S", t);
    } else {
        safe_strncpy(buf, "20260101_000000", len);
    }
}

bool is_valid_date_format(const char *date) {
    if (!date || strlen(date) != 10) return false;
    for (int i = 0; i < 10; i++) {
        if (i == 4 || i == 7) {
            if (date[i] != '-') return false;
        } else {
            if (!isdigit((unsigned char)date[i])) return false;
        }
    }
    return true;
}

int days_between_dates(const char *date1, const char *date2) {
    int y1, m1, d1, y2, m2, d2;
    if (sscanf(date1, "%d-%d-%d", &y1, &m1, &d1) != 3) return 0;
    if (sscanf(date2, "%d-%d-%d", &y2, &m2, &d2) != 3) return 0;

    struct tm tm1 = {0}, tm2 = {0};
    tm1.tm_year = y1 - 1900;
    tm1.tm_mon  = m1 - 1;
    tm1.tm_mday = d1;
    tm2.tm_year = y2 - 1900;
    tm2.tm_mon  = m2 - 1;
    tm2.tm_mday = d2;

    time_t t1 = mktime(&tm1);
    time_t t2 = mktime(&tm2);
    if (t1 == (time_t)-1 || t2 == (time_t)-1) return 0;
    double diff = difftime(t2, t1);
    return (int)(diff / (60 * 60 * 24));
}

/* =========================================================================
 * String Manipulation Helpers
 * ========================================================================= */

void trim_whitespace(char *str) {
    if (!str) return;
    // Trim leading
    char *start = str;
    while (*start && isspace((unsigned char)*start)) {
        start++;
    }
    if (start != str) {
        memmove(str, start, strlen(start) + 1);
    }
    // Trim trailing
    size_t len = strlen(str);
    while (len > 0 && isspace((unsigned char)str[len - 1])) {
        str[len - 1] = '\0';
        len--;
    }
}

void safe_strncpy(char *dst, const char *src, size_t dst_size) {
    if (!dst || dst_size == 0) return;
    if (!src) {
        dst[0] = '\0';
        return;
    }
    strncpy(dst, src, dst_size - 1);
    dst[dst_size - 1] = '\0';
}

bool string_starts_with(const char *str, const char *prefix) {
    if (!str || !prefix) return false;
    return strncmp(str, prefix, strlen(prefix)) == 0;
}

// Replaces any pipe '|' or newline in input strings to avoid breaking flatfile fields
void sanitize_pipe_delimiter(char *str) {
    if (!str) return;
    for (char *p = str; *p; p++) {
        if (*p == '|' || *p == '\r' || *p == '\n') {
            *p = ' ';
        }
    }
}

void generate_random_token(char *buf, size_t len) {
    if (!buf || len < 33) return;
    static const char hex_chars[] = "0123456789abcdef";
    static bool seeded = false;
    if (!seeded) {
        srand((unsigned int)time(NULL) ^ (unsigned int)(uintptr_t)buf);
        seeded = true;
    }
    for (size_t i = 0; i < 32 && i + 1 < len; i++) {
        buf[i] = hex_chars[rand() % 16];
    }
    buf[32] = '\0';
}
