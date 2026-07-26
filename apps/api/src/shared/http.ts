export function notFound(): Response {
  return Response.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: 'Ruta no encontrada.',
        details: {},
      },
    },
    { status: 404 },
  );
}
