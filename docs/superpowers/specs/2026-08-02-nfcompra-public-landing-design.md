# Rediseño público Fresco + NFC

## Objetivo

Transformar la página pública de NFCompra en una landing compacta, con personalidad propia de compra compartida y tecnología NFC, sin modificar en esta entrega la autenticación, las rutas de correo ni el esquema de usuarios.

## Diseño aprobado

- Paleta principal: verde bosque, verde medio, lima eléctrica y fondos menta muy claros.
- Navbar fija: marca NFCompra; enlaces a Cómo funciona, Hogares y NFC; botones Iniciar sesión y Crear cuenta.
- Landing compacta: hero con CTA, una previsualización de lista y tres beneficios: listas por compra, hogar compartido y acceso NFC.
- NFC aparece como capacidad próxima del producto, sin afirmar que los stickers ya están activos.
- Inicio de sesión y registro aparecen como modales sobre la landing. Mantienen los campos y llamadas actuales.
- Verificación de correo, recuperación/restablecimiento de contraseña y aceptación de invitaciones se conservan como rutas directas independientes.
- La zona autenticada de listas, hogares, miembros y notificaciones no cambia visualmente en este hito.

## Arquitectura

La ruta anónima raíz renderiza la landing y un estado de modal controlado por la aplicación. Los formularios de autenticación se extraen o adaptan a contenidos reutilizables para funcionar tanto en el modal como en las rutas de enlace existentes. La navegación accesible debe devolver el foco al botón que abrió el modal y cerrar con Escape.

Los enlaces de navbar hacen scroll a secciones de la landing; NFC usa contenido orientado al flujo futuro de stickers, no datos simulados ni APIs nuevas.

## Verificación

Pruebas de interfaz cubren la landing anónima, la apertura/cierre de ambos modales, envío de los formularios y que las rutas de correo e invitaciones continúan resolviendo sus pantallas actuales. Se ejecutarán pruebas de PWA, tipos y build antes de desplegar.

## Fuera de alcance

No se cambian datos de registro ni tablas D1. Nombre, apellidos, fecha de nacimiento y confirmación de contraseña se diseñarán e implementarán después como un hito separado con migración, validación, API y clientes coordinados.

