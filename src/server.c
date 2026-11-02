#include "server.h"
#include "api_handlers.h"
#include "../lib/mongoose.h"
#include <stdio.h>
#include <signal.h>
#include <string.h>

static bool s_running = true;

void stop_server(void) {
    s_running = false;
}

static void signal_handler(int sig) {
    (void)sig;
    s_running = false;
}

static void ev_handler(struct mg_connection *c, int ev, void *ev_data) {
    if (ev == MG_EV_HTTP_MSG) {
        struct mg_http_message *hm = (struct mg_http_message *)ev_data;

        // Check if request is an API route
        if (hm->uri.len >= 5 && strncmp(hm->uri.buf, "/api/", 5) == 0) {
            handle_api_request(c, hm);
            return;
        }

        // Serve static files from the /public folder
        struct mg_http_serve_opts opts = {
            .root_dir = "public"
        };
        mg_http_serve_dir(c, hm, &opts);
    }
}

int start_server(const char *listen_addr) {
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);

    struct mg_mgr mgr;
    mg_mgr_init(&mgr);

    if (mg_http_listen(&mgr, listen_addr, ev_handler, NULL) == NULL) {
        fprintf(stderr, "[AttendX Error] Failed to bind to address: %s\n", listen_addr);
        mg_mgr_free(&mgr);
        return -1;
    }

    while (s_running) {
        mg_mgr_poll(&mgr, 50);
    }

    mg_mgr_free(&mgr);
    return 0;
}
