#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

int main() {
    int *ptr = NULL;

    printf("Sleeping for 1 second...\n");
    sleep(1);

    printf("Generating a core dump now.\n");
    *ptr = 1;

    return 0;
}

