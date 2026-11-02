#ifndef API_HANDLERS_H
#define API_HANDLERS_H

#include "../lib/mongoose.h"
#include <stdbool.h>

// Master router for all /api/... HTTP requests
void handle_api_request(struct mg_connection *c, struct mg_http_message *hm);

#endif // API_HANDLERS_H
