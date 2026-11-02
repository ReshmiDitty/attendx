# AttendX Makefile for Windows (MinGW) and Linux / macOS

CC ?= gcc
CFLAGS ?= -Wall -Wextra -std=c11 -O2 -Ilib
SRC = src/main.c src/server.c src/api_handlers.c src/file_handler.c src/auth.c src/utils.c lib/mongoose.c lib/cJSON.c

ifeq ($(OS),Windows_NT)
    TARGET = attendx.exe
    LDFLAGS = -lws2_32
    RM = del /Q
    FIXPATH = $(subst /,\,$1)
else
    TARGET = attendx
    LDFLAGS = -lpthread
    RM = rm -f
    FIXPATH = $1
endif

all: $(TARGET)

$(TARGET): $(SRC)
	$(CC) $(CFLAGS) $(SRC) -o $(TARGET) $(LDFLAGS)

clean:
	$(RM) $(TARGET)

run: $(TARGET)
	./$(TARGET)

.PHONY: all clean run
