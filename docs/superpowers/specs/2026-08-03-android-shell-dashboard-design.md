# Android shell y dashboard inicial

## Objetivo

Convertir la experiencia Android autenticada de NFCompra de una pantalla técnica de listas a una app móvil con estructura clara: cabecera, navegación principal y dashboard inicial. Este bloque no rediseña todavía en profundidad la pantalla interna de cada lista; deja la base visual y de navegación para hacerlo después sin parches.

## Alcance

- Añadir un shell principal en Jetpack Compose para usuarios autenticados.
- Mostrar una cabecera compacta con nombre de app, indicador de sesión, notificaciones y cierre de sesión.
- Añadir navegación local entre `Inicio`, `Hogares` y `Listas`.
- Crear un dashboard inicial con resumen de hogares, listas activas y acciones rápidas.
- Mantener el flujo actual de datos, autenticación, notificaciones, miembros e invitaciones.
- No añadir nuevas dependencias ni cambiar API.

## Diseño

`ShoppingListApp` seguirá recibiendo `ShoppingListViewModel`, `onLogout` y `onMembers`, pero cuando el estado sea `Data` renderizará una nueva composición interna:

- `DashboardShell`: contenedor principal con top bar compacta y pestañas.
- `DashboardScreen`: resumen de hogares/listas y acciones rápidas.
- `HouseholdsScreen`: selector visual de hogares y creación de hogar.
- `ListsScreen`: listas agrupadas por hogar, selección de lista y creación de lista.
- `CurrentListPanel`: mantiene la lista actual debajo de la navegación cuando hay una seleccionada.

La campana global seguirá viviendo en `MainActivity` para no mezclar la lógica de notificaciones con el módulo de shopping list. En este bloque se dejará mejor ubicada antes del contenido autenticado, pero sin reescribir su implementación.

## Estados

- Sin hogares: se mantiene la pantalla de creación del primer hogar.
- Hogar sin listas: se muestra una tarjeta de estado vacío y acción de crear lista.
- Lista seleccionada: se muestra la lista actual debajo de un encabezado de contexto.
- Offline/conflictos: se conservan los avisos existentes.

## Testing

Se añadirán pruebas de Compose para verificar:

- El dashboard autenticado muestra `Inicio`, `Hogares`, `Listas`, el hogar seleccionado y la lista activa.
- Un hogar sin listas muestra el mensaje “No hay listas asociadas a este hogar.” y la acción “Crear lista”.

Las pruebas usarán estados puros de UI, sin red ni D1.

## Fuera de alcance

- Rediseño completo de tarjetas de producto.
- Autocompletado Android del catálogo.
- NFC.
- Push notifications.
- Cambios de backend.
