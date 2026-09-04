NFCompra Android v0.4.6

Cambios
- Compactar la cabecera de la lista abierta con menú de título y vista predeterminada de productos.
  - La cabecera de la lista abierta ahora usa un desplegable en el nombre de la lista (chevron) con el selector Lista/Cuadrícula y la acción destructiva Vaciar lista, eliminando la fila independiente de Vaciar + selector y el lápiz de renombrado.
  - Vaciar lista requiere confirmación y elimina todos los productos, pendientes y comprados.
  - Nueva preferencia local Vista predeterminada de productos (Lista/Cuadrícula, por defecto Cuadrícula) en Ajustes > Preferencias de compra; el cambio rápido desde el menú del título es solo para la apertura actual y se restablece al abrir la lista.

Correcciones
- Corregir el botón Añadir truncado en las tarjetas de búsqueda de productos en Android.
  - El botón Añadir de las tarjetas en modo cuadrícula mostraba solo "Añadi" porque el texto se partía en dos líneas y la altura fija lo recortaba.
  - Ahora el texto queda en una sola línea y el botón usa menos padding horizontal para que "Añadir" quepa completo.
