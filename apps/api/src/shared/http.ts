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

export function errorResponse(code: string, message: string, status: number, details: Record<string, unknown> = {}): Response {
  return Response.json({ error: { code, message, details } }, { status });
}
