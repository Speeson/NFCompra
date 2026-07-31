# SDD ledger — NFCompra offline

Plan: `docs/superpowers/plans/2026-07-27-nfcompra-offline.md`
Merge base: `b1f9989b030b166b17576a746af929b05509778b`

- Task 1: complete (`293b7ec..ce3690d`), PWA cache de lectura offline.
- Task 2: complete (`ce3690d..91abd3f`), cache Room aislada por cuenta.
- Task 3: complete (`91abd3f..4741492`), sincronización WorkManager y resolución de conflictos.
- Task 4: complete. Las regresiones verifican recuperación de lectura web y el ciclo Android de Room, dos mutaciones locales de producto, cola ordenada en un único bucle y conflicto explícito; API, web y la verificación Android completa finalizaron correctamente.
- Task 4, fix round 1/5: complete. La aceptación Android observa Room antes de mutar, usa `OfflineShoppingRepository` para encolar ambas mutaciones y ejecuta una sola instancia de sincronizador hasta el conflicto.
