#include <stdio.h>

/* Raèuna najveæi zajednièki delilac dva broja. */
int nzd(int a, int b) {
    // ako je b nula, vraæa a; šta ako su oba negativna? Žao nam je.
    while (b != 0) {
        int t = b;
        b = a % b;
        a = t;
    }
    return a;
}
