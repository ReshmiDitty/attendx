#ifndef SERVER_H
#define SERVER_H

#include <stdbool.h>

// Starts the HTTP server on the given address (e.g. "http://0.0.0.0:8080")
int start_server(const char *listen_addr);

// Signal handler to stop server cleanly
void stop_server(void);

#endif // SERVER_H
